<script>
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';

  let {
    voiceGender = 'female', // 'female' (Jasmin) | 'male' (Mas Rouf ~50th)
    variant = 'teal', // 'teal' | 'executive' | 'warm'
    isSpeaking = false,
    isListening = false,
    isAudioMuted = false,
    outputVolume = 0
  } = $props();

  let containerEl = $state(null);
  let webglError = $state(false);
  let isDragging = $state(false);
  let textureReady = $state(false);

  // Calibrated normalized UV landmarks per portrait (u: left->right 0..1, v: bottom->top 0..1)
  const LANDMARKS = {
    female: {
      src: '/avatars/jasmin-real.jpg',
      headCenter: [0.5, 0.65],
      nosePos: [0.5, 0.615],
      mouthCenter: [0.5, 0.556],
      mouthRx: 0.070,
      eyeL: [0.425, 0.692],
      eyeR: [0.575, 0.692],
      eyeRx: 0.045,
      eyeRy: 0.022
    },
    male: {
      src: '/avatars/rouf-real.jpg',
      headCenter: [0.5, 0.61],
      nosePos: [0.5, 0.565],
      mouthCenter: [0.5, 0.494],
      mouthRx: 0.072,
      eyeL: [0.438, 0.646],
      eyeR: [0.572, 0.646],
      eyeRx: 0.044,
      eyeRy: 0.022
    }
  };

  let liveState = {
    voiceGender: 'female',
    variant: 'teal',
    isSpeaking: false,
    isListening: false,
    isAudioMuted: false,
    outputVolume: 0
  };

  let uniforms = null;
  let avatarMesh = null;
  let loadedTextures = {};
  let activeGender = null;

  let renderer = null;
  let scene = null;
  let camera = null;
  let animFrameId = null;
  let resizeObserver = null;

  let targetDragYaw = 0;
  let targetDragPitch = 0;
  let currentDragYaw = 0;
  let currentDragPitch = 0;
  let cursorX = 0;
  let cursorY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let baseYawOnDrag = 0;
  let basePitchOnDrag = 0;

  function applyGenderConfig(gender) {
    if (!uniforms) return;
    const cfg = LANDMARKS[gender === 'male' ? 'male' : 'female'];
    uniforms.uHeadCenter.value.set(cfg.headCenter[0], cfg.headCenter[1]);
    uniforms.uNosePos.value.set(cfg.nosePos[0], cfg.nosePos[1]);
    uniforms.uMouthCenter.value.set(cfg.mouthCenter[0], cfg.mouthCenter[1]);
    uniforms.uMouthRx.value = cfg.mouthRx;
    uniforms.uEyeL.value.set(cfg.eyeL[0], cfg.eyeL[1]);
    uniforms.uEyeR.value.set(cfg.eyeR[0], cfg.eyeR[1]);
    uniforms.uEyeRx.value = cfg.eyeRx;
    uniforms.uEyeRy.value = cfg.eyeRy;

    if (loadedTextures[gender]) {
      uniforms.uTex.value = loadedTextures[gender];
      textureReady = true;
    } else if (loadedTextures._loader) {
      textureReady = false;
      loadedTextures._loader.load(
        cfg.src,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          loadedTextures[gender] = tex;
          if (liveState.voiceGender === gender && uniforms) {
            uniforms.uTex.value = tex;
            textureReady = true;
          }
        },
        undefined,
        () => {
          webglError = true;
        }
      );
    }
    activeGender = gender;
  }

  function applyVariantGrade(varName) {
    if (!uniforms) return;
    if (varName === 'executive') {
      uniforms.uGradeTint.value.set(0.95, 0.99, 1.02);
      uniforms.uContrast.value = 1.07;
    } else if (varName === 'warm') {
      uniforms.uGradeTint.value.set(1.04, 1.00, 0.94);
      uniforms.uContrast.value = 1.03;
    } else {
      uniforms.uGradeTint.value.set(1.0, 1.0, 1.0);
      uniforms.uContrast.value = 1.02;
    }
  }

  $effect(() => {
    liveState.voiceGender = voiceGender;
    liveState.variant = variant;
    liveState.isSpeaking = isSpeaking;
    liveState.isListening = isListening;
    liveState.isAudioMuted = isAudioMuted;
    liveState.outputVolume = outputVolume;

    if (uniforms && activeGender !== voiceGender) {
      applyGenderConfig(voiceGender);
    }
    if (uniforms) {
      applyVariantGrade(variant);
    }
  });

  const VERTEX_SHADER = `
    uniform vec2 uHeadCenter;
    uniform vec2 uNosePos;
    uniform float uOpen;
    varying vec2 vUv;
    varying float vDepth;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // Sculptural 3D Bust Depth Relief for realistic 3D parallax & drag rotation
      vec2 hd = (uv - uHeadCenter) / vec2(0.20, 0.27);
      float hR2 = min(1.0, dot(hd, hd));
      float headRelief = 0.24 * pow(max(0.0, 1.0 - hR2), 0.72);

      vec2 nd = (uv - uNosePos) / vec2(0.048, 0.088);
      float noseRelief = 0.085 * exp(-dot(nd, nd) * 1.35);

      float shoulderX = max(0.0, 1.0 - pow((uv.x - 0.5) / 0.45, 2.0));
      float shoulderRelief = 0.16 * smoothstep(0.45, 0.06, uv.y) * shoulderX;

      float jawMotion = uOpen * 0.014 * (1.0 - smoothstep(0.02, 0.18, length(uv - vec2(0.5, 0.48))));
      float depth = -0.04 + headRelief + noseRelief + shoulderRelief + jawMotion;

      // Feather gently toward plane border to prevent harsh silhouette cropping
      float borderFade = (1.0 - smoothstep(0.40, 0.50, abs(uv.x - 0.5))) * (1.0 - smoothstep(0.40, 0.50, abs(uv.y - 0.5)));
      pos.z += depth * (0.35 + 0.65 * borderFade);
      vDepth = depth;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  const FRAGMENT_SHADER = `
    uniform sampler2D uTex;
    uniform vec2 uMouthCenter;
    uniform float uMouthRx;
    uniform vec2 uEyeL;
    uniform vec2 uEyeR;
    uniform float uEyeRx;
    uniform float uEyeRy;
    uniform float uOpen;
    uniform float uRound;
    uniform float uBlink;
    uniform vec3 uGradeTint;
    uniform float uContrast;
    uniform vec2 uLightDir;

    varying vec2 vUv;
    varying float vDepth;

    vec4 renderEyeBlink(vec2 uv, vec4 baseCol, vec2 eyePos) {
      if (uBlink <= 0.015) return baseCol;

      float ex = (uv.x - eyePos.x) / uEyeRx;
      float ey = (uv.y - eyePos.y) / uEyeRy;
      float r2 = ex * ex + ey * ey;
      if (r2 >= 1.0) return baseCol;

      // Sweeping upper lid curve moving cleanly downward from top (+1) toward lower lash (-0.85)
      float lidLine = 0.90 - 1.78 * uBlink * (1.0 - 0.22 * ex * ex);
      if (ey <= lidLine) return baseCol;

      float ovalFeather = 1.0 - smoothstep(0.68, 1.0, r2);
      float edgeSoft = smoothstep(0.0, 0.24, ey - lidLine);

      // Sample authentic upper-eyelid skin right above the eye crease
      vec2 lidSample = vec2(uv.x, eyePos.y + uEyeRy * (1.02 + 0.14 * max(0.0, ey)));
      vec3 lidSkin = texture2D(uTex, lidSample).rgb;

      // Dark lash crease along the closing eyelid margin
      float lashLine = exp(-pow((ey - lidLine) * 8.5, 2.0)) * (1.0 - smoothstep(0.45, 0.98, abs(ex)));
      lidSkin = mix(lidSkin, vec3(0.09, 0.06, 0.05), lashLine * 0.72);

      float blendAmt = ovalFeather * edgeSoft * uBlink;
      return vec4(mix(baseCol.rgb, lidSkin, blendAmt), baseCol.a);
    }

    void main() {
      vec2 uv = vUv;
      vec2 sampleUV = uv;

      // --- 1. REAL-TIME PHOTOREALISTIC LIP-SYNC & JAW DEFORMATION ---
      float dx = uv.x - uMouthCenter.x;
      float nx = abs(dx) / uMouthRx;
      float arcShape = pow(max(0.0, 1.0 - min(1.0, nx * nx)), 0.70);
      float seamY = uMouthCenter.y + 0.0085 * min(1.2, nx * nx);

      float upGap = uOpen * 0.0055 * arcShape;
      float downGap = uOpen * 0.025 * arcShape;
      float yTop = seamY + upGap;
      float yBot = seamY - downGap;

      // Horizontal lip corner pinch for rounded "O/U" vowels
      float hZone = (1.0 - smoothstep(0.20, 1.05, nx)) * (1.0 - smoothstep(0.0, 0.060, abs(uv.y - seamY)));
      sampleUV.x -= dx * 0.085 * uRound * uOpen * hZone;

      float inCavity = 0.0;
      float cavityTY = 0.5;

      if (uOpen > 0.012 && uv.y > yBot && uv.y < yTop && nx < 1.0) {
        inCavity = smoothstep(0.0, 0.0026, uv.y - yBot) * smoothstep(0.0, 0.0026, yTop - uv.y);
        cavityTY = (uv.y - yBot) / max(0.0001, (yTop - yBot));
      } else if (uv.y >= yTop) {
        float distUp = uv.y - yTop;
        float fallUp = 1.0 - smoothstep(0.0, 0.036, distUp);
        sampleUV.y -= upGap * fallUp;
      } else {
        float distDown = yBot - uv.y;
        float fallDown = 1.0 - smoothstep(0.0, 0.115, distDown);
        sampleUV.y += downGap * fallDown;
      }

      vec4 texCol = texture2D(uTex, clamp(sampleUV, vec2(0.002), vec2(0.998)));

      // Paint shaded interior oral cavity & natural upper teeth highlight inside open lips
      if (inCavity > 0.001) {
        vec3 deepMouth = vec3(0.032, 0.007, 0.009);
        float tongueMask = (1.0 - smoothstep(0.08, 0.45, cavityTY)) * (1.0 - smoothstep(0.15, 0.70, nx));
        vec3 oralCol = mix(deepMouth, vec3(0.12, 0.032, 0.038), tongueMask * 0.58);

        // Soft upper teeth row curving naturally inside center gap (in linear light space)
        float openVis = smoothstep(0.14, 0.36, uOpen);
        float teethHoriz = 1.0 - smoothstep(0.28, 0.68, nx);
        float teethVert = smoothstep(0.50, 0.64, cavityTY) * (1.0 - smoothstep(0.84, 0.96, cavityTY));
        vec3 teethColor = vec3(0.62, 0.55, 0.48) * (0.95 - 0.24 * nx * nx);

        // Soft upper-lip cast shadow fading teeth cleanly near corners and top gumline
        float lipShadow = smoothstep(0.64, 0.98, cavityTY);
        teethColor *= (1.0 - 0.48 * lipShadow) * arcShape;

        oralCol = mix(oralCol, teethColor, openVis * teethHoriz * teethVert * 0.88);
        texCol.rgb = mix(texCol.rgb, oralCol, inCavity);
      }

      // --- 2. NATURAL EYELID BLINK ---
      texCol = renderEyeBlink(uv, texCol, uEyeL);
      texCol = renderEyeBlink(uv, texCol, uEyeR);

      // --- 3. SUBTLE STUDIO COLOR GRADE & 3D DEPTH SHADING ---
      vec3 graded = (texCol.rgb - 0.25) * uContrast + 0.25;
      graded *= uGradeTint;
      float rimLight = clamp(dot(vec2(uv.x - 0.5, uv.y - 0.55), uLightDir), -0.04, 0.05);
      graded += vec3(rimLight * 0.22 * max(0.0, vDepth));

      gl_FragColor = vec4(clamp(graded, 0.0, 1.0), texCol.a);
      #include <colorspace_fragment>
    }
  `;

  onMount(() => {
    if (!containerEl) return;

    try {
      scene = new THREE.Scene();
      const width = containerEl.clientWidth || 320;
      const height = containerEl.clientHeight || 320;

      camera = new THREE.PerspectiveCamera(27, width / height, 0.1, 20);
      camera.position.set(0, 0, 4.45);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      containerEl.innerHTML = '';
      containerEl.appendChild(renderer.domElement);

      const loader = new THREE.TextureLoader();
      loadedTextures._loader = loader;

      const initCfg = LANDMARKS[liveState.voiceGender === 'male' ? 'male' : 'female'];
      const placeholderTex = new THREE.DataTexture(new Uint8Array([242, 246, 245, 255]), 1, 1);
      placeholderTex.needsUpdate = true;

      uniforms = {
        uTex: { value: placeholderTex },
        uHeadCenter: { value: new THREE.Vector2(initCfg.headCenter[0], initCfg.headCenter[1]) },
        uNosePos: { value: new THREE.Vector2(initCfg.nosePos[0], initCfg.nosePos[1]) },
        uMouthCenter: { value: new THREE.Vector2(initCfg.mouthCenter[0], initCfg.mouthCenter[1]) },
        uMouthRx: { value: initCfg.mouthRx },
        uEyeL: { value: new THREE.Vector2(initCfg.eyeL[0], initCfg.eyeL[1]) },
        uEyeR: { value: new THREE.Vector2(initCfg.eyeR[0], initCfg.eyeR[1]) },
        uEyeRx: { value: initCfg.eyeRx },
        uEyeRy: { value: initCfg.eyeRy },
        uOpen: { value: 0 },
        uRound: { value: 0 },
        uBlink: { value: 0 },
        uGradeTint: { value: new THREE.Vector3(1, 1, 1) },
        uContrast: { value: 1.02 },
        uLightDir: { value: new THREE.Vector2(-0.5, 0.6) }
      };

      const geo = new THREE.PlaneGeometry(2.38, 2.38, 72, 72);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms
      });
      avatarMesh = new THREE.Mesh(geo, mat);
      scene.add(avatarMesh);

      applyGenderConfig(liveState.voiceGender);
      applyVariantGrade(liveState.variant);

      // Preload opposite persona portrait cleanly so switching voice is instant
      const otherGender = liveState.voiceGender === 'male' ? 'female' : 'male';
      loader.load(LANDMARKS[otherGender].src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        loadedTextures[otherGender] = tex;
      });

      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.max(120, Math.floor(entry.contentRect.width));
          const h = Math.max(120, Math.floor(entry.contentRect.height));
          if (renderer && camera) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
          }
        }
      });
      resizeObserver.observe(containerEl);

      let smoothOpen = 0;
      let nextBlinkAt = 2.1;
      let blinkProgress = 0;
      let lastTime = performance.now();

      const animate = () => {
        animFrameId = requestAnimationFrame(animate);
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        const t = now * 0.001;

        currentDragYaw += (targetDragYaw - currentDragYaw) * 0.14;
        currentDragPitch += (targetDragPitch - currentDragPitch) * 0.14;
        if (!isDragging) {
          targetDragYaw *= 0.985;
          targetDragPitch *= 0.985;
        }

        const activeSpeech = liveState.isSpeaking && !liveState.isAudioMuted;
        const rawVol = liveState.isAudioMuted ? 0 : liveState.outputVolume;

        let targetOpen = 0;
        let roundness = 0.25;
        if (activeSpeech) {
          const syllableWave =
            0.46 +
            0.28 * Math.sin(t * 15.8) +
            0.16 * Math.sin(t * 24.1 + 0.8) +
            0.10 * Math.cos(t * 9.3);
          const volBoost = rawVol > 0.02 ? Math.min(1, rawVol * 2.8) : 0.78;
          targetOpen = Math.min(1, Math.max(0.10, syllableWave * volBoost));
          roundness = 0.5 + 0.5 * Math.sin(t * 10.6);
        } else if (rawVol > 0.03) {
          targetOpen = Math.min(0.9, rawVol * 2.5);
        }

        smoothOpen += (targetOpen - smoothOpen) * (activeSpeech ? 0.36 : 0.24);
        uniforms.uOpen.value = smoothOpen;
        uniforms.uRound.value = roundness;

        // Subtle periodic eyelid blink
        if (t >= nextBlinkAt && blinkProgress === 0) {
          blinkProgress = 0.001;
        }
        let blinkAmt = 0;
        if (blinkProgress > 0) {
          blinkProgress += dt * 7.2;
          blinkAmt = Math.sin(Math.min(1, blinkProgress) * Math.PI);
          if (blinkProgress >= 1) {
            blinkProgress = 0;
            nextBlinkAt = t + 2.8 + Math.random() * 2.6;
          }
        }
        uniforms.uBlink.value = blinkAmt;

        if (avatarMesh) {
          const breathY = Math.sin(t * 1.6) * 0.010;
          const speakNod = activeSpeech ? Math.sin(t * 3.8) * 0.024 : Math.sin(t * 1.0) * 0.008;
          const listenTilt = liveState.isListening && !activeSpeech ? 0.032 : 0;

          const targetYaw =
            currentDragYaw * 0.42 +
            cursorX * 0.14 +
            (activeSpeech ? Math.sin(t * 1.9) * 0.028 : Math.sin(t * 0.65) * 0.012);
          const targetPitch = currentDragPitch * 0.35 + cursorY * 0.09 + speakNod + listenTilt;

          avatarMesh.rotation.y += (targetYaw - avatarMesh.rotation.y) * 0.14;
          avatarMesh.rotation.x += (targetPitch - avatarMesh.rotation.x) * 0.14;
          avatarMesh.rotation.z =
            liveState.isListening && !activeSpeech
              ? Math.sin(t * 0.7) * 0.016 + 0.018
              : activeSpeech
                ? Math.sin(t * 2.2) * 0.014
                : 0;
          avatarMesh.position.y = breathY;

          uniforms.uLightDir.value.set(-0.5 + cursorX * 0.4, 0.6 - cursorY * 0.3);
        }

        renderer.render(scene, camera);
      };

      animate();
    } catch (err) {
      console.warn('Photoreal WebGL fallback active:', err?.message || err);
      webglError = true;
    }
  });

  onDestroy(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    resizeObserver?.disconnect();
    for (const key of Object.keys(loadedTextures)) {
      if (key !== '_loader') loadedTextures[key]?.dispose?.();
    }
    avatarMesh?.geometry?.dispose?.();
    avatarMesh?.material?.dispose?.();
    renderer?.dispose?.();
    renderer = null;
  });

  function handlePointerDown(e) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    baseYawOnDrag = targetDragYaw;
    basePitchOnDrag = targetDragPitch;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    cursorX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    cursorY = ((e.clientY - rect.top) / rect.height - 0.5) * 1.4;

    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    targetDragYaw = Math.max(-0.55, Math.min(0.55, baseYawOnDrag + dx * 0.008));
    targetDragPitch = Math.max(-0.30, Math.min(0.30, basePitchOnDrag + dy * 0.006));
  }

  function handlePointerUp() {
    isDragging = false;
  }

  function handleDoubleClick() {
    targetDragYaw = 0;
    targetDragPitch = 0;
  }
</script>

{#if webglError}
  <div
    data-testid="avatar-3d-fallback"
    class="w-full h-full relative overflow-hidden select-none"
    role="img"
    aria-label={voiceGender === 'male'
      ? 'Avatar Digital Human Mas Rouf berkopiah dan batik'
      : 'Avatar Digital Human Jasmin berhijab sholehah'}
  >
    <img
      src={voiceGender === 'male' ? '/avatars/rouf-real.jpg' : '/avatars/jasmin-real.jpg'}
      alt={voiceGender === 'male' ? 'Mas Rouf' : 'Jasmin'}
      class="w-full h-full object-cover object-top transition-transform duration-300 {isSpeaking && !isAudioMuted ? 'scale-[1.03]' : ''}"
    />
  </div>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    role="img"
    aria-label={voiceGender === 'male'
      ? 'Avatar Digital Human realistis Mas Rouf interaktif'
      : 'Avatar Digital Human realistis Jasmin interaktif'}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    onpointerleave={() => {
      cursorX = 0;
      cursorY = 0;
      isDragging = false;
    }}
    ondblclick={handleDoubleClick}
    class="relative w-full h-full select-none touch-none {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
    title="Geser untuk memutar sudut 3D • Klik dua kali untuk reset"
  >
    <div bind:this={containerEl} data-testid="avatar-3d-canvas-host" class="w-full h-full"></div>
    {#if !textureReady}
      <img
        src={voiceGender === 'male' ? '/avatars/rouf-real.jpg' : '/avatars/jasmin-real.jpg'}
        alt=""
        class="pointer-events-none absolute inset-0 w-full h-full object-cover object-top"
      />
    {/if}
  </div>
{/if}
