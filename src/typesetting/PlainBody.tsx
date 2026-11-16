import { Group, Text } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import { memo, useEffect, useState } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { PlainRun } from './plainSheet';
import { PLAIN_BODY_FADE_MS, PLAIN_EXIT_MS, plainBodyOpacity } from './plainSheet';

/** Slack on the timer that stops the opacity following the clock after the fade in, ms. */
const REST_SLACK_MS = 50;

export interface PlainBodyProps {
  /** Every run of the text: the whole sheet's body, drawn at once. */
  runs: readonly PlainRun[];
  font: SkFont;
  /** The palette's ink as it is: never the surge-driven ink (the body does not answer the music). */
  color: string;
  /** The stage clock. */
  time: SharedValue<number>;
  timing:
    /** On stage: fades in once from `startMs` (plainBodyOpacity), then stays. */
    | { kind: 'shown'; startMs: number }
    /** Leaving: fades from `fromOpacity` to 0 over PLAIN_EXIT_MS from `startMs`. */
    | { kind: 'leaving'; startMs: number; fromOpacity: number };
  reducedMotion: boolean;
  testID: string;
}

/**
 * The lyric sheet's body (plainSheet.ts), the whole text at once: plain Skia
 * text in the flat ink, one Text per run, no per-glyph motion. Its only
 * animated value is the group's opacity, derived on the UI thread from the
 * stage clock alone: one fade in, and one fade out when the sheet leaves.
 * Nothing in it changes with time in between, and no beat, energy or song
 * position reaches it. Under reduced motion it is simply shown.
 */
export const PlainBody = memo(function PlainBody({ runs, font, color, time, timing, reducedMotion, testID }: PlainBodyProps) {
  // Once the shown body has faded in it stays at 1 for good (plainBodyOpacity),
  // so the opacity stops following the clock: a derived value re-runs whenever
  // a shared value its worklet captures changes, so after the fade it captures
  // none. One timer, re-armed if the clock has not got there yet. The leaving
  // body is removed after its fade (LyricStage), so it follows the clock to the end.
  const shownStartMs = timing.kind === 'shown' && !reducedMotion ? timing.startMs : null;
  const [restingFromMs, setRestingFromMs] = useState<number | null>(null);
  const rests = shownStartMs !== null && restingFromMs === shownStartMs;
  useEffect(() => {
    if (shownStartMs === null || rests) return undefined;
    let id: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const remaining = shownStartMs + PLAIN_BODY_FADE_MS - time.value;
      if (remaining <= 0) {
        setRestingFromMs(shownStartMs);
        return;
      }
      id = setTimeout(check, (Number.isFinite(remaining) ? remaining : 0) + REST_SLACK_MS);
    };
    check();
    return () => {
      if (id !== undefined) clearTimeout(id);
    };
  }, [shownStartMs, rests, time]);
  const clock = rests ? null : time;
  const opacity = useDerivedValue(() => {
    if (clock === null) return 1;
    if (timing.kind === 'leaving') {
      if (reducedMotion) return 0;
      const p = (clock.value - timing.startMs) / PLAIN_EXIT_MS;
      return timing.fromOpacity * (p <= 0 ? 1 : p >= 1 ? 0 : 1 - p);
    }
    if (reducedMotion) return 1;
    return plainBodyOpacity(clock.value - timing.startMs);
  }, [timing, reducedMotion, rests]);
  return (
    <Group opacity={opacity} {...({ testID } as object)}>
      {runs.map((run, i) => (
        <Text
          key={i}
          x={run.x}
          y={run.y}
          text={run.text}
          font={font}
          color={color}
          {...(run.rotateDeg === 90 ? { transform: [{ rotate: Math.PI / 2 }], origin: { x: run.x, y: run.y } } : {})}
          {...({ testID: `${testID}-run-${i}` } as object)}
        />
      ))}
    </Group>
  );
});
