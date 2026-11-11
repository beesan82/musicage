import { Group, Text } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import { memo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { PlainRun } from './plainSheet';
import { PLAIN_EXIT_MS, plainBodyOpacity } from './plainSheet';

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
  const opacity = useDerivedValue(() => {
    if (timing.kind === 'leaving') {
      if (reducedMotion) return 0;
      const p = (time.value - timing.startMs) / PLAIN_EXIT_MS;
      return timing.fromOpacity * (p <= 0 ? 1 : p >= 1 ? 0 : 1 - p);
    }
    if (reducedMotion) return 1;
    return plainBodyOpacity(time.value - timing.startMs);
  }, [timing, reducedMotion]);
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
