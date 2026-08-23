export interface AudioFeatures {
  timestampMs: number;
  energy: number;
  low: number;
  mid: number;
  high: number;
  transient: number;
  silence: boolean;
}

export interface FeatureProcessor {
  process(
    samples: Float32Array,
    sampleRate: number,
    timestampMs: number,
  ): AudioFeatures;
  reset(): void;
}
