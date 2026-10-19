export interface AudioFeatures {
  timestampMs: number;
  energy: number;
  low: number;
  mid: number;
  high: number;
  transient: number;
  silence: boolean;
}

export type { EarFeatures } from '../../modules/expo-musicage-ear/src/types';

export type ListeningStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'denied'
  | 'error';

export interface MeterFeatureProcessor {
  process(meterDb: number | undefined, timestampMs: number): AudioFeatures;
  reset(): void;
}
