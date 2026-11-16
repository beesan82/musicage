import { Group, LinearGradient, Text } from '@shopify/react-native-skia';
import type { SkFont, Transforms3d } from '@shopify/react-native-skia';
import { memo, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { interpolateColor, useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { Entrance, Hold, Palette } from '../direction/types';
import type { PlacedGlyph } from './layout';
import { derivePulse, entranceDurationMs, glyphTransform, SETTLED_TRANSFORM } from './motion';
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

/** Slack on the timer that stops a still layer's motion once its entrance is over, ms. */
const SETTLE_SLACK_MS = 50;

interface SettleInput {
  time: SharedValue<number>;
  periodMs: SharedValue<number>;
  entrance: Entrance;
  hold: Hold;
  exiting: boolean;
  reducedMotion: boolean;
  anchorMs: number;
  glyphCount: number;
}

/**
 * Whether the layer's glyphs rest at SETTLED_TRANSFORM for good, so their
 * motion can stop following the clock and the beat. A non-leaving layer under
 * reduced motion rests from the start. One on the `still` hold rests once its
 * entrance is over (entranceDone with the grid as it is then): one timer per
 * layer, re-armed if the clock has not got there yet. A new entrance (anchor,
 * kind or glyph count) starts it following the clock again. Leaving layers and
 * every other hold keep following the clock, as the beat moves them.
 */
function useSettled({
  time,
  periodMs,
  entrance,
  hold,
  exiting,
  reducedMotion,
  anchorMs,
  glyphCount,
}: SettleInput): boolean {
  const watch = !exiting && !reducedMotion && hold === 'still';
  const entranceKey = `${entrance}|${anchorMs}|${glyphCount}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const settled = (!exiting && reducedMotion) || (watch && settledKey === entranceKey);
  useEffect(() => {
    if (!watch || settled) return undefined;
    let id: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const remaining = entranceDurationMs(entrance, glyphCount, periodMs.value) - (time.value - anchorMs);
      if (remaining <= 0) {
        setSettledKey(entranceKey);
        return;
      }
      id = setTimeout(check, (Number.isFinite(remaining) ? remaining : 0) + SETTLE_SLACK_MS);
    };
    check();
    return () => {
      if (id !== undefined) clearTimeout(id);
    };
  }, [watch, settled, entrance, glyphCount, anchorMs, entranceKey, time, periodMs]);
  return settled;
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
  const settled = useSettled({
    time: motion.time,
    periodMs: motion.beat.periodMs,
    entrance: motion.entrance,
    hold: motion.hold,
    exiting: motion.exiting ?? false,
    reducedMotion: motion.reducedMotion,
    anchorMs: motion.lineLandsAtMs ?? motion.lineStartedAtMs,
    glyphCount: glyphs.length,
  });
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
            settled={settled}
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
  /** The glyph rests at SETTLED_TRANSFORM for good (useSettled): its motion stops following the clock. */
  settled: boolean;
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
  settled,
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
  const { bar, confidence, lastOnsetAtMs, nextBeatAtMs, periodMs, low, silence } = beat;
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

  // A derived value re-runs whenever any shared value its worklet captures
  // changes, whichever branch it takes. So each one below captures the clock
  // and the beat only while it reads them: a settled glyph's motion captures
  // none (and is not recomputed every frame), and neither do the colour of a
  // glyph that does not migrate or the stroke of a glyph that has none.
  const motionInputs = settled
    ? null
    : { time, lastOnsetAtMs, nextBeatAtMs, periodMs, low, bar, confidence, silence };
  const motion = useDerivedValue<GlyphTransform>(
    () => {
      if (motionInputs === null) return SETTLED_TRANSFORM;
      const now = motionInputs.time.value;
      return glyphTransform({
        entrance,
        hold,
        elapsedMs: now - anchorMs,
        glyphIndex: order,
        glyphCount,
        emphasized,
        timeMs: now,
        lastOnsetAtMs: motionInputs.lastOnsetAtMs.value,
        nextBeatAtMs: motionInputs.nextBeatAtMs.value,
        periodMs: motionInputs.periodMs.value,
        low: motionInputs.low.value,
        feel,
        bar: motionInputs.bar.value,
        confidence: motionInputs.confidence.value,
        reducedMotion,
        seed,
        phaseOffset,
        anticipationMs,
        exiting,
        silent: motionInputs.silence.value >= 0.5,
      });
    },
    [
      settled,
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
  const migrates =
    !glyphAccent &&
    accent &&
    emphasized &&
    emphasisOrder >= 0 &&
    lineEndsAtMs !== null &&
    lineEndsAtMs > lineStartedAtMs;
  const migrationClock = migrates ? time : null;
  const color = useDerivedValue<string>(() => {
    const inkNow = inkValue === null ? ink : inkValue.value;
    const accentNow = accentValue === null ? accentColor : accentValue.value;
    if (glyphAccent) return accentNow;
    if (!accent || !emphasized || emphasisOrder < 0) return inkNow;
    if (migrationClock === null || lineEndsAtMs === null || lineEndsAtMs <= lineStartedAtMs) return accentNow;
    const local = emphasisMigration(
      migrationClock.value,
      lineStartedAtMs,
      lineEndsAtMs,
      emphasisOrder,
      emphasisCount,
    );
    return interpolateColor(local, [0, 1], [inkNow, accentNow]);
  }, [
    migrates,
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
  const strokeInputs = heavy ? { time, lastOnsetAtMs, low, confidence } : null;
  const strokeWidth = useDerivedValue<number>(() => {
    if (strokeInputs === null) return 0;
    const damp = strokeInputs.confidence.value < 0.5 ? 0.25 : 1;
    return (
      glyph.sizePx *
      0.02 *
      derivePulse(strokeInputs.time.value, strokeInputs.lastOnsetAtMs.value) *
      strokeInputs.low.value *
      damp
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
