import { Group, LinearGradient, Text } from '@shopify/react-native-skia';
import type { SkFont, Transforms3d } from '@shopify/react-native-skia';
import { memo } from 'react';
import type { ReactElement } from 'react';
import { interpolateColor, useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { Entrance, Hold, Palette } from '../direction/types';
import type { PlacedGlyph } from './layout';
import { derivePulse, glyphTransform } from './motion';
import type { GlyphTransform } from './motion';
import { BODY_FOOT, BODY_TOP } from './surgeColors';
import type { BeatSharedValues } from './useBeatSharedValues';

/**
 * The ink's body (visual overhaul spec §3c.1): top-to-bottom gradient colours
 * for ink glyphs and for accent glyphs, derived once per frame by the stage
 * and shared by every glyph (see surgeColors `inkBody` / `accentBody`).
 */
export interface GlyphBody {
  ink: SharedValue<string[]>;
  accent: SharedValue<string[]>;
}

export interface GlyphLayerProps {
  glyphs: readonly PlacedGlyph[];
  /** Font for a glyph of the given pixel size (emphasized glyphs are larger). */
  fontFor: (sizePx: number) => SkFont;
  /** Monotonic ms clock advanced on the UI thread; see LyricStage. */
  time: SharedValue<number>;
  /** When the line appeared, on the same clock as `time`. */
  lineStartedAtMs: number;
  /**
   * Beat head the entrance lands on, when the scheduler confirmed the line
   * ahead of it. The entrance clock is then anchored here (elapsed runs
   * negative during the anticipation window). Null when the line starts on
   * the lyric clock as usual.
   */
  lineLandsAtMs?: number | null;
  /**
   * When the line ends on the same clock as `time` (the stage-clock end,
   * derived from the next line's start). Drives the emphasis colour migration.
   * Null when there is no next line: emphasized glyphs then take the accent
   * colour statically, as before.
   */
  lineEndsAtMs?: number | null;
  entrance: Entrance;
  hold: Hold;
  palette: Palette;
  /**
   * The palette's ink and accent as they stand now, interpolated on the UI
   * thread with the surge (surgeColors). When omitted the palette's static
   * strings are used.
   */
  inkValue?: SharedValue<string> | null;
  accentValue?: SharedValue<string> | null;
  /**
   * Fill each glyph with the body gradient (one shader child per Text, so the
   * draw count is unchanged). When omitted the glyphs are filled flat with
   * their colour.
   */
  body?: GlyphBody | null;
  /** Draw emphasized glyphs in `palette.accent` instead of `palette.ink`. */
  accent: boolean;
  /**
   * The line is set in a heavy face (bold weight or gothic-heavy): each glyph
   * gets a same-colour stroke twin under its fill, whose width rides the beat
   * so the glyphs swell on beat heads (groove analysis 4.3). Limited to heavy
   * lines because stroking a mincho face crushes its hairlines, and because
   * the extra draw doubles this layer's glyph count.
   */
  heavy?: boolean;
  /** This layer is a leaving line: glyphs play the exit derived from `entrance`. */
  exiting?: boolean;
  beat: BeatSharedValues;
  reducedMotion: boolean;
  /** Per-line seed for the motion's deterministic jitter. */
  seed: number;
  /** Amplitude coefficient for the song's tempo feel (motion's TEMPO_FEEL_FACTOR). */
  feel: number;
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
  inkValue = null,
  accentValue = null,
  body = null,
  accent,
  testIDPrefix = 'glyph',
  ...motion
}: GlyphLayerProps) {
  // Emphasized glyphs light up in order as the line progresses, so each one
  // needs its rank among the emphasized and their total.
  const emphasisCount = glyphs.filter((g) => g.emphasized).length;
  let emphasisSeen = 0;
  return (
    <>
      {glyphs.map((glyph, order) => {
        const emphasisOrder = glyph.emphasized ? emphasisSeen++ : -1;
        return (
          <AnimatedGlyph
            key={glyph.index}
            glyph={glyph}
            order={order}
            glyphCount={glyphs.length}
            font={fontFor(glyph.sizePx)}
            ink={palette.ink}
            accentColor={palette.accent}
            inkValue={inkValue}
            accentValue={accentValue}
            body={body}
            emphasisOrder={emphasisOrder}
            emphasisCount={emphasisCount}
            testID={`${testIDPrefix}-${glyph.index}`}
            accent={accent}
            {...motion}
          />
        );
      })}
    </>
  );
});

interface AnimatedGlyphProps extends Pick<
  GlyphLayerProps,
  | 'time'
  | 'lineStartedAtMs'
  | 'lineLandsAtMs'
  | 'lineEndsAtMs'
  | 'entrance'
  | 'hold'
  | 'accent'
  | 'heavy'
  | 'exiting'
  | 'beat'
  | 'reducedMotion'
  | 'seed'
  | 'feel'
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
  ink: string;
  accentColor: string;
  inkValue: SharedValue<string> | null;
  accentValue: SharedValue<string> | null;
  body: GlyphBody | null;
  /** Rank among the line's emphasized glyphs; -1 when this glyph is not emphasized. */
  emphasisOrder: number;
  /** How many glyphs of the line are emphasized. */
  emphasisCount: number;
  testID: string;
}

function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * How far an emphasized glyph has migrated to the accent, 0..1: the line's
 * progress, sliced so the emphasized glyphs take the accent one after another.
 */
function emphasisMigration(
  timeMs: number,
  lineStartedAtMs: number,
  lineEndsAtMs: number,
  emphasisOrder: number,
  emphasisCount: number,
): number {
  'worklet';
  const progress = clamp01((timeMs - lineStartedAtMs) / (lineEndsAtMs - lineStartedAtMs));
  return clamp01(progress * emphasisCount - emphasisOrder);
}

interface MigratingBodyProps {
  start: { x: number; y: number };
  end: { x: number; y: number };
  body: GlyphBody;
  time: SharedValue<number>;
  lineStartedAtMs: number;
  lineEndsAtMs: number;
  emphasisOrder: number;
  emphasisCount: number;
}

/**
 * The body of an emphasized glyph while it migrates: each stop goes from the
 * ink body to the accent body. Only emphasized glyphs (at most a handful per
 * line) mount this; every other glyph uses the shared gradient as it is.
 */
function MigratingBody({
  start,
  end,
  body,
  time,
  lineStartedAtMs,
  lineEndsAtMs,
  emphasisOrder,
  emphasisCount,
}: MigratingBodyProps) {
  const colors = useDerivedValue<string[]>(() => {
    const local = emphasisMigration(time.value, lineStartedAtMs, lineEndsAtMs, emphasisOrder, emphasisCount);
    const ink = body.ink.value;
    const accentStops = body.accent.value;
    return [
      interpolateColor(local, [0, 1], [ink[0]!, accentStops[0]!]),
      interpolateColor(local, [0, 1], [ink[1]!, accentStops[1]!]),
    ];
  }, [body, lineStartedAtMs, lineEndsAtMs, emphasisOrder, emphasisCount]);
  return <LinearGradient start={start} end={end} colors={colors} />;
}

function AnimatedGlyph({
  glyph,
  order,
  glyphCount,
  font,
  ink,
  accentColor,
  inkValue,
  accentValue,
  body,
  emphasisOrder,
  emphasisCount,
  testID,
  time,
  lineStartedAtMs,
  lineLandsAtMs = null,
  lineEndsAtMs = null,
  entrance,
  hold,
  accent,
  heavy = false,
  exiting = false,
  beat,
  reducedMotion,
  seed,
  feel,
}: AnimatedGlyphProps) {
  const { bar, confidence, lastOnsetAtMs, nextBeatAtMs, periodMs, low } = beat;
  const { emphasized, rotateDeg } = glyph;
  const phaseOffset = glyph.phaseOffset ?? 0;
  // An idle glyph may be marked accent (drawn in the accent outright, with no
  // migration) or carry an opacity multiplier (visual overhaul spec §3e).
  const glyphAccent = glyph.accent === true;
  const alpha = glyph.alpha ?? 1;
  // The entrance clock: anchored at the landing when the scheduler confirmed
  // the line ahead of a beat head, at the line's start otherwise.
  const anchorMs = lineLandsAtMs ?? lineStartedAtMs;
  const anticipationMs =
    lineLandsAtMs !== null ? Math.max(0, lineLandsAtMs - lineStartedAtMs) : 0;

  const motion = useDerivedValue<GlyphTransform>(
    () =>
      glyphTransform({
        entrance,
        hold,
        elapsedMs: time.value - anchorMs,
        glyphIndex: order,
        glyphCount,
        emphasized,
        timeMs: time.value,
        lastOnsetAtMs: lastOnsetAtMs.value,
        nextBeatAtMs: nextBeatAtMs.value,
        periodMs: periodMs.value,
        low: low.value,
        feel,
        bar: bar.value,
        confidence: confidence.value,
        reducedMotion,
        seed,
        phaseOffset,
        anticipationMs,
        exiting,
      }),
    [
      entrance,
      hold,
      anchorMs,
      anticipationMs,
      exiting,
      order,
      glyphCount,
      emphasized,
      reducedMotion,
      seed,
      feel,
      phaseOffset,
    ],
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
  const opacity = useDerivedValue(() => motion.value.opacity * alpha, [alpha]);
  // Emphasis migrates: across the line's span the emphasized glyphs take the
  // accent colour one after another (each ramps over its own slice of the
  // progress). This states where inside the line we are, in line units only —
  // never a guess at which word is being sung. The ink and accent themselves
  // are the stage's surge-interpolated colours when it provides them.
  const color = useDerivedValue<string>(() => {
    const inkNow = inkValue === null ? ink : inkValue.value;
    const accentNow = accentValue === null ? accentColor : accentValue.value;
    if (glyphAccent) return accentNow;
    if (!accent || !emphasized || emphasisOrder < 0) return inkNow;
    if (lineEndsAtMs === null || lineEndsAtMs <= lineStartedAtMs) return accentNow;
    const local = emphasisMigration(time.value, lineStartedAtMs, lineEndsAtMs, emphasisOrder, emphasisCount);
    return interpolateColor(local, [0, 1], [inkNow, accentNow]);
  }, [
    glyphAccent,
    accent,
    emphasized,
    emphasisOrder,
    emphasisCount,
    ink,
    accentColor,
    inkValue,
    accentValue,
    lineEndsAtMs,
    lineStartedAtMs,
  ]);
  // The stroke twin's width rides the beat's low band (groove analysis 4.3),
  // under the same low-confidence gate as every beat-derived motion.
  const strokeWidth = useDerivedValue<number>(() => {
    if (!heavy) return 0;
    const damp = confidence.value < 0.5 ? 0.25 : 1;
    return (
      glyph.sizePx * 0.02 * derivePulse(time.value, lastOnsetAtMs.value) * low.value * damp
    );
  }, [heavy]);

  // The body gradient runs from the glyph's top to its foot in glyph
  // coordinates; a rotated glyph turns it with the Group. The shader takes the
  // fill's colour over (`color` still carries the alpha), so a migrating
  // emphasized glyph needs its own gradient; the rest share the stage's.
  let fill: ReactElement | null = null;
  if (body !== null) {
    const start = { x: glyph.x, y: glyph.y + glyph.sizePx * BODY_TOP };
    const end = { x: glyph.x, y: glyph.y + glyph.sizePx * BODY_FOOT };
    if (glyphAccent) {
      fill = <LinearGradient start={start} end={end} colors={body.accent} />;
    } else if (!accent || !emphasized || emphasisOrder < 0) {
      fill = <LinearGradient start={start} end={end} colors={body.ink} />;
    } else if (lineEndsAtMs === null || lineEndsAtMs <= lineStartedAtMs) {
      fill = <LinearGradient start={start} end={end} colors={body.accent} />;
    } else {
      fill = (
        <MigratingBody
          start={start}
          end={end}
          body={body}
          time={time}
          lineStartedAtMs={lineStartedAtMs}
          lineEndsAtMs={lineEndsAtMs}
          emphasisOrder={emphasisOrder}
          emphasisCount={emphasisCount}
        />
      );
    }
  }

  // Skia's Group types omit testID; it is only read by tests under the Skia mock.
  const testProps = { testID } as object;
  return (
    <Group transform={transform} origin={{ x: glyph.x, y: glyph.y }} opacity={opacity} {...testProps}>
      {heavy ? (
        <Text
          x={glyph.x}
          y={glyph.y}
          text={glyph.char}
          font={font}
          color={color}
          style="stroke"
          strokeWidth={strokeWidth}
        >
          {fill}
        </Text>
      ) : null}
      <Text x={glyph.x} y={glyph.y} text={glyph.char} font={font} color={color}>
        {fill}
      </Text>
    </Group>
  );
}
