export interface AudioFeatures {
  timestampMs: number;
  energy: number;
  low: number;
  mid: number;
  high: number;
  transient: number;
  silence: boolean;
}

export interface MeterFeatureProcessor {
  process(meterDb: number | undefined, timestampMs: number): AudioFeatures;
  reset(): void;
}
