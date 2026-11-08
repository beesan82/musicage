import type { EarFeatures } from '../audio/types';
import { clamp01 } from '../utils/clamp';
import {
  DEFAULT_MAX_BPM,
  DEFAULT_MIN_BPM,
  DEFAULT_WINDOW_MS,
  SILENCE_RMS,
  type BeatEngine,
  type BeatEngineOptions,
  type BeatState,
} from './types';

const GRID_MS = 20;
const LOW_AVERAGE_SAMPLES = 100 / GRID_MS;
const TEMPO_UPDATE_SAMPLES = 500 / GRID_MS;
const ONSET_HISTORY_SAMPLES = 2000 / GRID_MS;
const MIN_ONSET_HISTORY_SAMPLES = 500 / GRID_MS;
const ONSET_SIGMAS = 2;
const MIN_ONSET_STRENGTH = 0.02;
const ONSET_REFRACTORY_MS = 100;
const PHASE_PULL = 0.3;
const PULSE_DECAY = Math.exp(-GRID_MS / 120);
const ENERGY_ALPHA = 1 - Math.exp(-GRID_MS / 400);
const SILENCE_HOLD_MS = 500;
// A gap longer than this (a backgrounded mic, a stop/start without reset) is
// not interpolated across: the engine starts over from the new sample.
const MAX_GAP_MS = 1000;
const SILENCE_CONFIDENCE_DECAY = Math.exp(-GRID_MS / 1000);
// Lags scoring within this fraction of the best peak count as the same tempo
// family; the shortest one wins so a 120 BPM click does not lock at 60.
const OCTAVE_TOLERANCE = 0.7;
const BEATS_PER_BAR = 4;

// Bar-head (downbeat) estimation, design spec §3 (2026-11-07): the low-band
// onset strength is accumulated per beat-in-bar slot over a 4-beat cycle and
// the strongest slot is taken as the bar head once it stands out clearly.
// Each slot forgets with this factor per beat (about 8 bars of memory).
const BAR_HISTOGRAM_DECAY = Math.exp(-1 / (8 * BEATS_PER_BAR));
// A slot is a bar head when it exceeds the runner-up slot by this fraction of
// itself; an established head is kept until its margin drops below the lower
// value (hysteresis against flip-flopping). A 4/4 click with equal beats has a
// margin near 0; a 3/4 accent walks through all four slots and peaks near 0.26
// while the first rotations accumulate, so the lock threshold sits well above.
const BAR_LOCK_MARGIN = 0.4;
const BAR_UNLOCK_MARGIN = 0.2;
// No estimate before two bars of beats have passed and the winning slot has
// received at least two onsets, so one loud hit does not pick a head.
const BAR_MIN_BEATS = 2 * BEATS_PER_BAR;
const BAR_MIN_SLOT_ONSETS = 2;
// A tempo re-lock this far from the previous period renumbers the beats, so
// the slots accumulated so far no longer mean the same thing.
const BAR_TEMPO_RESET_RATIO = 0.1;

interface Tempo {
  periodMs: number;
  confidence: number;
}

const autocorrelate = (onsets: number[], lag: number) => {
  let sum = 0;
  for (let i = lag; i < onsets.length; i += 1) sum += onsets[i]! * onsets[i - lag]!;
  return sum / (onsets.length - lag);
};

// Spreads each onset over ±40 ms so a beat whose onset lands on alternating
// grid samples (a non-integer period, or a coarse 60 ms meter) still forms a
// single autocorrelation peak instead of two half-height ones.
const SMOOTHING_KERNEL = [1, 2, 3, 2, 1].map((weight) => weight / 9);

const smooth = (values: number[]) => {
  const reach = (SMOOTHING_KERNEL.length - 1) / 2;
  return values.map((_, index) => {
    let sum = 0;
    SMOOTHING_KERNEL.forEach((weight, k) => {
      sum += weight * (values[index + k - reach] ?? 0);
    });
    return sum;
  });
};

// Autocorrelates the onset-strength window over the allowed lag range and
// returns the beat period, refined by parabolic interpolation.
const estimateTempo = (rawOnsets: number[], minLag: number, maxLag: number): Tempo | null => {
  const onsets = smooth(rawOnsets);
  const firstLag = Math.ceil(minLag);
  const lastLag = Math.floor(maxLag);
  const scores = new Map<number, number>();
  for (let lag = firstLag - 1; lag <= lastLag + 1; lag += 1) {
    scores.set(lag, autocorrelate(onsets, lag));
  }
  const score = (lag: number) => scores.get(lag) ?? 0;

  let best = -Infinity;
  let bestLag = firstLag;
  let sum = 0;
  const peaks: number[] = [];
  for (let lag = firstLag; lag <= lastLag; lag += 1) {
    const value = score(lag);
    sum += value;
    if (value > best) {
      best = value;
      bestLag = lag;
    }
    // The shortest allowed lag may sit on the flank of a peak just past maxBpm.
    const risesFromLeft = lag === firstLag || value >= score(lag - 1);
    if (risesFromLeft && value > score(lag + 1)) peaks.push(lag);
  }
  if (best <= 0) return null;
  const mean = sum / (lastLag - firstLag + 1);

  const bestPeak = peaks.reduce((max, lag) => Math.max(max, score(lag)), 0);
  const chosen = peaks.find((lag) => score(lag) >= bestPeak * OCTAVE_TOLERANCE) ?? bestLag;

  const before = score(chosen - 1);
  const peak = score(chosen);
  const after = score(chosen + 1);
  const curvature = before - 2 * peak + after;
  const offset = curvature < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (before - after)) / curvature)) : 0;

  return {
    periodMs: Math.min(maxLag, Math.max(minLag, chosen + offset)) * GRID_MS,
    confidence: clamp01((peak - mean) / (peak + 1e-6)),
  };
};

const meanAndDeviation = (values: number[]) => {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return { mean, deviation: Math.sqrt(variance) };
};

export const createBeatEngine = (options: BeatEngineOptions = {}): BeatEngine => {
  const windowSamples = Math.round((options.windowMs ?? DEFAULT_WINDOW_MS) / GRID_MS);
  const minLag = 60000 / (options.maxBpm ?? DEFAULT_MAX_BPM) / GRID_MS;
  const maxLag = 60000 / (options.minBpm ?? DEFAULT_MIN_BPM) / GRID_MS;

  let previousSample: EarFeatures | null = null;
  let nextGridMs = 0;
  let previousRms = 0;
  let recentLows: number[] = [];
  let onsets: number[] = [];
  let samplesSinceTempo = 0;
  let periodMs: number | null = null;
  let confidence = 0;
  // Fraction of the current beat. Kept in [-0.5, 1): an onset that lands just
  // before the predicted beat counts that beat and leaves the phase slightly
  // negative until the clock catches up.
  let phase = 0;
  let beats = 0;
  let pulse = 0;
  let energy = 0;
  let quietSinceMs: number | null = null;
  let silence = false;
  let lastOnsetMs: number | null = null;
  let lastGridMs = 0;
  // Bar-head estimation: low-onset strength per beat-in-bar slot (decayed per
  // beat), the undecayed onset count per slot, beats seen since the histogram
  // was last cleared, the slot currently trusted as the bar head (null = none,
  // bars count every four beats from the lock) and its margin.
  const barHistogram: number[] = new Array<number>(BEATS_PER_BAR).fill(0);
  const barSlotOnsets: number[] = new Array<number>(BEATS_PER_BAR).fill(0);
  let barHistogramBeats = 0;
  let downbeatSlot: number | null = null;
  let barConfidence = 0;
  // Keeps `bar` continuous across re-alignments of the head: the count never
  // jumps, the next increment simply lands on the next head of the new
  // alignment (one bar is then shorter or longer than four beats, once).
  let barOrigin = 0;

  const rawBar = () => Math.floor((beats - (downbeatSlot ?? 0)) / BEATS_PER_BAR);
  const barCount = () => Math.max(0, barOrigin + rawBar());

  const state = (): BeatState => ({
    bpm: periodMs === null ? null : 60000 / periodMs,
    confidence,
    phase: phase < 0 ? phase + 1 : phase,
    pulse,
    bar: barCount(),
    barConfidence,
    nextBeatAtMs: periodMs === null ? null : lastGridMs - phase * periodMs + periodMs,
    energy,
    silence,
  });

  // How clearly `slot` leads the other three: (top − runner-up) / top, 0..1.
  const slotMargin = (slot: number) => {
    const top = barHistogram[slot]!;
    if (top <= 0) return 0;
    let other = 0;
    for (let k = 0; k < BEATS_PER_BAR; k += 1) {
      if (k !== slot && barHistogram[k]! > other) other = barHistogram[k]!;
    }
    return clamp01((top - other) / top);
  };

  const realignBars = (slot: number | null) => {
    const current = barCount();
    downbeatSlot = slot;
    barOrigin = current - rawBar();
  };

  const clearBarHistogram = () => {
    barHistogram.fill(0);
    barSlotOnsets.fill(0);
    barHistogramBeats = 0;
    if (downbeatSlot !== null) realignBars(null);
    barConfidence = 0;
  };

  const advanceBeat = () => {
    beats += 1;
    barHistogramBeats += 1;
    for (let k = 0; k < BEATS_PER_BAR; k += 1) {
      barHistogram[k] = (barHistogram[k] ?? 0) * BAR_HISTOGRAM_DECAY;
    }
  };

  // Called on each onset the engine locked onto, after the phase pull has
  // settled which beat the onset belongs to.
  const accumulateBarHead = (lowOnset: number) => {
    const slot = beats % BEATS_PER_BAR;
    barHistogram[slot] = (barHistogram[slot] ?? 0) + lowOnset;
    barSlotOnsets[slot] = (barSlotOnsets[slot] ?? 0) + 1;

    if (downbeatSlot !== null) {
      const margin = slotMargin(downbeatSlot);
      if (margin >= BAR_UNLOCK_MARGIN) {
        barConfidence = margin;
        return;
      }
    }
    let best = 0;
    for (let k = 1; k < BEATS_PER_BAR; k += 1) {
      if (barHistogram[k]! > barHistogram[best]!) best = k;
    }
    const ready =
      barHistogramBeats >= BAR_MIN_BEATS && barSlotOnsets[best]! >= BAR_MIN_SLOT_ONSETS;
    const margin = slotMargin(best);
    if (ready && margin >= BAR_LOCK_MARGIN) {
      if (best !== downbeatSlot) realignBars(best);
      barConfidence = margin;
    } else {
      if (downbeatSlot !== null) realignBars(null);
      barConfidence = 0;
    }
  };

  const detectOnset = (strength: number) => {
    if (onsets.length < MIN_ONSET_HISTORY_SAMPLES) return false;
    const { mean, deviation } = meanAndDeviation(onsets.slice(-ONSET_HISTORY_SAMPLES));
    return strength > Math.max(MIN_ONSET_STRENGTH, mean + ONSET_SIGMAS * deviation);
  };

  const step = (timeMs: number, rms: number, low: number) => {
    lastGridMs = timeMs;
    const lowAverage =
      recentLows.length === 0 ? low : recentLows.reduce((total, value) => total + value, 0) / recentLows.length;
    const lowOnset = Math.max(0, low - lowAverage);
    const strength = 0.7 * lowOnset + 0.3 * Math.max(0, rms - previousRms);
    recentLows = [...recentLows, low].slice(-LOW_AVERAGE_SAMPLES);
    previousRms = rms;

    energy += (rms - energy) * ENERGY_ALPHA;
    if (rms < SILENCE_RMS) quietSinceMs ??= timeMs;
    else quietSinceMs = null;
    silence = quietSinceMs !== null && timeMs - quietSinceMs >= SILENCE_HOLD_MS;

    pulse *= PULSE_DECAY;
    if (periodMs !== null) {
      phase += GRID_MS / periodMs;
      while (phase >= 1) {
        phase -= 1;
        advanceBeat();
      }
    }

    const isOnset =
      detectOnset(strength) && (lastOnsetMs === null || timeMs - lastOnsetMs >= ONSET_REFRACTORY_MS);
    onsets.push(strength);
    if (onsets.length > windowSamples) onsets.shift();

    if (silence) {
      pulse = 0;
      confidence *= SILENCE_CONFIDENCE_DECAY;
      return;
    }

    if (isOnset) {
      lastOnsetMs = timeMs;
      pulse = 1;
      if (periodMs !== null) {
        if (phase < 0.5) {
          phase *= 1 - PHASE_PULL;
        } else {
          advanceBeat();
          phase = (phase - 1) * (1 - PHASE_PULL);
        }
        accumulateBarHead(lowOnset);
      }
    }

    samplesSinceTempo += 1;
    if (onsets.length >= windowSamples && samplesSinceTempo >= TEMPO_UPDATE_SAMPLES) {
      samplesSinceTempo = 0;
      const tempo = estimateTempo(onsets, minLag, maxLag);
      if (tempo) {
        if (periodMs === null) {
          phase = lastOnsetMs === null ? 0 : ((timeMs - lastOnsetMs) / tempo.periodMs) % 1;
        } else if (Math.abs(tempo.periodMs - periodMs) > BAR_TEMPO_RESET_RATIO * periodMs) {
          clearBarHistogram();
        }
        periodMs = tempo.periodMs;
        confidence = tempo.confidence;
      }
    }
  };

  const reset = () => {
    previousSample = null;
    nextGridMs = 0;
    previousRms = 0;
    recentLows = [];
    onsets = [];
    samplesSinceTempo = 0;
    periodMs = null;
    confidence = 0;
    phase = 0;
    beats = 0;
    pulse = 0;
    energy = 0;
    quietSinceMs = null;
    silence = false;
    lastOnsetMs = null;
    lastGridMs = 0;
    barHistogram.fill(0);
    barSlotOnsets.fill(0);
    barHistogramBeats = 0;
    downbeatSlot = null;
    barConfidence = 0;
    barOrigin = 0;
  };

  const push = (features: EarFeatures): BeatState => {
    if (previousSample !== null) {
      const elapsed = features.timestampMs - previousSample.timestampMs;
      if (elapsed === 0) return state();
      // Time moving backwards (a clock restart) is treated like a long gap.
      if (elapsed < 0 || elapsed > MAX_GAP_MS) reset();
    }
    const previous = previousSample;
    if (previous === null) {
      previousRms = features.rms;
      energy = features.rms;
      step(features.timestampMs, features.rms, features.low);
      nextGridMs = features.timestampMs + GRID_MS;
    } else {
      // Resample onto the 20 ms grid by linear interpolation between samples.
      const span = features.timestampMs - previous.timestampMs;
      while (nextGridMs <= features.timestampMs) {
        const t = (nextGridMs - previous.timestampMs) / span;
        step(
          nextGridMs,
          previous.rms + (features.rms - previous.rms) * t,
          previous.low + (features.low - previous.low) * t,
        );
        nextGridMs += GRID_MS;
      }
    }
    previousSample = features;
    return state();
  };

  return { push, reset };
};
