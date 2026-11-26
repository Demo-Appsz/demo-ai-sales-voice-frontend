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

  const LANDMARKS = {
    female: {
      atlasSrc: '/avatars/jasmin-atlas.jpg',
      maskSrc: '/avatars/jasmin-mask.jpg',
      bgSrc: '/avatars/jasmin-bg.jpg',
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
      maskSrc: '/avatars/rouf-mask.jpg',
      bgSrc: '/avatars/rouf-bg.jpg',
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

  let fgUniforms = null;
  let bgUniforms = null;
  let bgMesh = null;
  let fgMesh = null;
  let fgGroup = null;
  let loadedBundles = {};
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

  function loadBundle(loader, gender, onReady) {
    const cfg = LANDMARKS[gender === 'male' ? 'male' : 'female'];
    const bundle = { atlas: null, mask: null, bg: null, failed: false };
    let remaining = 3;

    const finishOne = () => {
      remaining -= 1;
      if (remaining === 0 && !bundle.failed) {
        loadedBundles[gender] = bundle;
        onReady?.(bundle);
      }
    };

    const failOne = () => {
      if (!bundle.failed) {
        bundle.failed = true;
        webglError = true;
      }
    };

    loader.load(
      cfg.atlasSrc,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        bundle.atlas = tex;
        finishOne();
      },
      undefined,
      failOne
    );

    loader.load(
      cfg.maskSrc,
      (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        bundle.mask = tex;
        finishOne();
      },
      undefined,
      failOne
    );

    loader.load(
      cfg.bgSrc,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        bundle.bg = tex;
        finishOne();
      },
      undefined,
      failOne
    );
  }

  function applyBundleToUniforms(bundle, cfg) {
    if (!fgUniforms || !bgUniforms || !bundle) return;
    fgUniforms.uAtlas.value = bundle.atlas;
    fgUniforms.uMask.value = bundle.mask;
    bgUniforms.uBgTex.value = bundle.bg;
    fgUniforms.uHeadCenter.value.set(cfg.headCenter[0], cfg.headCenter[1]);
    fgUniforms.uNosePos.value.set(cfg.nosePos[0], cfg.nosePos[1]);
    fgUniforms.uMouthOval.value.set(cfg.mouthOval[0], cfg.mouthOval[1], cfg.mouthOval[2], cfg.mouthOval[3]);
    fgUniforms.uEyeL.value.set(cfg.eyeL[0], cfg.eyeL[1]);
    fgUniforms.uEyeR.value.set(cfg.eyeR[0], cfg.eyeR[1]);
    fgUniforms.uEyeRx.value = cfg.eyeRx;
    fgUniforms.uEyeRy.value = cfg.eyeRy;
    textureReady = true;
  }

  function applyGenderConfig(gender) {
    if (!fgUniforms || !bgUniforms) return;
    const cfg = LANDMARKS[gender === 'male' ? 'male' : 'female'];
    activeGender = gender;

    if (loadedBundles[gender]) {
      applyBundleToUniforms(loadedBundles[gender], cfg);
    } else if (loadedBundles._loader) {
      textureReady = false;
      loadBundle(loadedBundles._loader, gender, (bundle) => {
        if (liveState.voiceGender === gender) {
          applyBundleToUniforms(bundle, cfg);
        }
      });
    }
  }

  function applyVariantGrade(varName) {
    if (!fgUniforms || !bgUniforms) return;
    if (varName === 'executive') {
      fgUniforms.uGradeTint.value.set(0.95, 0.99, 1.02);
      fgUniforms.uContrast.value = 1.05;
      bgUniforms.uGradeTint.value.set(0.95, 0.99, 1.02);
      bgUniforms.uContrast.value = 1.05;
    } else if (varName === 'warm') {
      fgUniforms.uGradeTint.value.set(1.03, 1.00, 0.94);
      fgUniforms.uContrast.value = 1.02;
      bgUniforms.uGradeTint.value.set(1.03, 1.00, 0.94);
      bgUniforms.uContrast.value = 1.02;
    } else {
      fgUniforms.uGradeTint.value.set(1.0, 1.0, 1.0);
      fgUniforms.uContrast.value = 1.0;
      bgUniforms.uGradeTint.value.set(1.0, 1.0, 1.0);
      bgUniforms.uContrast.value = 1.0;
    }
  }

  $effect(() => {
    liveState.voiceGender = voiceGender;
    liveState.variant = variant;
    liveState.isSpeaking = isSpeaking;
    liveState.isListening = isListening;
    liveState.isAudioMuted = isAudioMuted;
    liveState.outputVolume = outputVolume;

    if (fgUniforms && activeGender !== voiceGender) {
      applyGenderConfig(voiceGender);
    }
    if (fgUniforms) {
      applyVariantGrade(variant);
    }
  });

  // Stationary background shader (NEVER rotates or shifts)
  const BG_VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const BG_FRAGMENT_SHADER = `
    uniform sampler2D uBgTex;
    uniform vec3 uGradeTint;
    uniform float uContrast;
    varying vec2 vUv;

    void main() {
      vec4 bg = texture2D(uBgTex, vUv);
      vec3 graded = (bg.rgb - 0.25) * uContrast + 0.25;
      graded *= uGradeTint;
      gl_FragColor = vec4(clamp(graded, 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
    }
  `;

  // Foreground person bust 3D relief vertex shader (pinned at chest floor so bottom never shows gap)
  const FG_VERTEX_SHADER = `
    uniform vec2 uHeadCenter;
    uniform vec2 uNosePos;
    uniform float uOpen;
    varying vec2 vUv;
    varying float vDepth;

    void main() {
      vUv = uv;
      vec3 pos = position;

      vec2 hd = (uv - uHeadCenter) / vec2(0.19, 0.26);
      float hR2 = min(1.0, dot(hd, hd));
      float headRelief = 0.22 * pow(max(0.0, 1.0 - hR2), 0.72);

      vec2 nd = (uv - uNosePos) / vec2(0.048, 0.088);
      float noseRelief = 0.08 * exp(-dot(nd, nd) * 1.35);

      float shoulderX = max(0.0, 1.0 - pow((uv.x - 0.5) / 0.44, 2.0));
      float shoulderRelief = 0.14 * smoothstep(0.45, 0.06, uv.y) * shoulderX;

      float jawMotion = uOpen * 0.012 * (1.0 - smoothstep(0.02, 0.18, length(uv - vec2(0.5, 0.48))));
      float depth = headRelief + noseRelief + shoulderRelief + jawMotion;

      pos.z += depth;
      vDepth = depth;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  // Foreground person bust fragment shader with cutout alpha + 2x2 real viseme & blink blending
  const FG_FRAGMENT_SHADER = `
    uniform sampler2D uAtlas;
    uniform sampler2D uMask;
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
      float silhouetteAlpha = smoothstep(0.12, 0.92, texture2D(uMask, uv).r);
      if (silhouetteAlpha <= 0.01) discard;

      vec4 baseCol = sampleTile(uv, vec2(0.0, 0.5));
      vec3 finalRgb = baseCol.rgb;

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

      vec3 graded = (finalRgb - 0.25) * uContrast + 0.25;
      graded *= uGradeTint;
      float rimLight = clamp(dot(vec2(uv.x - 0.5, uv.y - 0.55), uLightDir), -0.04, 0.05);
      graded += vec3(rimLight * 0.20 * max(0.0, vDepth));

      gl_FragColor = vec4(clamp(graded, 0.0, 1.0), silhouetteAlpha);
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
      loadedBundles._loader = loader;

      const initCfg = LANDMARKS[liveState.voiceGender === 'male' ? 'male' : 'female'];
      const placeholderTex = new THREE.DataTexture(new Uint8Array([240, 244, 243, 255]), 1, 1);
      placeholderTex.needsUpdate = true;

      // 1. LOCKED STATIC BACKGROUND LAYER (zero rotation, zero movement)
      bgUniforms = {
        uBgTex: { value: placeholderTex },
        uGradeTint: { value: new THREE.Vector3(1, 1, 1) },
        uContrast: { value: 1.0 }
      };
      const bgGeo = new THREE.PlaneGeometry(2.38, 2.38, 1, 1);
      const bgMat = new THREE.ShaderMaterial({
        vertexShader: BG_VERTEX_SHADER,
        fragmentShader: BG_FRAGMENT_SHADER,
        uniforms: bgUniforms,
        depthWrite: false
      });
      bgMesh = new THREE.Mesh(bgGeo, bgMat);
      bgMesh.position.set(0, 0, -0.35);
      // Match camera frustum slightly scaled back so perspective lines up with foreground plane
      const bgScale = (4.45 - -0.35) / 4.45;
      bgMesh.scale.set(bgScale, bgScale, 1);
      scene.add(bgMesh);

      // 2. INTERACTIVE FOREGROUND HUMAN BUST LAYER (pivoted cleanly near chest floor so shoulders stay anchored!)
      fgUniforms = {
        uAtlas: { value: placeholderTex },
        uMask: { value: placeholderTex },
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

      // Anchor pivot near bottom of chest (y = -0.82) so rotating head leaves torso bottom flush
      fgGroup = new THREE.Group();
      fgGroup.position.set(0, -0.82, 0);
      scene.add(fgGroup);

      const fgGeo = new THREE.PlaneGeometry(2.38, 2.38, 72, 72);
      const fgMat = new THREE.ShaderMaterial({
        vertexShader: FG_VERTEX_SHADER,
        fragmentShader: FG_FRAGMENT_SHADER,
        uniforms: fgUniforms,
        transparent: true
      });
      fgMesh = new THREE.Mesh(fgGeo, fgMat);
      fgMesh.position.set(0, 0.82, 0);
      fgGroup.add(fgMesh);

      applyGenderConfig(liveState.voiceGender);
      applyVariantGrade(liveState.variant);

      const otherGender = liveState.voiceGender === 'male' ? 'female' : 'male';
      loadBundle(loader, otherGender, null);

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
        fgUniforms.uOpen.value = smoothOpen;

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
        fgUniforms.uBlink.value = blinkAmt;

        // Animate ONLY the foreground person group (background stays 100% frozen!)
        if (fgGroup) {
          const breathDown = Math.sin(t * 1.6) * 0.006 - 0.006; // subtle downward-safe breath so chest floor never lifts
          const speakNod = activeSpeech ? Math.sin(t * 3.8) * 0.022 : Math.sin(t * 1.0) * 0.008;
          const listenTilt = liveState.isListening && !activeSpeech ? 0.028 : 0;

          const targetYaw =
            currentDragYaw * 0.42 +
            cursorX * 0.13 +
            (activeSpeech ? Math.sin(t * 1.9) * 0.026 : Math.sin(t * 0.65) * 0.010);
          const targetPitch = currentDragPitch * 0.32 + cursorY * 0.08 + speakNod + listenTilt;

          fgGroup.rotation.y += (targetYaw - fgGroup.rotation.y) * 0.14;
          fgGroup.rotation.x += (targetPitch - fgGroup.rotation.x) * 0.14;
          fgGroup.rotation.z =
            liveState.isListening && !activeSpeech
              ? Math.sin(t * 0.7) * 0.015 + 0.016
              : activeSpeech
                ? Math.sin(t * 2.2) * 0.012
                : 0;
          fgGroup.position.y = -0.82 + breathDown;

          fgUniforms.uLightDir.value.set(-0.5 + cursorX * 0.4, 0.6 - cursorY * 0.3);
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
    for (const key of Object.keys(loadedBundles)) {
      if (key !== '_loader') {
        loadedBundles[key]?.atlas?.dispose?.();
        loadedBundles[key]?.mask?.dispose?.();
        loadedBundles[key]?.bg?.dispose?.();
      }
    }
    bgMesh?.geometry?.dispose?.();
    bgMesh?.material?.dispose?.();
    fgMesh?.geometry?.dispose?.();
    fgMesh?.material?.dispose?.();
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
      src={voiceGender === 'male' ? '/avatars/rouf-bg.jpg' : '/avatars/jasmin-bg.jpg'}
      alt=""
      class="absolute inset-0 w-full h-full object-cover"
    />
    <img
      src={voiceGender === 'male' ? '/avatars/rouf-real.jpg' : '/avatars/jasmin-real.jpg'}
      alt={voiceGender === 'male' ? 'Mas Rouf' : 'Jasmin'}
      class="relative w-full h-full object-cover object-top transition-transform duration-300 {isSpeaking && !isAudioMuted ? 'scale-[1.03]' : ''}"
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
