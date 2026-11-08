import { Blur, Group, Text } from '@shopify/react-native-skia';
import type { SkFont, Transforms3d } from '@shopify/react-native-skia';
import { memo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { Entrance, Hold } from '../direction/types';
import type { PlacedGlyph } from './layout';
import { derivePulse, glyphTransform } from './motion';
import type { GlyphTransform } from './motion';
import { GLOW_MAX_GLYPHS, glowAmount, glowOpacity, glowRadiusPx } from './surgeColors';
import type { BeatSharedValues } from './useBeatSharedValues';

export interface GlowLayerProps {
  /** The line's placed glyphs; only the emphasized ones (at most GLOW_MAX_GLYPHS) glow. */
  glyphs: readonly PlacedGlyph[];
  fontFor: (sizePx: number) => SkFont;
  /** The stage clock; see LyricStage. */
  time: SharedValue<number>;
  lineStartedAtMs: number;
  lineLandsAtMs?: number | null;
  entrance: Entrance;
  hold: Hold;
  /** The colour the glow is painted in: the stage's surge-interpolated accent. */
  color: SharedValue<string>;
  beat: BeatSharedValues;
  seed: number;
  feel: number;
  /** testID of each glow's Group is `${testIDPrefix}-${glyph.index}`. */
  testIDPrefix?: string;
}

/**
 * The beat-head glow of the current line (design spec §5, 2026-11-07): a
 * blurred twin under each emphasized glyph, lit by the beat pulse while the
 * surge lasts and dark otherwise. The twin follows the same motion as its
 * glyph so it never detaches during an entrance. Drawn under the glyph layer.
 * Its radius stays under the spec's 10 px, it is limited to three glyphs,
 * and it is only ever a one-off decay from a beat head: no steady glow.
 */
export const GlowLayer = memo(function GlowLayer({
  glyphs,
  fontFor,
  color,
  testIDPrefix = 'glow',
  ...motion
}: GlowLayerProps) {
  const glowing: { glyph: PlacedGlyph; order: number }[] = [];
  glyphs.forEach((glyph, order) => {
    if (glyph.emphasized && glowing.length < GLOW_MAX_GLYPHS) glowing.push({ glyph, order });
  });
  if (glowing.length === 0) return null;
  return (
    <>
      {glowing.map(({ glyph, order }) => (
        <GlowGlyph
          key={glyph.index}
          glyph={glyph}
          order={order}
          glyphCount={glyphs.length}
          font={fontFor(glyph.sizePx)}
          color={color}
          testID={`${testIDPrefix}-${glyph.index}`}
          {...motion}
        />
      ))}
    </>
  );
});

interface GlowGlyphProps extends Pick<
  GlowLayerProps,
  'time' | 'lineStartedAtMs' | 'lineLandsAtMs' | 'entrance' | 'hold' | 'beat' | 'seed' | 'feel' | 'color'
> {
  glyph: PlacedGlyph;
  order: number;
  glyphCount: number;
  font: SkFont;
  testID: string;
}

function GlowGlyph({
  glyph,
  order,
  glyphCount,
  font,
  color,
  testID,
  time,
  lineStartedAtMs,
  lineLandsAtMs = null,
  entrance,
  hold,
  beat,
  seed,
  feel,
}: GlowGlyphProps) {
  const { bar, confidence, lastOnsetAtMs, nextBeatAtMs, periodMs, low, surge } = beat;
  const { rotateDeg } = glyph;
  const anchorMs = lineLandsAtMs ?? lineStartedAtMs;
  const anticipationMs = lineLandsAtMs !== null ? Math.max(0, lineLandsAtMs - lineStartedAtMs) : 0;

  // The same motion as the glyph above it (GlyphLayer's AnimatedGlyph).
  const motion = useDerivedValue<GlyphTransform>(
    () =>
      glyphTransform({
        entrance,
        hold,
        elapsedMs: time.value - anchorMs,
        glyphIndex: order,
        glyphCount,
        emphasized: true,
        timeMs: time.value,
        lastOnsetAtMs: lastOnsetAtMs.value,
        nextBeatAtMs: nextBeatAtMs.value,
        periodMs: periodMs.value,
        low: low.value,
        feel,
        bar: bar.value,
        confidence: confidence.value,
        reducedMotion: false,
        seed,
        phaseOffset: glyph.phaseOffset ?? 0,
        anticipationMs,
        exiting: false,
      }),
    [entrance, hold, anchorMs, anticipationMs, order, glyphCount, seed, feel, glyph.phaseOffset],
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
  const amount = useDerivedValue<number>(() =>
    glowAmount(derivePulse(time.value, lastOnsetAtMs.value), surge.value, confidence.value),
  );
  const opacity = useDerivedValue<number>(() => motion.value.opacity * glowOpacity(amount.value));
  const radius = useDerivedValue<number>(() => glowRadiusPx(amount.value));

  // Skia's Group types omit testID; it is only read by tests under the Skia mock.
  const testProps = { testID } as object;
  return (
    <Group transform={transform} origin={{ x: glyph.x, y: glyph.y }} opacity={opacity} {...testProps}>
      <Text x={glyph.x} y={glyph.y} text={glyph.char} font={font} color={color}>
        <Blur blur={radius} />
      </Text>
    </Group>
  );
}
