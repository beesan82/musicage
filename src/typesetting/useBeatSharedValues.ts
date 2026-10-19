import { useEffect, useMemo } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { BeatState } from '../beat/types';

export interface BeatSharedValues {
  pulse: SharedValue<number>;
  phase: SharedValue<number>;
  bar: SharedValue<number>;
  confidence: SharedValue<number>;
  energy: SharedValue<number>;
}

/**
 * Mirrors the beat onto shared values so UI-thread worklets can read it.
 * Values are assigned directly: the beat engine already smooths them, and a
 * timing animation would lag the pulse behind the beat.
 */
export function useBeatSharedValues(beat: BeatState): BeatSharedValues {
  const pulse = useSharedValue(beat.pulse);
  const phase = useSharedValue(beat.phase);
  const bar = useSharedValue(beat.bar);
  const confidence = useSharedValue(beat.confidence);
  const energy = useSharedValue(beat.energy);

  useEffect(() => {
    pulse.value = beat.pulse;
    phase.value = beat.phase;
    bar.value = beat.bar;
    confidence.value = beat.confidence;
    energy.value = beat.energy;
  }, [bar, beat.bar, beat.confidence, beat.energy, beat.phase, beat.pulse, confidence, energy, phase, pulse]);

  return useMemo(() => ({ pulse, phase, bar, confidence, energy }), [bar, confidence, energy, phase, pulse]);
}
