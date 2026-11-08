import { clamp01 } from '../utils/clamp';

// Surge ("盛り上がり") detection, design spec §4 (2026-11-07): a passage is a
// surge when the moving average of `energy` and `low` over 8 bars sits in the
// top 30% of the song's own cumulative distribution. Pure helpers below, and
// a small tracker (createEnergyProfile) that composes them per ear frame.
//
// Guards (spec §4, groove analysis 5.3): never while the beat confidence is
// below 0.5, never within 8 s of silence ending, and never while the song's
// history is too shallow to know what "top 30%" means.

/** The profile samples the level once per hop; the ear's 20 ms frames are decimated to this. */
export const PROFILE_HOP_MS = 100;
/** The moving-average window in bars (the plan allows 8–16; the short end keeps the first chorus reachable). */
export const PROFILE_WINDOW_BARS = 8;
/** Period assumed while the engine has no grid (120 BPM). */
export const PROFILE_DEFAULT_PERIOD_MS = 500;
export const PROFILE_MIN_WINDOW_MS = 8_000;
export const PROFILE_MAX_WINDOW_MS = 32_000;
/** Histogram resolution of the cumulative distribution over 0..1. */
export const PROFILE_BINS = 64;
/** A surge is a moving average in the top 30% of the song so far. */
export const SURGE_TOP_FRACTION = 0.3;
export const SURGE_MIN_CONFIDENCE = 0.5;
/** No surge within this long of silence ending (the start of a song is not a chorus). */
export const SURGE_SILENCE_HOLDOFF_MS = 8_000;
/** No surge until the distribution holds at least this much history. */
export const SURGE_MIN_HISTORY_MS = 16_000;
/**
 * The strength ramps from 0 at the 70th percentile to 1 at the 95th; a song
 * whose distribution is narrower than this is given this much ramp so the
 * strength stays continuous instead of snapping.
 */
export const SURGE_MIN_SPREAD = 0.08;
/** Time constants of the smoothed surge the stage reads (fast in, slow out). */
export const SURGE_ATTACK_MS = 600;
export const SURGE_RELEASE_MS = 1_500;

const MAX_GAP_MS = 1_000;
const MAX_WINDOW_SAMPLES = PROFILE_MAX_WINDOW_MS / PROFILE_HOP_MS;

export interface EnergySample {
  timestampMs: number;
  /** The beat engine's slow rms follower, 0..1. */
  energy: number;
  /** The ear frame's low band, 0..1. */
  low: number;
  /** The beat engine's confidence, 0..1. */
  confidence: number;
  silence: boolean;
  /** Beat period in ms; null while there is no grid. */
  periodMs: number | null;
}

export interface Surge {
  active: boolean;
  /** 0 outside a surge, rising to 1 at the song's loudest passages. */
  strength: number;
}

export const NO_SURGE: Surge = { active: false, strength: 0 };

/** The level the profile tracks: energy and low weighted equally. */
export function levelOf(energy: number, low: number): number {
  return clamp01((clamp01(energy) + clamp01(low)) / 2);
}

/** The moving-average window for a beat period: PROFILE_WINDOW_BARS of 4/4, clamped. */
export function profileWindowMs(periodMs: number | null): number {
  const period = periodMs !== null && periodMs > 0 ? periodMs : PROFILE_DEFAULT_PERIOD_MS;
  const window = PROFILE_WINDOW_BARS * 4 * period;
  return Math.min(PROFILE_MAX_WINDOW_MS, Math.max(PROFILE_MIN_WINDOW_MS, window));
}

/** Mean of the last `windowSamples` levels (all of them while there are fewer); 0 when empty. */
export function movingAverage(levels: readonly number[], windowSamples: number): number {
  const count = Math.min(levels.length, Math.max(1, Math.floor(windowSamples)));
  if (count <= 0 || levels.length === 0) return 0;
  let sum = 0;
  for (let i = levels.length - count; i < levels.length; i += 1) sum += levels[i] ?? 0;
  return sum / count;
}

/** The histogram bin of a 0..1 value. */
export function binOf(value: number): number {
  return Math.min(PROFILE_BINS - 1, Math.floor(clamp01(value) * PROFILE_BINS));
}

/**
 * The value at quantile `q` of a histogram over 0..1: the upper edge of the
 * bin in which the cumulative count reaches `q` of `total`. 0 with no history.
 */
export function percentile(histogram: readonly number[], total: number, q: number): number {
  if (total <= 0) return 0;
  const target = q * total;
  let cumulative = 0;
  for (let bin = 0; bin < histogram.length; bin += 1) {
    cumulative += histogram[bin] ?? 0;
    if (cumulative >= target) return (bin + 1) / histogram.length;
  }
  return 1;
}

/**
 * Surge strength of a moving average against the distribution: 0 at the
 * (1 − SURGE_TOP_FRACTION) quantile, 1 at the 95th, linear between, with a
 * floor on the ramp width (SURGE_MIN_SPREAD).
 */
export function surgeStrength(current: number, lowQuantile: number, highQuantile: number): number {
  const spread = Math.max(highQuantile - lowQuantile, SURGE_MIN_SPREAD);
  return clamp01((current - lowQuantile) / spread);
}

export interface SurgeGuardInput {
  confidence: number;
  /** Time since silence last ended (or since the profile started). */
  sinceSilenceMs: number;
  /** How much of the song the distribution holds. */
  historyMs: number;
}

/** The guards of spec §4: trusted beat, past the silence hold-off, enough history. */
export function surgeAllowed({ confidence, sinceSilenceMs, historyMs }: SurgeGuardInput): boolean {
  return (
    confidence >= SURGE_MIN_CONFIDENCE &&
    sinceSilenceMs >= SURGE_SILENCE_HOLDOFF_MS &&
    historyMs >= SURGE_MIN_HISTORY_MS
  );
}

/**
 * One step of the smoothed surge the stage reads: a first-order follower
 * with a fast attack and a slow release, so the palette and the glow ceiling
 * rise within a beat or two and ease back over a bar.
 */
export function smoothSurge(current: number, target: number, dtMs: number): number {
  if (!(dtMs > 0)) return current;
  const tau = target > current ? SURGE_ATTACK_MS : SURGE_RELEASE_MS;
  return current + (target - current) * (1 - Math.exp(-dtMs / tau));
}

export interface EnergyProfile {
  /** Feeds one ear frame (with the beat state it produced) and returns the surge now. */
  push(sample: EnergySample): Surge;
  /** Forgets the song: a new track starts its distribution from nothing. */
  reset(): void;
}

/**
 * The per-song tracker. Levels are decimated to PROFILE_HOP_MS, averaged over
 * the window, and the averages enter the song's histogram one window late:
 * the passage being judged never counts against itself, so the first chorus
 * reads as a surge even while it is a large share of the song so far.
 * Silent frames are skipped entirely (they are not part of the song's
 * distribution, and the needle lifted must not make everything after it loud).
 */
export function createEnergyProfile(): EnergyProfile {
  let levels: number[] = [];
  let pending: number[] = [];
  const histogram: number[] = new Array<number>(PROFILE_BINS).fill(0);
  let total = 0;
  let lastSampleMs = Number.NaN;
  let nextHopMs = Number.NaN;
  let lastSilentMs = Number.NaN;
  let rawStrength = 0;

  const clear = () => {
    levels = [];
    pending = [];
    histogram.fill(0);
    total = 0;
    lastSampleMs = Number.NaN;
    nextHopMs = Number.NaN;
    lastSilentMs = Number.NaN;
    rawStrength = 0;
  };

  const push = (sample: EnergySample): Surge => {
    const t = sample.timestampMs;
    if (Number.isNaN(lastSampleMs) || t < lastSampleMs || t - lastSampleMs > MAX_GAP_MS) {
      clear();
      lastSilentMs = t;
      nextHopMs = t;
    }
    lastSampleMs = t;
    if (sample.silence) {
      lastSilentMs = t;
      nextHopMs = t + PROFILE_HOP_MS;
      return NO_SURGE;
    }
    const windowMs = profileWindowMs(sample.periodMs);
    const windowSamples = Math.round(windowMs / PROFILE_HOP_MS);
    if (t >= nextHopMs) {
      nextHopMs = t + PROFILE_HOP_MS;
      levels.push(levelOf(sample.energy, sample.low));
      if (levels.length > MAX_WINDOW_SAMPLES) levels.shift();
      const average = movingAverage(levels, windowSamples);
      pending.push(average);
      while (pending.length > windowSamples) {
        const aged = pending.shift()!;
        histogram[binOf(aged)] = (histogram[binOf(aged)] ?? 0) + 1;
        total += 1;
      }
      const lowQuantile = percentile(histogram, total, 1 - SURGE_TOP_FRACTION);
      const highQuantile = percentile(histogram, total, 0.95);
      rawStrength = surgeStrength(average, lowQuantile, highQuantile);
    }
    const allowed = surgeAllowed({
      confidence: sample.confidence,
      sinceSilenceMs: t - lastSilentMs,
      historyMs: total * PROFILE_HOP_MS,
    });
    const strength = allowed ? rawStrength : 0;
    return { active: strength > 0, strength };
  };

  return { push, reset: clear };
}
