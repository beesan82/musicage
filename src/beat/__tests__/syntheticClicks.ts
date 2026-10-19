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
