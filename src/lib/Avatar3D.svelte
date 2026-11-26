<script>
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';

  let {
    voiceGender = 'female', // 'female' (Jasmin) | 'male' (Mas Rouf 50th)
    variant = 'teal', // 'teal' | 'executive' | 'warm'
    isSpeaking = false,
    isListening = false,
    isAudioMuted = false,
    outputVolume = 0
  } = $props();

  let containerEl = $state(null);
  let webglError = $state(false);
  let isDragging = $state(false);

  // Latest reactive values read by animation loop
  let liveState = {
    voiceGender: 'female',
    variant: 'teal',
    isSpeaking: false,
    isListening: false,
    isAudioMuted: false,
    outputVolume: 0
  };

  $effect(() => {
    liveState.voiceGender = voiceGender;
    liveState.variant = variant;
    liveState.isSpeaking = isSpeaking;
    liveState.isListening = isListening;
    liveState.isAudioMuted = isAudioMuted;
    liveState.outputVolume = outputVolume;

    if (rebuildAvatarFn && (lastBuiltGender !== voiceGender || lastBuiltVariant !== variant)) {
      rebuildAvatarFn();
    }
  });

  let renderer = null;
  let scene = null;
  let camera = null;
  let animFrameId = null;
  let resizeObserver = null;
  let avatarRoot = null;
  let headPivot = null;
  let neckPivot = null;
  let torsoPivot = null;
  let rebuildAvatarFn = null;
  let lastBuiltGender = null;
  let lastBuiltVariant = null;

  // Rigged facial parts for lip-sync, blinking, and expressions
  let rig = null;

  // Pointer drag + cursor follow state
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

  const disposableResources = [];

  function track(res) {
    if (res) disposableResources.push(res);
    return res;
  }

  function disposeCurrentAvatar() {
    while (disposableResources.length > 0) {
      const res = disposableResources.pop();
      try {
        res?.dispose?.();
      } catch {}
    }
    if (avatarRoot && scene) {
      scene.remove(avatarRoot);
    }
    avatarRoot = null;
    rig = null;
  }

  function getPalette(varName) {
    if (varName === 'executive') {
      return {
        hijab: 0x0f5e56,
        hijabFold: 0x0a4640,
        ciput: 0xd9d2c7,
        blouse: 0x163844,
        suit: 0x172b3a,
        shirt: 0xf4f7f9,
        peci: 0x16171b,
        accent: 0x2dd4bf
      };
    }
    if (varName === 'warm') {
      return {
        hijab: 0xd9c6b0,
        hijabFold: 0xc2ab92,
        ciput: 0xf0e4d5,
        blouse: 0x4b6455,
        suit: 0x5c4738,
        shirt: 0xf9f3ea,
        peci: 0x1b1918,
        accent: 0xe6b87d
      };
    }
    // Default 'teal' glassmorphic match
    return {
      hijab: 0x2c7a7b,
      hijabFold: 0x236365,
      ciput: 0xdce7e5,
      blouse: 0x264755,
      suit: 0x21414f,
      shirt: 0xf8fafc,
      peci: 0x15171c,
      accent: 0xd9b978
    };
  }

  function createBatikTexture(baseHex, accentHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = `#${baseHex.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = `#${accentHex.toString(16).padStart(6, '0')}`;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 2.6;

    // Classic subtle Parang / Kawung geometric motif
    for (let y = 0; y < 256; y += 32) {
      for (let x = 0; x < 256; x += 32) {
        ctx.beginPath();
        ctx.ellipse(x + 16, y + 8, 9, 4, Math.PI / 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + 16, y + 24, 9, 4, -Math.PI / 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 16, y + 16, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#e2c28d';
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 2.5);
    return track(tex);
  }

  function createSculptedHeadGeometry(isMale) {
    const geo = track(new THREE.SphereGeometry(0.62, 48, 48));
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      // Vertical facial proportion (head height vs width)
      y *= 1.18;
      x *= isMale ? 0.91 : 0.87;
      z *= 0.96;

      // Taper jaw and chin naturally below eye line
      if (y < 0.05) {
        const lowerT = Math.min(1, (0.05 - y) / 0.78);
        const jawWidthFactor = isMale ? 1 - lowerT * 0.24 : 1 - lowerT * 0.34;
        x *= jawWidthFactor;

        // Forward chin projection
        if (z > 0.1) {
          z += Math.sin(lowerT * Math.PI) * (isMale ? 0.075 : 0.05);
        }
        // Flatten underside of chin smoothly
        if (y < -0.58) {
          y = -0.58 + (y + 0.58) * 0.45;
        }
      }

      // Subtle brow ridge & eye sockets for front face
      if (z > 0.25) {
        const eyeDistL = Math.hypot(x - 0.19, y - 0.07);
        const eyeDistR = Math.hypot(x + 0.19, y - 0.07);
        if (eyeDistL < 0.15) {
          z -= (0.15 - eyeDistL) * 0.24;
        }
        if (eyeDistR < 0.15) {
          z -= (0.15 - eyeDistR) * 0.24;
        }
        // Subtle cheekbone fullness
        const cheekL = Math.hypot(x - 0.27, y + 0.09);
        const cheekR = Math.hypot(x + 0.27, y + 0.09);
        if (cheekL < 0.18) z += (0.18 - cheekL) * 0.15;
        if (cheekR < 0.18) z += (0.18 - cheekR) * 0.15;

        // Slight brow prominence on male (~50yo)
        if (isMale && y > 0.14 && y < 0.30 && Math.abs(x) < 0.34) {
          z += 0.025;
        }
      }

      pos.setXYZ(i, x, y, z);
    }

    geo.computeVertexNormals();
    return geo;
  }

  function createShoulderTorsoGeometry(isMale) {
    // Lathe chest/shoulders profile (head-to-shoulders bust only)
    const points = isMale
      ? [
          new THREE.Vector2(0.01, -0.78),
          new THREE.Vector2(1.06, -0.78),
          new THREE.Vector2(1.02, -0.35),
          new THREE.Vector2(0.84, -0.05),
          new THREE.Vector2(0.32, 0.12),
          new THREE.Vector2(0.24, 0.18)
        ]
      : [
          new THREE.Vector2(0.01, -0.78),
          new THREE.Vector2(0.92, -0.78),
          new THREE.Vector2(0.88, -0.36),
          new THREE.Vector2(0.72, -0.04),
          new THREE.Vector2(0.30, 0.14),
          new THREE.Vector2(0.22, 0.20)
        ];

    const geo = track(new THREE.LatheGeometry(points, 40));
    geo.scale(1.0, 1.0, 0.56);
    geo.computeVertexNormals();
    return geo;
  }

  function buildAvatar() {
    disposeCurrentAvatar();
    if (!scene) return;

    const isMale = liveState.voiceGender === 'male';
    const pal = getPalette(liveState.variant);
    lastBuiltGender = liveState.voiceGender;
    lastBuiltVariant = liveState.variant;

    avatarRoot = new THREE.Group();
    avatarRoot.position.set(0, 0.08, 0);
    torsoPivot = new THREE.Group();
    torsoPivot.position.set(0, -0.82, 0);
    avatarRoot.add(torsoPivot);

    neckPivot = new THREE.Group();
    neckPivot.position.set(0, 0.16, 0.02);
    torsoPivot.add(neckPivot);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.42, 0);
    neckPivot.add(headPivot);

    // Materials
    const skinMat = track(
      new THREE.MeshStandardMaterial({
        color: isMale ? 0xd9a17c : 0xe4b391,
        roughness: isMale ? 0.58 : 0.48,
        metalness: 0.03
      })
    );
    const lipMat = track(
      new THREE.MeshStandardMaterial({
        color: isMale ? 0xad6d5f : 0xc26e72,
        roughness: 0.44,
        metalness: 0.04
      })
    );
    const innerMouthMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x4a161c,
        roughness: 0.92
      })
    );
    const teethMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xf5efe6,
        roughness: 0.42
      })
    );
    const scleraMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfbfbfb,
        roughness: 0.22
      })
    );
    const irisMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x3b2416,
        roughness: 0.22
      })
    );
    const pupilMat = track(new THREE.MeshBasicMaterial({ color: 0x0b0b0c }));
    const shineMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const hairMat = track(
      new THREE.MeshStandardMaterial({
        color: isMale ? 0x2b292b : 0x1e1a18,
        roughness: 0.78
      })
    );
    const silverHairMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x5c5c63,
        roughness: 0.78
      })
    );

    // --- SHOULDERS & ATTIRE (HEAD-TO-SHOULDERS BUST) ---
    const batikTex = isMale ? createBatikTexture(pal.suit, pal.accent) : null;
    const torsoMat = track(
      new THREE.MeshStandardMaterial({
        color: isMale && liveState.variant !== 'executive' ? 0xffffff : pal.suit,
        map: isMale && liveState.variant !== 'executive' ? batikTex : null,
        roughness: 0.65,
        metalness: 0.04
      })
    );
    const torsoMesh = new THREE.Mesh(createShoulderTorsoGeometry(isMale), torsoMat);
    torsoPivot.add(torsoMesh);

    if (isMale) {
      // Neat Koko / Shirt Mandarin Collar
      const collarMat = track(
        new THREE.MeshStandardMaterial({
          color: pal.shirt,
          roughness: 0.55
        })
      );
      const collar = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.245, 0.27, 0.14, 32, 1, false, -Math.PI * 0.88, Math.PI * 1.76)),
        collarMat
      );
      collar.position.set(0, 0.12, 0.02);
      collar.rotation.y = Math.PI;
      torsoPivot.add(collar);

      // Shirt placket / Koko trim
      const placket = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.48, 0.04)), collarMat);
      placket.position.set(0, -0.14, 0.41);
      placket.rotation.x = -0.35;
      torsoPivot.add(placket);

      // Lapel accents for executive style
      if (liveState.variant === 'executive') {
        const lapelMat = track(new THREE.MeshStandardMaterial({ color: 0x0f1f2c, roughness: 0.5 }));
        for (const side of [-1, 1]) {
          const lapel = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.52, 0.04)), lapelMat);
          lapel.position.set(side * 0.15, -0.15, 0.42);
          lapel.rotation.set(-0.34, side * 0.18, side * 0.22);
          torsoPivot.add(lapel);
        }
      }
    } else {
      // Sholehah Layered Hijab / Khimar Drape over Neck & Shoulders
      const hijabMat = track(
        new THREE.MeshStandardMaterial({
          color: pal.hijab,
          roughness: 0.64,
          metalness: 0.02
        })
      );
      const hijabFoldMat = track(
        new THREE.MeshStandardMaterial({
          color: pal.hijabFold,
          roughness: 0.68
        })
      );

      // Modest chest drape extending seamlessly over bust
      const drapeGeo = track(
        new THREE.SphereGeometry(0.76, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.62)
      );
      drapeGeo.scale(1.06, 0.85, 0.66);
      const chestDrape = new THREE.Mesh(drapeGeo, hijabMat);
      chestDrape.position.set(0, -0.12, 0.03);
      torsoPivot.add(chestDrape);

      // Soft scarf folds framing shoulders and neck
      const foldRing1 = new THREE.Mesh(track(new THREE.TorusGeometry(0.42, 0.095, 18, 36)), hijabFoldMat);
      foldRing1.position.set(0, 0.01, 0.05);
      foldRing1.rotation.set(Math.PI / 2.25, 0, 0);
      foldRing1.scale.set(1.12, 0.86, 1.0);
      torsoPivot.add(foldRing1);

      const foldRing2 = new THREE.Mesh(track(new THREE.TorusGeometry(0.56, 0.08, 16, 36)), hijabMat);
      foldRing2.position.set(0, -0.16, 0.07);
      foldRing2.rotation.set(Math.PI / 2.4, 0.06, 0.04);
      foldRing2.scale.set(1.15, 0.78, 1.0);
      torsoPivot.add(foldRing2);
    }

    // --- NECK ---
    const neckGeo = track(new THREE.CylinderGeometry(0.185, 0.215, 0.42, 28));
    const neckMesh = new THREE.Mesh(
      neckGeo,
      isMale
        ? skinMat
        : track(new THREE.MeshStandardMaterial({ color: pal.hijab, roughness: 0.65 }))
    );
    neckMesh.position.set(0, 0.14, -0.02);
    neckPivot.add(neckMesh);

    // --- SCULPTED HEAD ---
    const headMesh = new THREE.Mesh(createSculptedHeadGeometry(isMale), skinMat);
    headPivot.add(headMesh);

    // Subtle warm blush / cheekbone glow
    const cheekMat = track(
      new THREE.MeshStandardMaterial({
        color: isMale ? 0xc88469 : 0xe4988a,
        roughness: 0.75,
        transparent: true,
        opacity: isMale ? 0.08 : 0.16
      })
    );
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(track(new THREE.SphereGeometry(0.11, 16, 16)), cheekMat);
      cheek.scale.set(1.08, 0.7, 0.22);
      cheek.position.set(side * 0.26, -0.095, 0.475);
      headPivot.add(cheek);
    }

    // --- NOSE ---
    const noseGroup = new THREE.Group();
    const noseBridge = new THREE.Mesh(
      track(new THREE.CapsuleGeometry(isMale ? 0.044 : 0.036, 0.15, 8, 16)),
      skinMat
    );
    noseBridge.position.set(0, 0.02, 0.59);
    noseBridge.rotation.x = -0.22;
    noseGroup.add(noseBridge);

    const noseTip = new THREE.Mesh(track(new THREE.SphereGeometry(isMale ? 0.058 : 0.046, 18, 16)), skinMat);
    noseTip.scale.set(1.15, 0.9, 1.05);
    noseTip.position.set(0, -0.06, 0.625);
    noseGroup.add(noseTip);

    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(track(new THREE.SphereGeometry(0.03, 12, 12)), skinMat);
      nostril.position.set(side * 0.036, -0.075, 0.60);
      noseGroup.add(nostril);
    }
    headPivot.add(noseGroup);

    // --- EYES WITH BLINKING LIDS & SPECULAR HIGHLIGHTS ---
    const eyesGroup = new THREE.Group();
    const eyeSockets = [];
    const upperLids = [];

    for (const side of [-1, 1]) {
      const eyeSocket = new THREE.Group();
      eyeSocket.position.set(side * 0.195, 0.09, 0.505);

      const sclera = new THREE.Mesh(track(new THREE.SphereGeometry(0.088, 24, 24)), scleraMat);
      sclera.scale.set(1.08, 0.90, 0.72);
      eyeSocket.add(sclera);

      const irisPivot = new THREE.Group();
      const iris = new THREE.Mesh(track(new THREE.SphereGeometry(0.056, 24, 24)), irisMat);
      iris.scale.set(1.0, 1.0, 0.45);
      iris.position.set(0, 0, 0.050);
      irisPivot.add(iris);

      const pupil = new THREE.Mesh(track(new THREE.SphereGeometry(0.029, 18, 18)), pupilMat);
      pupil.scale.set(1.0, 1.0, 0.4);
      pupil.position.set(0, 0, 0.065);
      irisPivot.add(pupil);

      const sparkle = new THREE.Mesh(track(new THREE.SphereGeometry(0.011, 10, 10)), shineMat);
      sparkle.position.set(0.018, 0.022, 0.072);
      irisPivot.add(sparkle);

      eyeSocket.add(irisPivot);

      // Eyelash / upper eyelid resting naturally over top ~15% of iris for warm calm gaze
      const lidMat = track(
        new THREE.MeshStandardMaterial({
          color: isMale ? 0xc78d6a : 0xd6a180,
          roughness: 0.55
        })
      );
      const upperLid = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.094, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.54)),
        lidMat
      );
      upperLid.scale.set(1.12, 0.94, 0.78);
      upperLid.rotation.x = -Math.PI * 0.19; // warm relaxed resting eyelid
      eyeSocket.add(upperLid);

      // Subtle upper lash line
      const lash = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.084, isMale ? 0.004 : 0.007, 8, 22, Math.PI * 0.80)),
        hairMat
      );
      lash.position.set(0, 0.012, 0.052);
      lash.rotation.z = Math.PI * 0.10;
      lash.rotation.x = -0.14;
      eyeSocket.add(lash);

      eyesGroup.add(eyeSocket);
      eyeSockets.push(irisPivot);
      upperLids.push(upperLid);
    }
    headPivot.add(eyesGroup);

    // --- EYEBROWS (calm, friendly warm arch) ---
    const browGroup = new THREE.Group();
    for (const side of [-1, 1]) {
      const brow = new THREE.Mesh(
        track(new THREE.CapsuleGeometry(isMale ? 0.018 : 0.012, 0.135, 6, 12)),
        hairMat
      );
      brow.position.set(side * 0.195, 0.212, 0.548);
      brow.rotation.z = Math.PI / 2 + side * (isMale ? 0.03 : 0.05);
      brow.rotation.y = side * 0.22;
      browGroup.add(brow);
    }
    headPivot.add(browGroup);

    // --- ARTICULATED MOUTH & LIP-SYNC JAW SYSTEM ---
    const mouthAnchor = new THREE.Group();
    mouthAnchor.position.set(0, -0.228, 0.605);
    headPivot.add(mouthAnchor);

    // Dark recessed mouth cavity
    const mouthCavity = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.092, 22, 16)),
      innerMouthMat
    );
    mouthCavity.scale.set(1.12, 0.18, 0.25);
    mouthCavity.position.set(0, -0.002, -0.025);
    mouthAnchor.add(mouthCavity);

    // Upper teeth curved inside behind upper lip (visible only when speaking/open)
    const upperTeeth = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.072, 0.072, 0.018, 18, 1, false, -Math.PI * 0.26, Math.PI * 0.52)),
      teethMat
    );
    upperTeeth.position.set(0, 0.006, -0.088);
    upperTeeth.visible = false;
    mouthAnchor.add(upperTeeth);

    // Upper Lip (gentle flat smiling curve whose corners meet lower lip cleanly without crossing)
    const upperLipGroup = new THREE.Group();
    const upperLipArc = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.28, 0.015, 10, 24, Math.PI * 0.22)),
      lipMat
    );
    upperLipArc.position.set(0, 0.284, 0.016);
    upperLipArc.rotation.z = -Math.PI * 0.61;
    upperLipArc.scale.set(1.0, 0.85, 0.85);
    upperLipGroup.add(upperLipArc);
    mouthAnchor.add(upperLipGroup);

    // Articulated Lower Jaw + Lower Lip + Lower Teeth
    const lowerJawGroup = new THREE.Group();
    lowerJawGroup.position.set(0, 0.015, -0.14); // Pivot back near jaw hinge
    mouthAnchor.add(lowerJawGroup);

    const lowerLip = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.18, 0.017, 10, 24, Math.PI * 0.36)),
      lipMat
    );
    lowerLip.position.set(0, 0.152, 0.156);
    lowerLip.rotation.z = -Math.PI * 0.68;
    lowerLip.scale.set(1.0, 0.88, 0.88);
    lowerJawGroup.add(lowerLip);

    const lowerTeeth = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.068, 0.068, 0.016, 16, 1, false, -Math.PI * 0.24, Math.PI * 0.48)),
      teethMat
    );
    lowerTeeth.position.set(0, -0.022, 0.056);
    lowerTeeth.visible = false;
    lowerJawGroup.add(lowerTeeth);

    // Chin pad moves with jaw opening so chin extends smoothly when talking!
    const jawChin = new THREE.Mesh(track(new THREE.SphereGeometry(0.135, 20, 16)), skinMat);
    jawChin.scale.set(1.16, 0.72, 0.72);
    jawChin.position.set(0, -0.105, 0.108);
    lowerJawGroup.add(jawChin);

    // --- GENDER-SPECIFIC CULTURAL DETAILS ---
    if (isMale) {
      // Ears visible neatly on male
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(track(new THREE.SphereGeometry(0.09, 16, 16)), skinMat);
        ear.scale.set(0.36, 1.15, 0.68);
        ear.position.set(side * 0.555, 0.03, 0.02);
        headPivot.add(ear);

        // Salt-and-pepper ~50yo temple sideburns
        const sideburn = new THREE.Mesh(track(new THREE.BoxGeometry(0.048, 0.22, 0.10)), silverHairMat);
        sideburn.position.set(side * 0.505, 0.14, 0.11);
        headPivot.add(sideburn);
      }

      // Hair around lower back/sides under Peci with mature silver-salt blend
      const hairCap = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.605, 36, 24, 0, Math.PI * 2, 0.45, Math.PI * 0.36)),
        hairMat
      );
      hairCap.scale.set(0.92, 1.14, 0.98);
      hairCap.position.set(0, 0.05, -0.02);
      headPivot.add(hairCap);

      // Traditional Indonesian Black Velvet Peci / Kopiah
      const peciMat = track(
        new THREE.MeshStandardMaterial({
          color: pal.peci,
          roughness: 0.92,
          metalness: 0.02
        })
      );
      const peciGroup = new THREE.Group();
      const peciBody = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.495, 0.55, 0.31, 42)),
        peciMat
      );
      peciBody.scale.set(0.91, 1.0, 1.04);
      peciBody.position.set(0, 0.54, -0.03);
      peciGroup.add(peciBody);

      const peciTop = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.475, 0.495, 0.04, 42)),
        peciMat
      );
      peciTop.scale.set(0.91, 1.0, 1.04);
      peciTop.position.set(0, 0.70, -0.03);
      peciGroup.add(peciTop);

      peciGroup.rotation.x = -0.14; // natural slightly-back kopiah wearing angle
      headPivot.add(peciGroup);

      // Mature 50yo Indonesian Mustache (subtle dark-gray salt & pepper) following upper lip contour
      const mustacheMat = track(
        new THREE.MeshStandardMaterial({ color: 0x3b393d, roughness: 0.85 })
      );
      for (const side of [-1, 1]) {
        const stache = new THREE.Mesh(
          track(new THREE.CapsuleGeometry(0.014, 0.072, 6, 12)),
          mustacheMat
        );
        stache.position.set(side * 0.058, -0.178, 0.618);
        stache.rotation.z = Math.PI / 2 - side * 0.16;
        stache.rotation.y = side * 0.18;
        headPivot.add(stache);
      }

      // Neat trimmed salt-and-pepper chin goatee hugging jaw contour
      const goatee = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.088, 18, 16)),
        silverHairMat
      );
      goatee.scale.set(0.92, 0.58, 0.36);
      goatee.position.set(0, -0.15, 0.135);
      lowerJawGroup.add(goatee);

      // Gentle ~50yo smile lines
      const creaseMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xb9805d,
          roughness: 0.75,
          transparent: true,
          opacity: 0.24
        })
      );
      for (const side of [-1, 1]) {
        const smileLine = new THREE.Mesh(
          track(new THREE.CapsuleGeometry(0.005, 0.12, 4, 8)),
          creaseMat
        );
        smileLine.position.set(side * 0.17, -0.13, 0.55);
        smileLine.rotation.z = side * 0.35;
        headPivot.add(smileLine);
      }
    } else {
      // Sholehah Female Hijab framing head & chin cleanly ABOVE eyebrows
      const hijabMat = track(
        new THREE.MeshStandardMaterial({
          color: pal.hijab,
          roughness: 0.64,
          metalness: 0.02
        })
      );
      const ciputMat = track(
        new THREE.MeshStandardMaterial({
          color: pal.ciput,
          roughness: 0.72
        })
      );

      // Inner ciput headband peeking gently at upper hairline
      const ciput = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.60, 42, 28, 0, Math.PI * 2, 0, Math.PI * 0.36)),
        ciputMat
      );
      ciput.scale.set(0.89, 1.13, 0.96);
      ciput.position.set(0, 0.16, -0.055);
      ciput.rotation.x = -0.30;
      headPivot.add(ciput);

      // Outer hijab hood covering hair, ears, and back cleanly behind face plane
      const hood = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.66, 44, 36)),
        hijabMat
      );
      hood.scale.set(0.95, 1.18, 1.03);
      hood.position.set(0, 0.05, -0.15);
      headPivot.add(hood);

      // Clean oval hijab edge loop framing face (high forehead, cheeks, under chin)
      const frameRing = new THREE.Mesh(track(new THREE.TorusGeometry(0.475, 0.072, 18, 44)), hijabMat);
      frameRing.scale.set(0.94, 1.15, 0.94);
      frameRing.position.set(0, 0.04, 0.24);
      headPivot.add(frameRing);

      // Under-chin hijab wrap neatly below chin
      const underChinWrap = new THREE.Mesh(track(new THREE.TorusGeometry(0.32, 0.075, 16, 32)), hijabMat);
      underChinWrap.rotation.x = Math.PI / 2.2;
      underChinWrap.position.set(0, -0.53, 0.04);
      headPivot.add(underChinWrap);
    }

    avatarRoot.add(torsoPivot);
    scene.add(avatarRoot);

    rig = {
      isMale,
      eyeSockets,
      upperLids,
      browGroup,
      mouthCavity,
      upperLipGroup,
      upperTeeth,
      lowerTeeth,
      lowerJawGroup,
      lowerLip,
      mouthAnchor
    };
  }

  onMount(() => {
    if (!containerEl) return;

    try {
      scene = new THREE.Scene();

      const width = containerEl.clientWidth || 320;
      const height = containerEl.clientHeight || 320;

      camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 30);
      camera.position.set(0, -0.15, 5.05);
      camera.lookAt(0, -0.18, 0);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;

      containerEl.innerHTML = '';
      containerEl.appendChild(renderer.domElement);

      // 3-Point Studio Digital Human Lighting
      const hemi = new THREE.HemisphereLight(0xf6fcff, 0x264755, 1.15);
      scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.85);
      keyLight.position.set(2.2, 2.6, 3.2);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xd8f3f0, 0.85);
      fillLight.position.set(-2.5, 0.8, 2.4);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0x5eead4, 0.95);
      rimLight.position.set(-0.8, 1.8, -2.5);
      scene.add(rimLight);

      rebuildAvatarFn = buildAvatar;
      buildAvatar();

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

      // Animation Loop (Lip-sync, Blinking, Breathing, Cursor & Drag)
      let smoothVolume = 0;
      let nextBlinkAt = 2.0;
      let blinkProgress = 0;
      const clock = new THREE.Clock();

      const animate = () => {
        animFrameId = requestAnimationFrame(animate);
        const dt = Math.min(0.05, clock.getDelta());
        const t = clock.elapsedTime;

        if (!isDragging) {
          // Gently drift back toward natural center when not dragging
          targetDragYaw *= 0.94;
          targetDragPitch *= 0.94;
        }
        currentDragYaw += (targetDragYaw - currentDragYaw) * 0.14;
        currentDragPitch += (targetDragPitch - currentDragPitch) * 0.14;

        // Breathing motion on shoulders/torso
        if (torsoPivot) {
          const breath = Math.sin(t * 1.9);
          torsoPivot.position.y = -0.82 + breath * 0.012;
          torsoPivot.rotation.y = currentDragYaw * 0.35 + cursorX * 0.05;
        }

        // Compute effective lip-sync speech level
        const activeSpeech = liveState.isSpeaking && !liveState.isAudioMuted;
        const rawVol = liveState.isAudioMuted ? 0 : liveState.outputVolume;

        let targetOpen = 0;
        let roundness = 0.25;
        if (activeSpeech) {
          // Natural syllable modulation even when WebRTC outputVolume fluctuates or in speechSynthesis fallback
          const syllableWave =
            0.42 +
            0.28 * Math.sin(t * 16.5) +
            0.18 * Math.sin(t * 25.3 + 0.9) +
            0.12 * Math.cos(t * 9.7);
          const volBoost = rawVol > 0.02 ? Math.min(1, rawVol * 2.8) : 0.72;
          targetOpen = Math.min(1, Math.max(0.08, syllableWave * volBoost));
          roundness = 0.5 + 0.5 * Math.sin(t * 11.4);
        } else if (rawVol > 0.03) {
          targetOpen = Math.min(0.9, rawVol * 2.5);
        }

        smoothVolume += (targetOpen - smoothVolume) * (activeSpeech ? 0.36 : 0.22);

        if (headPivot) {
          const speakNod = activeSpeech ? Math.sin(t * 4.2) * 0.032 : Math.sin(t * 1.1) * 0.012;
          const listenTilt = liveState.isListening && !activeSpeech ? 0.045 : 0;
          const targetPitch = currentDragPitch + cursorY * 0.08 + speakNod + listenTilt;
          const targetYaw =
            currentDragYaw * 0.65 +
            cursorX * 0.16 +
            (activeSpeech ? Math.sin(t * 2.1) * 0.045 : Math.sin(t * 0.7) * 0.02);

          headPivot.rotation.x += (targetPitch - headPivot.rotation.x) * 0.14;
          headPivot.rotation.y += (targetYaw - headPivot.rotation.y) * 0.14;
          headPivot.rotation.z =
            liveState.isListening && !activeSpeech
              ? Math.sin(t * 0.8) * 0.03 + 0.03
              : activeSpeech
                ? Math.sin(t * 2.5) * 0.025
                : 0;
        }

        if (rig) {
          // Lip-Sync Jaw & Mouth Animation
          const openAmt = smoothVolume;
          rig.lowerJawGroup.rotation.x = openAmt * 0.34;
          rig.lowerLip.position.y = 0.152 - openAmt * 0.018;
          rig.lowerLip.scale.x = 1.0 - roundness * openAmt * 0.20;
          rig.upperLipGroup.position.y = openAmt * 0.012;
          rig.upperLipGroup.scale.x = 1.0 - roundness * openAmt * 0.15;

          rig.mouthCavity.scale.y = 0.18 + openAmt * 0.72;
          rig.mouthCavity.scale.x = 1.12 - roundness * openAmt * 0.24;
          rig.upperTeeth.visible = openAmt > 0.14;
          rig.lowerTeeth.visible = openAmt > 0.28;

          // Subtle smile & brow lift when speaking
          rig.browGroup.position.y = openAmt * 0.014 + (liveState.isListening ? 0.008 : 0);

          // Natural Blinking
          if (t >= nextBlinkAt && blinkProgress === 0) {
            blinkProgress = 0.001;
          }
          let lidAngle = -Math.PI * 0.19;
          if (blinkProgress > 0) {
            blinkProgress += dt * 7.5;
            const blinkFactor = Math.sin(Math.min(1, blinkProgress) * Math.PI);
            lidAngle = -Math.PI * 0.19 + blinkFactor * (Math.PI * 0.28);
            if (blinkProgress >= 1) {
              blinkProgress = 0;
              nextBlinkAt = t + 2.6 + Math.random() * 2.8;
            }
          }
          for (const lid of rig.upperLids) {
            lid.rotation.x = lidAngle;
          }

          // Subtle Eye Tracking toward pointer
          for (const iris of rig.eyeSockets) {
            iris.rotation.y = cursorX * 0.22;
            iris.rotation.x = cursorY * 0.14;
          }
        }

        renderer.render(scene, camera);
      };

      animate();
    } catch (err) {
      console.warn('3D WebGL unavailable, using clean fallback:', err?.message || err);
      webglError = true;
    }
  });

  onDestroy(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    resizeObserver?.disconnect();
    disposeCurrentAvatar();
    renderer?.dispose();
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
    targetDragYaw = Math.max(-0.85, Math.min(0.85, baseYawOnDrag + dx * 0.008));
    targetDragPitch = Math.max(-0.35, Math.min(0.35, basePitchOnDrag + dy * 0.006));
  }

  function handlePointerUp(e) {
    isDragging = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  function handlePointerLeave() {
    isDragging = false;
    cursorX = 0;
    cursorY = 0;
  }
</script>

<div class="relative w-full h-full flex items-center justify-center select-none">
  {#if webglError}
    <div
      data-testid="avatar-3d-fallback"
      class="w-40 h-40 rounded-full bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-400/40 flex flex-col items-center justify-center text-center p-4"
    >
      <span class="text-2xl font-bold text-[#264755]">
        {voiceGender === 'male' ? 'MR' : 'J'}
      </span>
      <span class="text-xs text-slate-600 mt-1">
        {voiceGender === 'male' ? 'Mas Rouf' : 'Jasmin'}
      </span>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={containerEl}
      data-testid="avatar-3d-canvas-host"
      aria-label={voiceGender === 'male' ? 'Avatar 3D Mas Rouf' : 'Avatar 3D Jasmin'}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
      onpointerleave={handlePointerLeave}
      class="w-full h-full cursor-grab active:cursor-grabbing touch-pan-y"
    ></div>
  {/if}
</div>
