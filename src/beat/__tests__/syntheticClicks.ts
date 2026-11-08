import type { EarFeatures } from '../../audio/types';

const PEAK = 0.9;
const NOISE_FLOOR = 0.05;
const DECAY_MS = 80;

// A click track: rms = low = 0.9 on every beat, decaying exponentially (80 ms)
// to a 0.05 floor. Beats fall at k * 60000 / bpm, which need not sit on the
// sampling grid.
export const generateClicks = (
  bpm: number,
  durationMs: number,
  intervalMs = 20,
): EarFeatures[] => {
  const periodMs = 60000 / bpm;
  const samples: EarFeatures[] = [];
  for (let t = 0; t < durationMs; t += intervalMs) {
    const sinceBeat = Math.max(0, t - Math.floor(t / periodMs + 1e-9) * periodMs);
    const value = NOISE_FLOOR + (PEAK - NOISE_FLOOR) * Math.exp(-sinceBeat / DECAY_MS);
    samples.push({ timestampMs: t, rms: value, low: value, mid: value, high: value });
  }
  return samples;
};

export interface AccentedClickOptions {
  /** Beats per bar of the pattern (4 for 4/4, 3 for a 3/4-like input). */
  beatsPerBar?: number;
  /** Which beat of the bar carries the accent (0-based). */
  accentBeat?: number;
  /** Peak of the un-accented beats; the accent peaks at 0.9 like a plain click. */
  weakPeak?: number;
  intervalMs?: number;
}

/**
 * A click track with one accented beat per bar: the accent is a full click
 * (0.9 in every band), the other beats a weaker one. Used to feed the bar-head
 * estimation a downbeat that stands out in `low`.
 */
export const generateAccentedClicks = (
  bpm: number,
  durationMs: number,
  { beatsPerBar = 4, accentBeat = 0, weakPeak = 0.4, intervalMs = 20 }: AccentedClickOptions = {},
): EarFeatures[] => {
  const periodMs = 60000 / bpm;
  const samples: EarFeatures[] = [];
  for (let t = 0; t < durationMs; t += intervalMs) {
    const beat = Math.floor(t / periodMs + 1e-9);
    const sinceBeat = Math.max(0, t - beat * periodMs);
    const peak = beat % beatsPerBar === accentBeat ? PEAK : weakPeak;
    const value = NOISE_FLOOR + (peak - NOISE_FLOOR) * Math.exp(-sinceBeat / DECAY_MS);
    samples.push({ timestampMs: t, rms: value, low: value, mid: value, high: value });
  }
  return samples;
};

/** Times (ms) of the accented clicks of `generateAccentedClicks` inside [fromMs, toMs). */
export const accentTimes = (
  bpm: number,
  fromMs: number,
  toMs: number,
  { beatsPerBar = 4, accentBeat = 0 }: Pick<AccentedClickOptions, 'beatsPerBar' | 'accentBeat'> = {},
): number[] => {
  const periodMs = 60000 / bpm;
  const times: number[] = [];
  for (let beat = 0; beat * periodMs < toMs; beat += 1) {
    const t = beat * periodMs;
    if (t >= fromMs && beat % beatsPerBar === accentBeat) times.push(t);
  }
  return times;
};

/** Times (ms) of the un-accented clicks of `generateAccentedClicks` inside [fromMs, toMs). */
export const weakTimes = (
  bpm: number,
  fromMs: number,
  toMs: number,
  { beatsPerBar = 4, accentBeat = 0 }: Pick<AccentedClickOptions, 'beatsPerBar' | 'accentBeat'> = {},
): number[] => {
  const periodMs = 60000 / bpm;
  const times: number[] = [];
  for (let beat = 0; beat * periodMs < toMs; beat += 1) {
    const t = beat * periodMs;
    if (t >= fromMs && beat % beatsPerBar !== accentBeat) times.push(t);
  }
  return times;
};
