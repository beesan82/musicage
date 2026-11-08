import type { EarFeatures } from '../audio/types';

export interface BeatState {
  bpm: number | null;
  confidence: number;
  phase: number;
  pulse: number;
  /**
   * Bar count (4/4 assumed). Counted from the estimated bar head while one is
   * trusted (see `barConfidence`), every four beats otherwise. Never decreases
   * and never jumps: a re-alignment of the bar head only moves the next
   * increment.
   */
  bar: number;
  /** Confidence 0..1 of the bar-head estimate; 0 while there is no estimate. */
  barConfidence: number;
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
