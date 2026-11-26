import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import {
  analyzeOutputSpectrum,
  buildSpeechTimeline,
  sampleSpeechTimeline,
  createLipSyncProcessor
} from '../src/lib/lipSyncEngine.js';

/**
 * Exact baseline algorithm extracted from previous App.svelte + AvatarPhotoreal.svelte
 * so the A/B benchmark measures real mathematical improvements objectively.
 */
function createBaselineProcessor() {
  let smoothOpen = 0;
  let peakFloor = 0.08;

  return {
    analyzeBands(bins) {
      // Old bug: bins[1..10] (~108-177 Hz) as vowel, bins[11..28] (~185-316 Hz) as consonant
      let lowSum = 0;
      for (let i = 1; i <= 10; i++) lowSum += bins[i];
      const vowelEnergy = lowSum / (10 * 255);
      let highSum = 0;
      for (let i = 11; i <= 28; i++) highSum += bins[i];
      const consonantEnergy = highSum / (18 * 255);
      return { vowelEnergy, consonantEnergy };
    },
    step({ hasLiveMeter, volume, vowelEnergy, consonantEnergy, isSpeaking, t }) {
      let targetOpen = 0;
      if (hasLiveMeter) {
        const rawSignal = Math.max(volume * 1.4, vowelEnergy * 1.15 + consonantEnergy * 0.55);
        if (rawSignal > peakFloor) peakFloor += (rawSignal - peakFloor) * 0.15;
        else peakFloor = Math.max(0.08, peakFloor * 0.996);

        if (rawSignal > 0.018) {
          const norm = Math.min(1, rawSignal / Math.max(0.09, peakFloor * 0.92));
          const vowelDom = vowelEnergy >= consonantEnergy * 0.95;
          const micro = 0.86 + 0.14 * Math.sin(t * 21.0);
          targetOpen = Math.min(1, Math.pow(norm, 0.78) * (vowelDom ? 1.0 : 0.56) * micro);
        }
      } else if (isSpeaking) {
        const phraseCadence = Math.sin(t * 2.4) + 0.45 * Math.sin(t * 1.3 + 1.1);
        const breathPause = phraseCadence < -0.95 ? 0.08 : 1.0;
        const wave = 0.42 + 0.30 * Math.sin(t * 13.8) + 0.18 * Math.sin(t * 22.3 + 0.7) + 0.10 * Math.cos(t * 7.9);
        targetOpen = Math.min(0.95, wave * 0.828 * breathPause);
      }

      const envRate = targetOpen > smoothOpen ? 0.56 : 0.28;
      smoothOpen += (targetOpen - smoothOpen) * envRate;
      return smoothOpen;
    }
  };
}

function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return den === 0 ? 0 : num / den;
}

/**
 * Generates realistic female F0 (220 Hz) + F1 (450-800 Hz) + F2 (1200-2200 Hz) spectrum
 * filtered through ElevenLabs' AnalyserNode (`smoothingTimeConstant = 0.8`, `100-8000 Hz` across 1024 bins).
 */
function buildRealisticLiveSpeechTrace(durationSec = 4.0, fps = 60) {
  const totalFrames = Math.round(durationSec * fps);
  const dt = 1 / fps;
  const frames = [];
  const smoothedBins = new Float32Array(1024);
  const byteBins = new Uint8Array(1024);

  // Clear spoken phrases separated by real micro-pauses & sentence pause:
  // [0.25-0.85s], pause 0.85-1.20s, [1.20-2.05s], comma pause 2.05-2.50s, [2.50-3.30s], end pause 3.30-4.00s
  const speechRegions = [
    { start: 0.25, end: 0.85 },
    { start: 1.20, end: 2.05 },
    { start: 2.50, end: 3.30 }
  ];

  for (let f = 0; f < totalFrames; f++) {
    const t = f * dt;
    let targetTrueOpen = 0;
    let f0Amp = 0;
    let f1Amp = 0;
    let f2Amp = 0;
    let sibAmp = 0;

    for (const seg of speechRegions) {
      if (t >= seg.start && t <= seg.end) {
        const local = t - seg.start;
        // Syllable bursts at ~4.5 Hz with inter-syllable dips inside phrase
        const syl = Math.max(0.15, 0.55 + 0.45 * Math.sin(local * Math.PI * 8.5));
        targetTrueOpen = syl;
        f0Amp = 140 * syl;
        f1Amp = 215 * syl; // 400-850 Hz vowel energy (female F1)
        f2Amp = 155 * syl; // 1100-2100 Hz articulation
        sibAmp = local % 0.45 > 0.34 ? 120 : 25;
      }
    }

    // Subtle 2% WebRTC noise floor during pauses
    const noiseLevel = 4;
    for (let i = 0; i < 1024; i++) {
      const hz = 100 + (i / 1024) * 7900;
      let raw = noiseLevel;
      if (hz >= 190 && hz <= 260) raw += f0Amp;
      else if (hz >= 340 && hz <= 900) raw += f1Amp;
      else if (hz >= 1000 && hz <= 2300) raw += f2Amp;
      else if (hz >= 3000 && hz <= 6000) raw += sibAmp;

      // Exact ElevenLabs AnalyserNode smoothingTimeConstant = 0.8 exponential filter!
      smoothedBins[i] = smoothedBins[i] * 0.8 + raw * 0.2;
      byteBins[i] = Math.min(255, Math.round(smoothedBins[i]));
    }

    let sum = 0;
    for (let i = 0; i < 1024; i++) sum += byteBins[i] / 255;
    const elevenLabsVol = sum / 1024;

    frames.push({
      t,
      dt,
      isPause: targetTrueOpen === 0,
      groundTruthOpen: targetTrueOpen,
      volume: elevenLabsVol,
      bins: new Uint8Array(byteBins)
    });
  }

  return frames;
}

test('TDD: analyzeOutputSpectrum resolves female F1/F2 vowel bands instead of sub-200Hz rumble', () => {
  const bins = new Uint8Array(1024);
  // Inject strong female vowel F1 at ~550 Hz (bin index ~58)
  for (let i = 45; i <= 75; i++) bins[i] = 220;
  // Inject F0 pitch at ~225 Hz (bin index ~16)
  for (let i = 14; i <= 20; i++) bins[i] = 180;

  const spec = analyzeOutputSpectrum(bins);
  const old = createBaselineProcessor().analyzeBands(bins);

  assert.ok(spec.f1Energy > 0.25, `F1 vowel band should capture 550 Hz energy (got ${spec.f1Energy})`);
  assert.ok(
    old.consonantEnergy > old.vowelEnergy,
    'Documents baseline bug: baseline misclassified 225 Hz female F0 as consonantEnergy'
  );
});

test('TDD: fallback speech timeline closes mouth cleanly at commas and sentence boundaries', () => {
  const tl = buildSpeechTimeline(
    'Assalamu’alaikum warahmatullahi wabarakatuh. Halo, saya Jasmin.',
    1.05
  );
  assert.equal(tl.words.length, 6);
  assert.ok(tl.totalMs > 1800);

  // Sample strictly inside comma pause after "Halo," (index 3)
  const haloWord = tl.words[3];
  const commaPauseMidMs = haloWord.endMs + 60;
  const pauseSample = sampleSpeechTimeline(tl, commaPauseMidMs);
  assert.equal(pauseSample.inPause, true);
  assert.equal(pauseSample.targetOpen, 0);

  // Sample strictly after sentence ends
  const endSample = sampleSpeechTimeline(tl, tl.totalMs + 20);
  assert.equal(endSample.inPause, true);
  assert.equal(endSample.targetOpen, 0);
});

test('TDD: zero regex anywhere in lipSyncEngine.js', () => {
  const src = readFileSync(new URL('../src/lib/lipSyncEngine.js', import.meta.url), 'utf8');
  assert.equal(src.includes('RegExp'), false);
  assert.equal(src.includes('.match('), false);
  assert.equal(src.includes('.test('), false);
});

test('BENCHMARK: New LipSyncEngine objectively outperforms Baseline on Pause Sync, Silence Leakage, Correlation & MAE', () => {
  const frames = buildRealisticLiveSpeechTrace(4.0, 60);
  const oldProc = createBaselineProcessor();
  const newProc = createLipSyncProcessor();

  const oldSeries = [];
  const newSeries = [];
  const truthSeries = [];

  // Measure live DSP runtime performance
  const tStart = performance.now();
  for (const fr of frames) {
    const oldBands = oldProc.analyzeBands(fr.bins);
    const oldVal = oldProc.step({
      hasLiveMeter: true,
      volume: fr.volume,
      vowelEnergy: oldBands.vowelEnergy,
      consonantEnergy: oldBands.consonantEnergy,
      isSpeaking: !fr.isPause,
      t: fr.t
    });

    const newBands = analyzeOutputSpectrum(fr.bins);
    const newOut = newProc.step({
      hasLiveMeter: true,
      volume: fr.volume,
      ...newBands,
      isSpeaking: !fr.isPause,
      dt: fr.dt
    });

    oldSeries.push(oldVal);
    newSeries.push(newOut.open);
    truthSeries.push(fr.groundTruthOpen);
  }
  const newComputeUsPerFrame = ((performance.now() - tStart) * 1000) / frames.length;

  // 1. Pause Closing Latency (after speech ends at t = 0.85s, 2.05s, 3.30s -> how many ms to drop < 0.05)
  const measureCloseLatencyMs = (series, startOffsetSec) => {
    const idx0 = Math.round(startOffsetSec * 60);
    for (let i = idx0; i < Math.min(series.length, idx0 + 60); i++) {
      if (series[i] < 0.05) return Math.round(((i - idx0) * 1000) / 60);
    }
    return 1000;
  };
  const pauseStarts = [0.86, 2.06, 3.31];
  const oldAvgCloseMs = Math.round(
    pauseStarts.reduce((acc, s) => acc + measureCloseLatencyMs(oldSeries, s), 0) / pauseStarts.length
  );
  const newAvgCloseMs = Math.round(
    pauseStarts.reduce((acc, s) => acc + measureCloseLatencyMs(newSeries, s), 0) / pauseStarts.length
  );

  // 2. False-Open Silence Leakage (% of pure pause frames [>120ms into silence] where mouth stays > 0.05)
  let pauseCheckCount = 0;
  let oldLeakCount = 0;
  let newLeakCount = 0;
  for (let i = 0; i < frames.length; i++) {
    const t = frames[i].t;
    const deepPause = (t > 0.98 && t < 1.19) || (t > 2.18 && t < 2.49) || (t > 3.43 && t < 3.98);
    if (deepPause) {
      pauseCheckCount += 1;
      if (oldSeries[i] > 0.05) oldLeakCount += 1;
      if (newSeries[i] > 0.05) newLeakCount += 1;
    }
  }
  const oldLeakPct = Math.round((oldLeakCount / pauseCheckCount) * 1000) / 10;
  const newLeakPct = Math.round((newLeakCount / pauseCheckCount) * 1000) / 10;

  // 3. Pearson Correlation & Mean Absolute Error against true ground truth vocal openness
  const oldCorr = pearsonCorrelation(truthSeries, oldSeries);
  const newCorr = pearsonCorrelation(truthSeries, newSeries);

  const mae = (pred) =>
    pred.reduce((acc, v, i) => acc + Math.abs(v - truthSeries[i]), 0) / pred.length;
  const oldMae = mae(oldSeries);
  const newMae = mae(newSeries);

  // 4. Fallback Text-Timeline Punctuation Pause Alignment Test
  const fbText = 'Assalamu’alaikum warahmatullahi wabarakatuh. Halo, saya Jasmin, Asisten AI.';
  const tl = buildSpeechTimeline(fbText, 1.05);
  const oldFbProc = createBaselineProcessor();
  const newFbProc = createLipSyncProcessor();
  let fbPauseFrames = 0;
  let oldFbWrongOpen = 0;
  let newFbWrongOpen = 0;

  for (let ms = 0; ms < tl.totalMs; ms += 16) {
    const s = sampleSpeechTimeline(tl, ms);
    const oldV = oldFbProc.step({ hasLiveMeter: false, isSpeaking: true, t: ms / 1000 });
    const newOut = newFbProc.step({
      hasLiveMeter: false,
      isSpeaking: true,
      timelineSample: s,
      dt: 0.016
    });
    if (s.inPause) {
      // Allow 60ms muscle closure settling at boundary, check strict sustained pause accuracy
      const prevSample = sampleSpeechTimeline(tl, Math.max(0, ms - 80));
      if (prevSample.inPause) {
        fbPauseFrames += 1;
        if (oldV > 0.08) oldFbWrongOpen += 1;
        if (newOut.open > 0.08) newFbWrongOpen += 1;
      }
    }
  }
  const oldFbPauseLeakPct = Math.round((oldFbWrongOpen / Math.max(1, fbPauseFrames)) * 1000) / 10;
  const newFbPauseLeakPct = Math.round((newFbWrongOpen / Math.max(1, fbPauseFrames)) * 1000) / 10;

  console.log('\n=== LIP-SYNC & PAUSE SYNCHRONIZATION BENCHMARK (OLD vs NEW) ===');
  console.log(`Pause Close Latency     | Old: ${oldAvgCloseMs} ms | New: ${newAvgCloseMs} ms`);
  console.log(`Deep-Pause Leakage Rate | Old: ${oldLeakPct}% | New: ${newLeakPct}%`);
  console.log(`Envelope Correlation r  | Old: ${oldCorr.toFixed(3)} | New: ${newCorr.toFixed(3)}`);
  console.log(`Mean Abs Error (MAE)    | Old: ${oldMae.toFixed(3)} | New: ${newMae.toFixed(3)}`);
  console.log(`Fallback Comma/Dot Leak | Old: ${oldFbPauseLeakPct}% | New: ${newFbPauseLeakPct}%`);
  console.log(`CPU Cost (60fps target) | New DSP: ${newComputeUsPerFrame.toFixed(2)} us/frame (budget 16,667 us)\n`);

  // Quantitative Proof Assertions
  assert.ok(newAvgCloseMs < oldAvgCloseMs, `New pause close (${newAvgCloseMs}ms) must beat Old (${oldAvgCloseMs}ms)`);
  assert.ok(newAvgCloseMs <= 120, `Pause closure must snap cleanly <= 120ms (got ${newAvgCloseMs}ms)`);
  assert.ok(newLeakPct < oldLeakPct, `New pause leakage (${newLeakPct}%) must beat Old (${oldLeakPct}%)`);
  assert.equal(newLeakPct, 0, `Deep pauses should have 0% false mouth chatter (got ${newLeakPct}%)`);
  assert.ok(newCorr > oldCorr, `Correlation must improve (new=${newCorr.toFixed(3)} vs old=${oldCorr.toFixed(3)})`);
  assert.ok(newMae < oldMae, `MAE must improve (new=${newMae.toFixed(3)} vs old=${oldMae.toFixed(3)})`);
  assert.ok(newFbPauseLeakPct < oldFbPauseLeakPct, 'Fallback punctuation pauses must eliminate chewing across commas/periods');
  assert.ok(newFbPauseLeakPct <= 2, `Fallback pause leakage should be <= 2% (got ${newFbPauseLeakPct}%)`);
});

test('TDD Audit: steady low ambient noise & punctuation-only tokens never latch gate', () => {
  // 1. Cold-start steady WebRTC ambient noise (1.6% and 3.9%) must stay silent (0 latch)
  for (const level of [4, 10]) {
    const proc = createLipSyncProcessor();
    const bins = new Uint8Array(1024).fill(level);
    const bands = analyzeOutputSpectrum(bins);
    let maxOpen = 0;
    let latchedCount = 0;
    for (let f = 0; f < 120; f++) {
      const out = proc.step({
        hasLiveMeter: true,
        volume: level / 255,
        ...bands,
        isSpeaking: true,
        dt: 1 / 60
      });
      maxOpen = Math.max(maxOpen, out.open);
      if (out.gateActive) latchedCount += 1;
    }
    assert.equal(latchedCount, 0, `Ambient noise fill(${level}) must not latch gate`);
    assert.ok(maxOpen < 0.02, `Ambient noise fill(${level}) maxOpen (${maxOpen}) must be near 0`);
  }

  // 2. Punctuation-only tokens ("..." and "—") must emit only pauses, never open mouth words
  const tl = buildSpeechTimeline('Baik ... lanjut — mari', 1.0);
  assert.equal(tl.words.length, 3);

  // 3. 30 Hz low-power refresh rate preserves rapid pause closing (<= 140 ms)
  const frames30 = buildRealisticLiveSpeechTrace(2.0, 30);
  const proc30 = createLipSyncProcessor();
  const series30 = [];
  for (const fr of frames30) {
    const bands = analyzeOutputSpectrum(fr.bins);
    series30.push(
      proc30.step({
        hasLiveMeter: true,
        volume: fr.volume,
        ...bands,
        isSpeaking: !fr.isPause,
        dt: fr.dt
      }).open
    );
  }
  const idxPauseStart30 = Math.round(0.86 * 30);
  let closeMs30 = 1000;
  for (let i = idxPauseStart30; i < Math.min(series30.length, idxPauseStart30 + 20); i++) {
    if (series30[i] < 0.05) {
      closeMs30 = Math.round(((i - idxPauseStart30) * 1000) / 30);
      break;
    }
  }
  assert.ok(closeMs30 <= 140, `30 Hz pause close (${closeMs30}ms) must stay <= 140ms`);
});
