import { useMemo, useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { EarFeatures } from '../audio/types';
import type { BeatState } from '../beat/types';

export interface BeatSharedValues {
  /** The engine's staircase pulse, written every ear frame (20 ms). */
  pulse: SharedValue<number>;
  /** The engine's staircase phase, written every ear frame. */
  phase: SharedValue<number>;
  bar: SharedValue<number>;
  confidence: SharedValue<number>;
  energy: SharedValue<number>;
  /** Stage-clock time of the last onset the engine locked onto; 0 if none yet. */
  lastOnsetAtMs: SharedValue<number>;
  /** Predicted next beat head on the stage clock; 0 while there is no grid. */
  nextBeatAtMs: SharedValue<number>;
  /** Beat period in ms; 0 while there is no grid. */
  periodMs: SharedValue<number>;
  /** Smoothed band envelopes (attack 20 ms, release 150 ms). */
  low: SharedValue<number>;
  mid: SharedValue<number>;
  high: SharedValue<number>;
  /**
   * Writes one ear frame and the beat state it produced straight to the
   * shared values. Called on every frame from the stage source's subscribe,
   * independent of the throttled React publish: assigning shared values never
   * re-renders, and worklets derive the continuous pulse / phase from these
   * (see motion.ts) instead of stepping through React state.
   */
  write: (frame: EarFeatures, state: BeatState) => void;
}

const ENVELOPE_ATTACK_MS = 20;
const ENVELOPE_RELEASE_MS = 150;

export function useBeatSharedValues(): BeatSharedValues {
  const pulse = useSharedValue(0);
  const phase = useSharedValue(0);
  const bar = useSharedValue(0);
  const confidence = useSharedValue(0);
  const energy = useSharedValue(0);
  const lastOnsetAtMs = useSharedValue(0);
  const nextBeatAtMs = useSharedValue(0);
  const periodMs = useSharedValue(0);
  const low = useSharedValue(0);
  const mid = useSharedValue(0);
  const high = useSharedValue(0);

  const envelope = useRef({ low: 0, mid: 0, high: 0, atMs: Number.NaN });
  const previousPulse = useRef(0);

  return useMemo(() => {
    const write = (frame: EarFeatures, state: BeatState) => {
      pulse.value = state.pulse;
      phase.value = state.phase;
      bar.value = state.bar;
      confidence.value = state.confidence;
      energy.value = state.energy;
      nextBeatAtMs.value = state.nextBeatAtMs ?? 0;
      periodMs.value = state.bpm === null ? 0 : 60_000 / state.bpm;
      // A rising pulse edge is an onset the engine locked onto. The frame's
      // timestamp is on the stage clock (performance.now()), the same basis
      // the stage's `time` shared value runs on.
      if (state.pulse > previousPulse.current) {
        lastOnsetAtMs.value = frame.timestampMs;
      }
      previousPulse.current = state.pulse;

      const env = envelope.current;
      if (Number.isNaN(env.atMs)) {
        env.low = frame.low;
        env.mid = frame.mid;
        env.high = frame.high;
      } else {
        const dt = Math.max(0, frame.timestampMs - env.atMs);
        const smooth = (current: number, target: number) => {
          const tau = target > current ? ENVELOPE_ATTACK_MS : ENVELOPE_RELEASE_MS;
          return current + (target - current) * (1 - Math.exp(-dt / tau));
        };
        env.low = smooth(env.low, frame.low);
        env.mid = smooth(env.mid, frame.mid);
        env.high = smooth(env.high, frame.high);
      }
      env.atMs = frame.timestampMs;
      low.value = env.low;
      mid.value = env.mid;
      high.value = env.high;
    };
    return {
      pulse,
      phase,
      bar,
      confidence,
      energy,
      lastOnsetAtMs,
      nextBeatAtMs,
      periodMs,
      low,
      mid,
      high,
      write,
    };
  }, [
    bar,
    confidence,
    energy,
    high,
    lastOnsetAtMs,
    low,
    mid,
    nextBeatAtMs,
    periodMs,
    phase,
    pulse,
  ]);
}
