import { Group } from '@shopify/react-native-skia';
import { useEffect, useReducer, useRef } from 'react';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { PrintArea } from '../typesetting/layout';
import type { BeatSharedValues } from '../typesetting/useBeatSharedValues';
import { VIZ_GAIN } from './discipline';
import { crossfadeIn, lineClearance, PATTERN_CROSSFADE_MS, planStageVisualizer } from './patterns';
import type { Box, VisualizerKey, VisualizerStage } from './patterns';
import { isDrawable, rendererFor } from './registry';
import type { PatternRendererProps } from './registry';

/** Slack on the timer that drops the outgoing pattern after its crossfade, ms. */
const CROSSFADE_SLACK_MS = 80;

export interface StageVisualizerProps {
  stage: VisualizerStage;
  /** The song's chosen pattern; null until it is chosen (and on the clock). */
  songPattern: VisualizerKey | null;
  row: { x: number; width: number; baseline: number };
  area: PrintArea | null;
  /** The line on stage's bounds (the synced stage only): a back pattern keeps clear of them. */
  lineBounds: Box | null;
  beat: BeatSharedValues;
  ink: SharedValue<string>;
  accent: SharedValue<string>;
  /** The stage clock (performance.now() basis): the crossfade runs on it. */
  time: SharedValue<number>;
  reducedMotion: boolean;
  /** Prefix of the pattern's testIDs; the outgoing pattern's are `leaving-${testIDPrefix}`. */
  testIDPrefix: string;
}

interface Shown {
  key: VisualizerKey;
  /** When it replaced another pattern on this stage, on the stage clock; null if it was the first. */
  sinceMs: number | null;
}

/**
 * One stage's visualizer (design spec §9.1): the pattern planStageVisualizer
 * gives the stage, drawn by its renderer (registry.tsx). When the song's
 * pattern arrives while the stage is up (it is chosen 8 s or more into the
 * song), the pattern on show hands over to it once, by a PATTERN_CROSSFADE_MS
 * crossfade on the UI thread; under reduced motion it is swapped at once. The
 * stage mounts one of these per stage kind (keyed), so a change of stage is
 * the stages' own hand-over, not a crossfade.
 */
export function StageVisualizer({
  stage,
  songPattern,
  row,
  area,
  lineBounds,
  beat,
  ink,
  accent,
  time,
  reducedMotion,
  testIDPrefix,
}: StageVisualizerProps) {
  const plan = planStageVisualizer(stage, songPattern, isDrawable);
  const shownRef = useRef<Shown>({ key: plan.key, sinceMs: null });
  const leavingRef = useRef<{ key: VisualizerKey; atMs: number } | null>(null);
  if (shownRef.current.key !== plan.key) {
    const now = performance.now();
    leavingRef.current = reducedMotion ? null : { key: shownRef.current.key, atMs: now };
    shownRef.current = { key: plan.key, sinceMs: reducedMotion ? null : now };
  }
  const leaving = leavingRef.current;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const leavingAtMs = leaving?.atMs ?? null;
  useEffect(() => {
    if (leavingAtMs === null) return undefined;
    const id = setTimeout(
      () => {
        // The crossfade is over: the outgoing pattern goes, and the incoming
        // one stands at its full opacity without following the clock.
        leavingRef.current = null;
        shownRef.current = { key: shownRef.current.key, sinceMs: null };
        bump();
      },
      Math.max(0, leavingAtMs + PATTERN_CROSSFADE_MS - performance.now()) + CROSSFADE_SLACK_MS,
    );
    return () => clearTimeout(id);
  }, [leavingAtMs]);

  const sinceMs = shownRef.current.sinceMs;
  const scale = plan.opacityScale;
  // The two opacities follow the stage clock only during a crossfade. A
  // derived value re-runs whenever a shared value its worklet captures
  // changes, whether or not the branch taken reads it, so outside a crossfade
  // (most of the stage's life, and always under reduced motion) they capture
  // a clock that never moves instead of `time`, which moves every frame.
  const still = useSharedValue(0);
  const fadeClock = sinceMs === null ? still : time;
  const incoming = useDerivedValue(
    () => (sinceMs === null ? 1 : crossfadeIn(fadeClock.value - sinceMs)) * scale,
    [sinceMs, scale],
  );
  const outgoing = useDerivedValue(
    () => (sinceMs === null ? 0 : 1 - crossfadeIn(fadeClock.value - sinceMs)),
    [sinceMs],
  );

  const clearance = plan.clearsLine && lineBounds !== null ? lineClearance(lineBounds) : null;
  const common: Omit<PatternRendererProps, 'testIDPrefix' | 'opacityScale'> = {
    row,
    area,
    clearance,
    beat,
    ink,
    accent,
    reducedMotion,
    gain: VIZ_GAIN,
  };
  const Shown = rendererFor(plan.key).Component;
  const Leaving = leaving !== null ? rendererFor(leaving.key).Component : null;
  return (
    <>
      {Leaving !== null ? (
        <Group opacity={outgoing}>
          <Leaving {...common} opacityScale={1} testIDPrefix={`leaving-${testIDPrefix}`} />
        </Group>
      ) : null}
      <Group opacity={incoming} {...({ testID: `pattern-${testIDPrefix}-${plan.key}` } as object)}>
        <Shown {...common} opacityScale={scale} testIDPrefix={testIDPrefix} />
      </Group>
    </>
  );
}
