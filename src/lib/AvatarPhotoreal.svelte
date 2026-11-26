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
      atlasSrc: '/avatars/jasmin-atlas.jpg',
      fallbackSrc: '/avatars/jasmin-real.jpg',
      headCenter: [0.5, 0.65],
      nosePos: [0.5, 0.615],
      mouthOval: [0.5, 0.51, 0.14, 0.125],
      eyeL: [0.425, 0.692],
      eyeR: [0.575, 0.692],
      eyeRx: 0.068,
      eyeRy: 0.042
    },
    male: {
      atlasSrc: '/avatars/rouf-atlas.jpg',
      fallbackSrc: '/avatars/rouf-real.jpg',
      headCenter: [0.5, 0.61],
      nosePos: [0.5, 0.565],
      mouthOval: [0.5, 0.445, 0.14, 0.135],
      eyeL: [0.438, 0.646],
      eyeR: [0.572, 0.646],
      eyeRx: 0.068,
      eyeRy: 0.042
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
    uniforms.uMouthOval.value.set(cfg.mouthOval[0], cfg.mouthOval[1], cfg.mouthOval[2], cfg.mouthOval[3]);
    uniforms.uEyeL.value.set(cfg.eyeL[0], cfg.eyeL[1]);
    uniforms.uEyeR.value.set(cfg.eyeR[0], cfg.eyeR[1]);
    uniforms.uEyeRx.value = cfg.eyeRx;
    uniforms.uEyeRy.value = cfg.eyeRy;

    if (loadedTextures[gender]) {
      uniforms.uAtlas.value = loadedTextures[gender];
      textureReady = true;
    } else if (loadedTextures._loader) {
      textureReady = false;
      loadedTextures._loader.load(
        cfg.atlasSrc,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          loadedTextures[gender] = tex;
          if (liveState.voiceGender === gender && uniforms) {
            uniforms.uAtlas.value = tex;
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
      uniforms.uContrast.value = 1.05;
    } else if (varName === 'warm') {
      uniforms.uGradeTint.value.set(1.03, 1.00, 0.94);
      uniforms.uContrast.value = 1.02;
    } else {
      uniforms.uGradeTint.value.set(1.0, 1.0, 1.0);
      uniforms.uContrast.value = 1.0;
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

      float jawMotion = uOpen * 0.012 * (1.0 - smoothstep(0.02, 0.18, length(uv - vec2(0.5, 0.48))));
      float depth = -0.04 + headRelief + noseRelief + shoulderRelief + jawMotion;

      float borderFade = (1.0 - smoothstep(0.40, 0.50, abs(uv.x - 0.5))) * (1.0 - smoothstep(0.40, 0.50, abs(uv.y - 0.5)));
      pos.z += depth * (0.35 + 0.65 * borderFade);
      vDepth = depth;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  // 2x2 Atlas Layout (PIL Top-Left -> WebGL flipY=true):
  // TL (0.0, 0.5) = CLOSED  | TR (0.5, 0.5) = MID
  // BL (0.0, 0.0) = OPEN    | BR (0.5, 0.0) = BLINK
  const FRAGMENT_SHADER = `
    uniform sampler2D uAtlas;
    uniform vec4 uMouthOval;
    uniform vec2 uEyeL;
    uniform vec2 uEyeR;
    uniform float uEyeRx;
    uniform float uEyeRy;
    uniform float uOpen;
    uniform float uBlink;
    uniform vec3 uGradeTint;
    uniform float uContrast;
    uniform vec2 uLightDir;

    varying vec2 vUv;
    varying float vDepth;

    vec4 sampleTile(vec2 uv, vec2 offset) {
      vec2 clamped = clamp(uv * 0.5 + offset, offset + vec2(0.002), offset + vec2(0.498));
      return texture2D(uAtlas, clamped);
    }

    float ellipseWeight(vec2 uv, vec2 center, float rx, float ry) {
      vec2 d = (uv - center) / vec2(rx, ry);
      return 1.0 - smoothstep(0.55, 1.0, dot(d, d));
    }

    void main() {
      vec2 uv = vUv;

      // Always sample base pixel-locked portrait cleanly
      vec4 baseCol = sampleTile(uv, vec2(0.0, 0.5));
      vec3 finalRgb = baseCol.rgb;

      // 1. REAL PHOTOGRAPHIC VISEME LIP-SYNC BLENDING (mouth + chin oval)
      if (uOpen > 0.008) {
        float mMask = ellipseWeight(uv, uMouthOval.xy, uMouthOval.z, uMouthOval.w);
        if (mMask > 0.002) {
          vec3 mouthRgb;
          if (uOpen <= 0.45) {
            vec4 midCol = sampleTile(uv, vec2(0.5, 0.5));
            mouthRgb = mix(baseCol.rgb, midCol.rgb, uOpen / 0.45);
          } else {
            vec4 midCol = sampleTile(uv, vec2(0.5, 0.5));
            vec4 openCol = sampleTile(uv, vec2(0.0, 0.0));
            mouthRgb = mix(midCol.rgb, openCol.rgb, clamp((uOpen - 0.45) / 0.55, 0.0, 1.0));
          }
          finalRgb = mix(finalRgb, mouthRgb, mMask);
        }
      }

      // 2. REAL PHOTOGRAPHIC EYELID BLINK BLENDING (eye ovals)
      if (uBlink > 0.01) {
        float eyeMask = max(
          ellipseWeight(uv, uEyeL, uEyeRx, uEyeRy),
          ellipseWeight(uv, uEyeR, uEyeRx, uEyeRy)
        );
        if (eyeMask > 0.002) {
          vec4 blinkCol = sampleTile(uv, vec2(0.5, 0.0));
          finalRgb = mix(finalRgb, blinkCol.rgb, eyeMask * uBlink);
        }
      }

      // 3. STUDIO COLOR GRADE & 3D DEPTH SHADING + sRGB OUTPUT
      vec3 graded = (finalRgb - 0.25) * uContrast + 0.25;
      graded *= uGradeTint;
      float rimLight = clamp(dot(vec2(uv.x - 0.5, uv.y - 0.55), uLightDir), -0.04, 0.05);
      graded += vec3(rimLight * 0.20 * max(0.0, vDepth));

      gl_FragColor = vec4(clamp(graded, 0.0, 1.0), baseCol.a);
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
        uAtlas: { value: placeholderTex },
        uHeadCenter: { value: new THREE.Vector2(initCfg.headCenter[0], initCfg.headCenter[1]) },
        uNosePos: { value: new THREE.Vector2(initCfg.nosePos[0], initCfg.nosePos[1]) },
        uMouthOval: {
          value: new THREE.Vector4(
            initCfg.mouthOval[0],
            initCfg.mouthOval[1],
            initCfg.mouthOval[2],
            initCfg.mouthOval[3]
          )
        },
        uEyeL: { value: new THREE.Vector2(initCfg.eyeL[0], initCfg.eyeL[1]) },
        uEyeR: { value: new THREE.Vector2(initCfg.eyeR[0], initCfg.eyeR[1]) },
        uEyeRx: { value: initCfg.eyeRx },
        uEyeRy: { value: initCfg.eyeRy },
        uOpen: { value: 0 },
        uBlink: { value: 0 },
        uGradeTint: { value: new THREE.Vector3(1, 1, 1) },
        uContrast: { value: 1.0 },
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

      // Background preload opposite persona atlas for instant voice switching
      const otherGender = liveState.voiceGender === 'male' ? 'female' : 'male';
      loader.load(LANDMARKS[otherGender].atlasSrc, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
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
        if (activeSpeech) {
          const syllableWave =
            0.46 +
            0.30 * Math.sin(t * 15.6) +
            0.16 * Math.sin(t * 23.7 + 0.8) +
            0.08 * Math.cos(t * 9.1);
          const volBoost = rawVol > 0.02 ? Math.min(1, rawVol * 2.8) : 0.85;
          targetOpen = Math.min(1, Math.max(0.12, syllableWave * volBoost));
        } else if (rawVol > 0.03) {
          targetOpen = Math.min(0.95, rawVol * 2.6);
        }

        smoothOpen += (targetOpen - smoothOpen) * (activeSpeech ? 0.38 : 0.25);
        uniforms.uOpen.value = smoothOpen;

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
