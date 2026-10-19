import { Group, Text } from '@shopify/react-native-skia';
import type { SkFont, Transforms3d } from '@shopify/react-native-skia';
import { memo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { Entrance, Hold, Palette } from '../direction/types';
import type { PlacedGlyph } from './layout';
import { glyphTransform } from './motion';
import type { GlyphTransform } from './motion';
import type { BeatSharedValues } from './useBeatSharedValues';

export interface GlyphLayerProps {
  glyphs: readonly PlacedGlyph[];
  /** Font for a glyph of the given pixel size (emphasized glyphs are larger). */
  fontFor: (sizePx: number) => SkFont;
  /** Monotonic ms clock advanced on the UI thread; see LyricStage. */
  time: SharedValue<number>;
  /** When the line appeared, on the same clock as `time`. */
  lineStartedAtMs: number;
  entrance: Entrance;
  hold: Hold;
  palette: Palette;
  /** Draw emphasized glyphs in `palette.accent` instead of `palette.ink`. */
  accent: boolean;
  beat: BeatSharedValues;
  reducedMotion: boolean;
  /** Per-line seed for the motion's deterministic jitter. */
  seed: number;
  /** testID of each glyph's Group is `${testIDPrefix}-${glyph.index}`. */
  testIDPrefix?: string;
}

/**
 * One animated Skia Group per glyph. The transform and opacity are derived on
 * the UI thread from shared values, so nothing here re-renders per frame.
 */
export const GlyphLayer = memo(function GlyphLayer({
  glyphs,
  fontFor,
  palette,
  accent,
  testIDPrefix = 'glyph',
  ...motion
}: GlyphLayerProps) {
  return (
    <>
      {glyphs.map((glyph, order) => (
        <AnimatedGlyph
          key={glyph.index}
          glyph={glyph}
          order={order}
          glyphCount={glyphs.length}
          font={fontFor(glyph.sizePx)}
          color={accent && glyph.emphasized ? palette.accent : palette.ink}
          testID={`${testIDPrefix}-${glyph.index}`}
          {...motion}
        />
      ))}
    </>
  );
});

interface AnimatedGlyphProps extends Pick<
  GlyphLayerProps,
  'time' | 'lineStartedAtMs' | 'entrance' | 'hold' | 'beat' | 'reducedMotion' | 'seed'
> {
  glyph: PlacedGlyph;
  /**
   * Position among the placed (non-space) glyphs. `glyph.index` is the code-point
   * index and counts spaces, while `glyphCount` does not, so the stagger and the
   * per-glyph hash use this instead.
   */
  order: number;
  glyphCount: number;
  font: SkFont;
  color: string;
  testID: string;
}

function AnimatedGlyph({
  glyph,
  order,
  glyphCount,
  font,
  color,
  testID,
  time,
  lineStartedAtMs,
  entrance,
  hold,
  beat,
  reducedMotion,
  seed,
}: AnimatedGlyphProps) {
  const { pulse, phase, bar, confidence } = beat;
  const { emphasized, rotateDeg } = glyph;

  const motion = useDerivedValue<GlyphTransform>(
    () =>
      glyphTransform({
        entrance,
        hold,
        elapsedMs: time.value - lineStartedAtMs,
        glyphIndex: order,
        glyphCount,
        emphasized,
        pulse: pulse.value,
        phase: phase.value,
        bar: bar.value,
        confidence: confidence.value,
        reducedMotion,
        seed,
      }),
    [entrance, hold, lineStartedAtMs, order, glyphCount, emphasized, reducedMotion, seed],
  );
  const transform = useDerivedValue<Transforms3d>(
    () => [
      { translateX: motion.value.dx },
      { translateY: motion.value.dy },
      { rotate: ((rotateDeg + motion.value.rotateDeg) * Math.PI) / 180 },
      { scale: motion.value.scale },
    ],
    [rotateDeg],
  );
  const opacity = useDerivedValue(() => motion.value.opacity);

  // Skia's Group types omit testID; it is only read by tests under the Skia mock.
  const testProps = { testID } as object;
  return (
    <Group transform={transform} origin={{ x: glyph.x, y: glyph.y }} opacity={opacity} {...testProps}>
      <Text x={glyph.x} y={glyph.y} text={glyph.char} font={font} color={color} />
    </Group>
  );
}
