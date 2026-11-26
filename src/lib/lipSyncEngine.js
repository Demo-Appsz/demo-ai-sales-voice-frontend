/**
 * Lip-Sync & Pause Synchronization Engine (Audio-Driven DSP + Speech Timeline).
 *
 * Designed specifically around the empirical characteristics of WebRTC / WebSocket
 * AnalyserNode output (`1024` resampled bins covering `100–8000 Hz`, `smoothingTimeConstant = 0.8`)
 * and Web Speech API (`speechSynthesis`) fallback utterances.
 */

const MIN_VOICE_HZ = 100;
const MAX_VOICE_HZ = 8000;

/**
 * Compute mean normalized `[0, 1]` spectral band energy from @elevenlabs/client's
 * 1024-bin `resampleVoiceRange` output (`[100 Hz .. 8000 Hz]`, ~7.715 Hz/bin).
 */
export function analyzeOutputSpectrum(bins) {
  if (!bins || bins.length < 32) {
    return { f1Energy: 0, f2Energy: 0, sibilantEnergy: 0, fullVoiceEnergy: 0 };
  }

  const len = bins.length;
  const hzPerBin = (MAX_VOICE_HZ - MIN_VOICE_HZ) / len;
  const toBin = (hz) =>
    Math.max(0, Math.min(len - 1, Math.round((hz - MIN_VOICE_HZ) / hzPerBin)));

  const meanRange = (hzLow, hzHigh) => {
    const start = toBin(hzLow);
    const end = Math.max(start + 1, toBin(hzHigh));
    let sum = 0;
    for (let i = start; i <= end; i++) {
      sum += bins[i];
    }
    return sum / ((end - start + 1) * 255);
  };

  // F1 Vowel Openness (jaw drop: A / O / E): ~300 - 950 Hz
  const f1Energy = meanRange(300, 950);
  // F2 Articulation / Front-Back Vowel Formant: ~950 - 2500 Hz
  const f2Energy = meanRange(950, 2500);
  // Sibilant / Fricative Consonants (S / Sh / T / F / H): ~2800 - 6500 Hz
  const sibilantEnergy = meanRange(2800, 6500);

  const fullVoiceEnergy = f1Energy * 0.52 + f2Energy * 0.34 + sibilantEnergy * 0.14;
  return { f1Energy, f2Energy, sibilantEnergy, fullVoiceEnergy };
}

function isWhitespaceChar(ch) {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
}

function isSentencePauseChar(ch) {
  return ch === '.' || ch === '!' || ch === '?' || ch === '؟' || ch === ';';
}

function isClausePauseChar(ch) {
  return ch === ',' || ch === ':' || ch === '،' || ch === '—' || ch === '-';
}

function classifyWordViseme(rawWord) {
  const w = rawWord.toLowerCase();
  let openWeight = 0.56;
  let roundness = 0.25;
  let wideCount = 0;
  let roundCount = 0;
  let bilabialCount = 0;

  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    if (c === 'a' || c === 'á' || c === 'e') wideCount += 1;
    if (c === 'o' || c === 'u') roundCount += 1;
    if (c === 'm' || c === 'b' || c === 'p') bilabialCount += 1;
  }

  if (wideCount > 0) openWeight = Math.min(0.95, 0.64 + wideCount * 0.08);
  if (roundCount > 0) roundness = Math.min(0.88, 0.36 + roundCount * 0.16);
  if (bilabialCount > 0 && w.length <= 5) openWeight *= 0.85;

  return {
    openWeight,
    roundness,
    syllableCount: Math.max(1, Math.min(6, Math.ceil(w.length / 3))),
    hasBilabial: bilabialCount > 0
  };
}

/**
 * Pre-compute a deterministic timeline of words, bilabial dips, and punctuation silences
 * (`targetOpen = 0` at commas/periods) for browser `speechSynthesis` fallback playback.
 */
export function buildSpeechTimeline(text, rate = 1.05) {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) return { segments: [], totalMs: 0, words: [] };

  const tokens = [];
  let current = '';
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (isWhitespaceChar(ch)) {
      if (current) {
        tokens.push({ text: current, charStart: i - current.length });
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) {
    tokens.push({ text: current, charStart: clean.length - current.length });
  }

  const speedFactor = Math.max(0.75, Math.min(1.4, rate || 1.0));
  const segments = [];
  const words = [];
  let cursorMs = 0;

  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx];
    let pauseAfterMs = 45;
    let stripped = tok.text;

    while (stripped.length > 0) {
      const last = stripped[stripped.length - 1];
      if (isSentencePauseChar(last)) {
        pauseAfterMs = Math.max(pauseAfterMs, 420);
        stripped = stripped.slice(0, -1);
      } else if (isClausePauseChar(last)) {
        pauseAfterMs = Math.max(pauseAfterMs, 240);
        stripped = stripped.slice(0, -1);
      } else if (last === '"' || last === "'" || last === '”' || last === ')' || last === ']') {
        stripped = stripped.slice(0, -1);
      } else {
        break;
      }
    }

    if (stripped.length === 0) {
      const scaledPause = Math.round(Math.max(pauseAfterMs, 180) / speedFactor);
      segments.push({
        type: 'pause',
        startMs: cursorMs,
        endMs: cursorMs + scaledPause
      });
      cursorMs += scaledPause;
      continue;
    }

    const activeText = stripped;
    const viseme = classifyWordViseme(activeText);
    const speakMs = Math.round(((130 + activeText.length * 46) / speedFactor));

    const seg = {
      type: 'word',
      charStart: tok.charStart,
      startMs: cursorMs,
      endMs: cursorMs + speakMs,
      ...viseme
    };
    segments.push(seg);
    words.push(seg);
    cursorMs += speakMs;

    const scaledPause = Math.round(pauseAfterMs / speedFactor);
    segments.push({
      type: 'pause',
      startMs: cursorMs,
      endMs: cursorMs + scaledPause
    });
    cursorMs += scaledPause;
  }

  return { segments, words, totalMs: cursorMs };
}

/**
 * Sample pre-computed fallback timeline at `elapsedMs`, supporting optional dynamic
 * re-anchoring when browser emits real `utterance.onboundary` word offsets.
 */
export function sampleSpeechTimeline(timeline, elapsedMs) {
  if (!timeline || !timeline.segments.length || elapsedMs < 0 || elapsedMs >= timeline.totalMs) {
    return { targetOpen: 0, targetRound: 0, inPause: true };
  }

  for (let i = 0; i < timeline.segments.length; i++) {
    const seg = timeline.segments[i];
    if (elapsedMs >= seg.startMs && elapsedMs < seg.endMs) {
      if (seg.type === 'pause') {
        return { targetOpen: 0, targetRound: 0, inPause: true };
      }
      const dur = Math.max(1, seg.endMs - seg.startMs);
      const p = (elapsedMs - seg.startMs) / dur;
      // Natural raised-cosine envelope + per-syllable articulation inside word
      const wordEnv = Math.sin(p * Math.PI);
      const sylPhase = (p * seg.syllableCount * Math.PI) % Math.PI;
      const sylEnv = 0.42 + 0.58 * Math.sin(sylPhase);
      const open = Math.min(1, seg.openWeight * (0.45 + 0.55 * wordEnv) * sylEnv);
      return { targetOpen: open, targetRound: seg.roundness, inPause: false };
    }
  }

  return { targetOpen: 0, targetRound: 0, inPause: true };
}

/**
 * Stateful DSP processor combining:
 * 1. Inverse IIR de-smoothing compensating for AnalyserNode `smoothingTimeConstant = 0.8`
 * 2. Adaptive noise floor & hysteresis gate (`Schmitt trigger`) + monotonic decay pause snap
 * 3. Convex voice-range shaping & `dt`-normalized jaw muscle attack/release timing
 */
export function createLipSyncProcessor() {
  let smoothOpen = 0;
  let smoothRound = 0;
  let phraseEnergy = 0;
  let noiseFloor = 0.012;
  let peakFloor = 0.14;
  let prevRawEnergy = 0;
  let prevFluxEnergy = 0;
  let decayMs = 0;
  let flatLowMs = 0;
  let hasLiveInit = false;
  let isGateActive = false;

  const DEFAULTS = {
    smoothingCoeff: 0.8,
    gateOpenMargin: 0.042,
    gateCloseMargin: 0.024,
    lambdaAttack: 42.0,
    lambdaRelease: 26.0,
    lambdaPauseSnap: 46.0
  };

  function step(input) {
    const dt = Math.max(0.001, Math.min(0.05, input?.dt ?? 1 / 60));
    const dtMs = dt * 1000;
    const isMuted = Boolean(input?.isAudioMuted);
    const activeSpeech = Boolean(input?.isSpeaking) && !isMuted;

    let targetOpen = 0;
    let targetRound = 0;
    let isPauseSnapping = false;

    if (!isMuted && input?.hasLiveMeter) {
      const f1 = Number(input.f1Energy || 0);
      const f2 = Number(input.f2Energy || 0);
      const sib = Number(input.sibilantEnergy || 0);
      const vol = Number(input.volume || 0);

      // Weight vowel formants strongly; sibilants modulate articulation cleanly without wild jaw drops
      const rawEnergy = Math.max(vol * 1.35, f1 * 1.28 + f2 * 0.82 + sib * 0.32);

      // Warm-start history & ambient baseline on very first live frame to avoid 5x derivative spike
      if (!hasLiveInit) {
        hasLiveInit = true;
        prevRawEnergy = rawEnergy;
        prevFluxEnergy = rawEnergy;
        noiseFloor = Math.max(0.008, Math.min(0.13, rawEnergy));
      }

      // 1. First-order IIR inverse de-smoothing against AnalyserNode `smoothingTimeConstant = 0.8`
      const alpha = Math.pow(DEFAULTS.smoothingCoeff, dt * 60);
      const desmoothed = Math.max(0, (rawEnergy - alpha * prevRawEnergy) / Math.max(0.08, 1 - alpha));
      const instantEnergy = desmoothed * 0.65 + rawEnergy * 0.35;

      // Time-based monotonic Analyser decay & steady flat ambient tracking (FPS-independent 30/60/120Hz)
      if (rawEnergy <= prevRawEnergy * 0.94 + 0.0015 && desmoothed < rawEnergy * 0.65) {
        decayMs += dtMs;
      } else if (instantEnergy > prevFluxEnergy * 1.05) {
        decayMs = 0;
      }

      if (Math.abs(rawEnergy - prevRawEnergy) < 0.003 && rawEnergy < 0.14) {
        flatLowMs += dtMs;
      } else {
        flatLowMs = 0;
      }

      prevRawEnergy = rawEnergy;
      prevFluxEnergy = instantEnergy;

      // 2. Adaptive noise floor & peak tracker (tracks idle noise OR sustained flat ambient signal)
      if ((!isGateActive && rawEnergy < noiseFloor + 0.065) || flatLowMs >= 140) {
        noiseFloor += (rawEnergy - noiseFloor) * (1 - Math.exp(-3.8 * dt));
        noiseFloor = Math.max(0.005, Math.min(0.13, noiseFloor));
      } else {
        noiseFloor = Math.min(noiseFloor, rawEnergy * 0.85);
        noiseFloor = Math.max(0.005, Math.min(0.13, noiseFloor));
      }

      if (instantEnergy > peakFloor) {
        peakFloor += (instantEnergy - peakFloor) * (1 - Math.exp(-12.0 * dt));
      } else {
        peakFloor = Math.max(0.14, peakFloor * Math.exp(-0.45 * dt));
      }

      // 3. Schmitt Trigger Hysteresis Gate + Time-Based Monotonic Tail Cut
      const openThresh = noiseFloor + DEFAULTS.gateOpenMargin;
      const closeThresh = noiseFloor + DEFAULTS.gateCloseMargin;

      if (!isGateActive) {
        if (
          rawEnergy >= openThresh * 0.85 &&
          (instantEnergy >= openThresh || (rawEnergy >= openThresh && decayMs === 0))
        ) {
          isGateActive = true;
        }
      } else {
        if (
          instantEnergy < closeThresh ||
          flatLowMs >= 160 ||
          (decayMs >= 16 && desmoothed < closeThresh) ||
          (decayMs >= 30 && rawEnergy < peakFloor * 0.62) ||
          (decayMs >= 30 && instantEnergy < peakFloor * 0.28)
        ) {
          isGateActive = false;
          isPauseSnapping = true;
        }
      }

      if (isGateActive) {
        const span = Math.max(0.11, peakFloor - closeThresh);
        const norm = Math.max(0, Math.min(1, (instantEnergy - closeThresh) / span));
        // Convex-linear curve (> 1.0) preserves dynamic syllable contrasts & keeps low end clean
        const shaped = Math.pow(norm, 1.18);
        const vowelDominant = f1 >= sib * 0.9;
        const shapeCap = vowelDominant ? 1.0 : 0.56;
        targetOpen = Math.min(1, shaped * shapeCap);
        targetRound = vowelDominant ? Math.min(1, (f1 / Math.max(0.01, f1 + f2)) * 1.45) : 0.16;
      } else {
        targetOpen = 0;
        targetRound = 0;
      }
    } else if (activeSpeech) {
      // Deterministic timeline driven by spoken text words + comma/period silences
      if (input?.timelineSample) {
        targetOpen = input.timelineSample.targetOpen || 0;
        targetRound = input.timelineSample.targetRound || 0;
        isPauseSnapping = Boolean(input.timelineSample.inPause);
      } else {
        targetOpen = 0;
        targetRound = 0;
        isPauseSnapping = true;
      }
    } else {
      isGateActive = false;
      isPauseSnapping = smoothOpen > 0.01;
      targetOpen = 0;
      targetRound = 0;
    }

    // 4. Frame-rate-independent jaw muscle dynamics
    const lambda =
      targetOpen > smoothOpen
        ? DEFAULTS.lambdaAttack
        : isPauseSnapping
          ? DEFAULTS.lambdaPauseSnap
          : DEFAULTS.lambdaRelease;

    const blend = 1 - Math.exp(-lambda * dt);
    smoothOpen += (targetOpen - smoothOpen) * blend;
    if (smoothOpen < 0.004 && targetOpen === 0) smoothOpen = 0;

    smoothRound += (targetRound - smoothRound) * (1 - Math.exp(-16.0 * dt));
    phraseEnergy += (smoothOpen - phraseEnergy) * (1 - Math.exp(-5.0 * dt));

    return {
      open: smoothOpen,
      round: smoothRound,
      phraseEnergy,
      gateActive: isGateActive,
      isPauseSnapping
    };
  }

  return {
    step,
    reset() {
      smoothOpen = 0;
      smoothRound = 0;
      phraseEnergy = 0;
      decayMs = 0;
      flatLowMs = 0;
      hasLiveInit = false;
      prevRawEnergy = 0;
      prevFluxEnergy = 0;
      isGateActive = false;
    }
  };
}
