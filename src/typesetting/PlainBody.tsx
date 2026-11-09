import { Group, Text } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import { memo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { PlainPage } from './plainSheet';
import { PLAIN_EXIT_MS, plainPageIndex, plainPageOpacity } from './plainSheet';

export interface PlainBodyProps {
  page: PlainPage;
  font: SkFont;
  /** The palette's ink as it is: never the surge-driven ink (the body does not answer the music). */
  color: string;
  /** The stage clock. */
  time: SharedValue<number>;
  /**
   * On stage: when the body starts (its opacity follows plainPageOpacity from
   * here), how many pages there are and which one this is. The opacity is 0
   * whenever the clock says another page is up, so a page-turn timer landing
   * a little late never shows the old page in the new page's fade.
   */
  timing:
    | { kind: 'page'; startMs: number; pageCount: number; pageIndex: number }
    /** Leaving: fades from `fromOpacity` to 0 over PLAIN_EXIT_MS from `startMs`. */
    | { kind: 'leaving'; startMs: number; fromOpacity: number };
  reducedMotion: boolean;
  testID: string;
}

/**
 * One page of the lyric sheet's body (plainSheet.ts): plain Skia text in the
 * flat ink, one Text per run, no per-glyph motion. Its only animated value is
 * the group's opacity, derived on the UI thread from the stage clock and the
 * fixed page timing alone: no beat, energy or song position reaches it.
 * Under reduced motion a page on stage is simply shown.
 */
export const PlainBody = memo(function PlainBody({ page, font, color, time, timing, reducedMotion, testID }: PlainBodyProps) {
  const opacity = useDerivedValue(() => {
    if (timing.kind === 'leaving') {
      if (reducedMotion) return 0;
      const p = (time.value - timing.startMs) / PLAIN_EXIT_MS;
      return timing.fromOpacity * (p <= 0 ? 1 : p >= 1 ? 0 : 1 - p);
    }
    if (reducedMotion) return 1;
    const elapsed = time.value - timing.startMs;
    if (plainPageIndex(elapsed, timing.pageCount) !== timing.pageIndex) return 0;
    return plainPageOpacity(elapsed, timing.pageCount);
  }, [timing, reducedMotion]);
  return (
    <Group opacity={opacity} {...({ testID } as object)}>
      {page.runs.map((run, i) => (
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
