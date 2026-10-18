import type { EarFeatures } from '../audio/types';

export interface BeatState {
  bpm: number | null;
  confidence: number;
  phase: number;
  pulse: number;
  bar: number;
  nextBeatAtMs: number | null;
  energy: number;
  silence: boolean;
}

export interface BeatEngineOptions {
  windowMs?: number;
  minBpm?: number;
  maxBpm?: number;
}

export interface BeatEngine {
  push(features: EarFeatures): BeatState;
  reset(): void;
}

export const SILENCE_RMS = 0.018;

export const DEFAULT_WINDOW_MS = 8000;
export const DEFAULT_MIN_BPM = 60;
export const DEFAULT_MAX_BPM = 180;
