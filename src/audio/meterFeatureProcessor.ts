import { clamp01 } from '../utils/clamp';
import type { AudioFeatures, MeterFeatureProcessor } from './types';

const SMOOTHING = 0.35;
const TRANSIENT_SCALE = 0.35;
const SILENCE_THRESHOLD = 0.018;
const METER_FLOOR_DB = -72;
const METER_CEILING_DB = -12;

export const dbToEnergy = (meterDb: number | undefined): number => {
  if (!Number.isFinite(meterDb) || (meterDb ?? -160) <= METER_FLOOR_DB) return 0;

  const normalized = clamp01(
    ((meterDb ?? METER_FLOOR_DB) - METER_FLOOR_DB) /
      (METER_CEILING_DB - METER_FLOOR_DB),
  );

  return Math.sqrt(normalized);
};

export function createMeterFeatureProcessor(): MeterFeatureProcessor {
  let previousEnergy = 0;

  return {
    process(meterDb, timestampMs) {
      const rawEnergy = dbToEnergy(meterDb);
      const energy = previousEnergy + (rawEnergy - previousEnergy) * SMOOTHING;
      const transient = clamp01(
        Math.max(0, energy - previousEnergy) / TRANSIENT_SCALE,
      );
      const low = energy;
      const mid = clamp01(energy * 0.72 + transient * 0.28);
      const high = clamp01(energy * 0.35 + transient * 0.65);

      previousEnergy = energy;

      return {
        timestampMs,
        energy,
        low,
        mid,
        high,
        transient,
        silence: energy < SILENCE_THRESHOLD,
      };
    },
    reset() {
      previousEnergy = 0;
    },
  };
}
