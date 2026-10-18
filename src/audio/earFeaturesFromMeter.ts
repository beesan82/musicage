import { clamp01 } from '../utils/clamp';
import { dbToEnergy } from './meterFeatureProcessor';
import type { EarFeatures } from './types';

export interface MeterEarAdapter {
  process(meterDb: number | undefined, timestampMs: number): EarFeatures;
  reset(): void;
}

// Unsmoothed on purpose: the beat engine does its own smoothing.
export function createMeterEarAdapter(): MeterEarAdapter {
  let previousEnergy = 0;

  return {
    process(meterDb, timestampMs) {
      const energy = dbToEnergy(meterDb);
      const rise = Math.max(0, energy - previousEnergy);

      previousEnergy = energy;

      return {
        timestampMs,
        rms: energy,
        low: energy,
        mid: clamp01(energy * 0.6 + rise * 0.4),
        high: clamp01(energy * 0.3 + rise * 0.7),
      };
    },
    reset() {
      previousEnergy = 0;
    },
  };
}
