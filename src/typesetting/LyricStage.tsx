import { Canvas, Group, Text } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BeatState } from '../beat/types';
import { DEFAULT_IDLE_GLYPHS, DEFAULT_PALETTE } from '../direction/types';
import type { LineDirection, SongDirection } from '../direction/types';
import type { LyricLine } from '../recognition/types';
import type { ScheduledLine } from '../sync/lineScheduler';
import { TextureBackground } from '../textures/TextureBackground';
import { createStageFont, FONT_SOURCES, useStageTypefaces } from './fonts';
import type { FontKey, FontWeight } from './fonts';
import { GlowLayer } from './GlowLayer';
import { GlyphLayer } from './GlyphLayer';
import { captionText, composeIdle, IDLE_EPOCH_BARS } from './idleComposition';
import type { IdleComposition, IdleTrack } from './idleComposition';
import { layoutLine, SIZE_RATIO } from './layout';
import type { GlyphMeasure, LineLayout, PlacedGlyph, Viewport } from './layout';
import { dropHeadMs, entranceDurationMs, exitDurationMs, TEMPO_FEEL_FACTOR } from './motion';
import { Ornament } from './Ornaments';
import { surgeAccent, surgeInk } from './surgeColors';
import type { BeatSharedValues } from './useBeatSharedValues';

export type StageSource =
  | {
      kind: 'synced';
      lines: readonly LyricLine[];
      direction: SongDirection;
      scheduled: ScheduledLine;
      track: IdleTrack;
      /**
       * When the recognition drop fired (the source became synced for a new
       * song), on the `performance.now()` clock; null when it did not (a
       * re-anchor of the same trackId). The stage plays the drop once per
       * fire time: the idle glyphs scatter on the next beat head, the
       * background dips, and the first line drops in (design spec §7).
       */
      dropAtMs?: number | null;
    }
  | { kind: 'idle'; direction: SongDirection | null; track: IdleTrack };

export interface LyricStageProps {
  source: StageSource;
  beat: BeatState;
  /** Shared values written by the ear on every frame; worklets read these. */
  beatValues: BeatSharedValues;
  /** `performance.now()` at render; the clock `scheduled.startedAtMs` is on. */
  nowMonotonicMs: number;
  reducedMotion?: boolean;
}

type StageFonts = (key: FontKey, weight: FontWeight, sizePx: number) => SkFont;

/**
 * Stage clock on a frame: the last JS anchor plus the frame time since the first frame
 * that saw it. Never moves backwards, and never runs past the real clock however long
 * frames were paused, because it is measured from an anchor rather than summed from deltas.
 */
export function anchoredTime(
  anchorNowMs: number,
  anchorFrameMs: number,
  frameMs: number,
  previousTimeMs: number,
): number {
  'worklet';
  return Math.max(previousTimeMs, anchorNowMs + (frameMs - anchorFrameMs));
}

const MARGIN = 24;
const CONTEXT_OPACITY = 0.35;
const CAPTION_OPACITY = 0.6;
const FONT_KEYS = Object.keys(FONT_SOURCES) as FontKey[];
const CONTEXT_DIRECTION: LineDirection = {
  font: 'gothic',
  weight: 'regular',
  size: 'xs',
  orientation: 'horizontal',
  entrance: 'fade',
  hold: 'still',
  emphasis: [],
  accent: false,
  ornament: 'none',
};
// Used only if a direction has fewer entries than the song has lines.
const FALLBACK_DIRECTION: LineDirection = { ...CONTEXT_DIRECTION, size: 'm', orientation: 'vertical' };

/** Fonts per (face, weight, size), rebuilt only when a typeface itself changes. */
function useStageFonts(): StageFonts | null {
  const typefaces = useStageTypefaces();
  const faces = FONT_KEYS.flatMap((key) => [typefaces?.[key]?.regular, typefaces?.[key]?.bold]);
  // Keyed on the typefaces themselves: useStageTypefaces returns a fresh wrapper every render.
  return useMemo(() => {
    if (typefaces === null) return null;
    const cache = new Map<string, SkFont>();
    return (key, weight, sizePx) => {
      const variant = weight === 'bold' ? 'bold' : 'regular';
      const id = `${key}:${variant}:${sizePx}`;
      let font = cache.get(id);
      if (font === undefined) {
        const face = (typefaces[key] ?? typefaces.gothic)?.[variant];
        if (face === undefined) throw new Error(`Typeface ${key} is not loaded`);
        font = createStageFont(face, sizePx);
        cache.set(id, font);
      }
      return font;
    };
  }, faces);
}

function measureWith(fonts: StageFonts, key: FontKey, weight: FontWeight): GlyphMeasure {
  return (char, sizePx) => {
    const font = fonts(key, weight, sizePx);
    const { ascent, descent } = font.getMetrics();
    return { advance: font.measureText(char).width, ascent, descent };
  };
}

/** Lays a neighbour line out in gothic xs and moves its block to a corner. */
function contextGlyphs(
  line: LyricLine | undefined,
  corner: 'top-left' | 'bottom-right',
  viewport: Viewport,
  fonts: StageFonts,
): PlacedGlyph[] | null {
  const text = line?.text.trim() ?? '';
  if (text === '') return null;
  const { glyphs, bounds } = layoutLine(
    text,
    CONTEXT_DIRECTION,
    viewport,
    measureWith(fonts, 'gothic', 'regular'),
  );
  const dx = corner === 'top-left' ? MARGIN - bounds.x : viewport.width - MARGIN - (bounds.x + bounds.width);
  const dy =
    corner === 'top-left'
      ? viewport.insetTop + MARGIN - bounds.y
      : viewport.height - viewport.insetBottom - MARGIN - (bounds.y + bounds.height);
  return glyphs.map((g) => ({ ...g, x: g.x + dx, y: g.y + dy }));
}

/** The idle caption laid out glyph by glyph, so it can trace in after the drop. */
function captionGlyphs(caption: NonNullable<IdleComposition['caption']>, measure: GlyphMeasure): PlacedGlyph[] {
  const glyphs: PlacedGlyph[] = [];
  let x = caption.x;
  [...caption.text].forEach((char, index) => {
    const { advance } = measure(char, caption.sizePx);
    if (char.trim() !== '') {
      glyphs.push({ char, index, x, y: caption.y, rotateDeg: 0, sizePx: caption.sizePx, emphasized: false });
    }
    x += advance;
  });
  return glyphs;
}

interface LineScene {
  index: number;
  direction: LineDirection;
  layout: LineLayout;
  prev: PlacedGlyph[] | null;
  next: PlacedGlyph[] | null;
}

/** Marks a drop whose line has been and gone: no later line takes the drop entrance. */
const DROP_LINE_DONE = -2;
/** Slack after an exit's computed end before its layer is removed. */
const EXIT_SLACK_MS = 80;

/**
 * One recognition drop (design spec §7), keyed by its fire time. The stage
 * computes it once per fire: the beat head it lands on, the idle glyphs on
 * stage at the fire (they scatter on the head), when a fresh idle may rise
 * after that scatter, and which line (the first one shown after the fire)
 * drops in.
 */
interface Drop {
  fireAtMs: number;
  headMs: number;
  idleRiseAtMs: number;
  idleGlyphs: PlacedGlyph[] | null;
  lineIndex: number | null;
}

/** The parts of a drop that are on stage for a bounded time (state, so they are removed by timers). */
interface DropPlay {
  fireAtMs: number;
  /** The idle glyphs scattering on the head; null once they are gone. */
  idleExit: PlacedGlyph[] | null;
  /** The caption traces in from the head while this is true, then stands still as plain text. */
  captionTracing: boolean;
}

/**
 * Full-screen lyric stage: the texture background, then the line's ornament and
 * glyphs (or the idle composition) on a second Canvas stacked above it.
 *
 * Layout runs on the JS thread only when the source, viewport or typefaces
 * change (idle also when the bar changes); all motion is derived on the UI
 * thread from the `time` shared value and the beat shared values.
 */
export function LyricStage({
  source,
  beat,
  beatValues,
  nowMonotonicMs,
  reducedMotion = false,
}: LyricStageProps) {
  const fonts = useStageFonts();
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const width = size?.width ?? frame.width;
  const height = size?.height ?? frame.height;
  const viewport = useMemo<Viewport>(
    () => ({ width, height, insetTop: insets.top, insetBottom: insets.bottom }),
    [height, insets.bottom, insets.top, width],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setSize((previous) =>
      previous?.width === w && previous.height === h ? previous : { width: w, height: h },
    );
  }, []);

  // One clock for every glyph, on the same clock as `scheduled.startedAtMs`, so
  // `time - scheduled.startedAtMs` is the line's elapsed time. JS anchors it to
  // `nowMonotonicMs`; the UI thread pins the anchor to the first frame after it and
  // advances from there (see anchoredTime). A negative anchor frame means "not yet pinned".
  const time = useSharedValue(nowMonotonicMs);
  const anchorNow = useSharedValue(nowMonotonicMs);
  const anchorFrame = useSharedValue(-1);
  const frameCallback = useFrameCallback((info) => {
    'worklet';
    if (anchorFrame.value < 0) anchorFrame.value = info.timestamp;
    time.value = anchoredTime(anchorNow.value, anchorFrame.value, info.timestamp, time.value);
  }, !reducedMotion);
  useEffect(() => frameCallback.setActive(!reducedMotion), [frameCallback, reducedMotion]);
  useEffect(() => {
    // Unpin before moving the anchor: a frame in between then pins to the old anchor
    // (off by at most a frame) instead of pairing the new anchor with an old pin.
    anchorFrame.value = -1;
    anchorNow.value = nowMonotonicMs;
    // Without frames nothing advances the clock; motion is static then anyway.
    if (reducedMotion) time.value = Math.max(time.value, nowMonotonicMs);
  }, [anchorFrame, anchorNow, nowMonotonicMs, reducedMotion, time]);

  const lines = source.kind === 'synced' ? source.lines : null;
  const scheduled = source.kind === 'synced' ? source.scheduled : null;
  const songDirection = source.direction;
  const lineIndex = scheduled?.index ?? -1;
  const lineIsEmpty = scheduled?.isEmpty ?? true;
  const lineStartedAtMs = scheduled?.startedAtMs ?? 0;

  const lineScene = useMemo<LineScene | null>(() => {
    if (fonts === null || lines === null || songDirection === null || lineIsEmpty) return null;
    const text = lines[lineIndex]?.text.trim() ?? '';
    if (text === '') return null;
    const direction = songDirection.lines[lineIndex] ?? FALLBACK_DIRECTION;
    const layout = layoutLine(
      text,
      direction,
      viewport,
      measureWith(fonts, direction.font, direction.weight),
    );
    const showContext = direction.size !== 'xl';
    return {
      index: lineIndex,
      direction,
      layout,
      prev: showContext ? contextGlyphs(lines[lineIndex - 1], 'top-left', viewport, fonts) : null,
      next: showContext ? contextGlyphs(lines[lineIndex + 1], 'bottom-right', viewport, fonts) : null,
    };
  }, [fonts, lineIndex, lineIsEmpty, lines, songDirection, viewport]);

  // The recognition drop (design spec §7), once per fire time. Computed in
  // render so the line shown in the very same render can take it: the head
  // it lands on (the next beat head, if the grid is trusted), the idle glyphs
  // on stage at the fire, and when a fresh idle may rise after their scatter.
  // Skipped under reduced motion, where the stage clock does not advance.
  const dropAtMs = source.kind === 'synced' ? (source.dropAtMs ?? null) : null;
  const dropRef = useRef<Drop | null>(null);
  // The idle composition shown in the previous render (null while a line is on
  // stage): the glyphs a drop firing now sends scattering.
  const idleShownRef = useRef<IdleComposition | null>(null);
  if (dropAtMs !== null && !reducedMotion && dropRef.current?.fireAtMs !== dropAtMs) {
    const periodMs = beatValues.periodMs.value;
    const headMs = dropHeadMs(
      dropAtMs,
      beatValues.nextBeatAtMs.value,
      periodMs,
      beatValues.confidence.value,
    );
    const idleGlyphs = idleShownRef.current?.glyphs ?? null;
    dropRef.current = {
      fireAtMs: dropAtMs,
      headMs,
      idleRiseAtMs: headMs + exitDurationMs('scatter', idleGlyphs?.length ?? 0, periodMs),
      idleGlyphs,
      lineIndex: null,
    };
  }
  const drop = dropRef.current;
  // The first line shown after the fire is the one that drops in; once the
  // stage has moved past it, no later line takes the drop.
  if (drop !== null && lineScene !== null) {
    if (drop.lineIndex === null) drop.lineIndex = lineScene.index;
    else if (drop.lineIndex !== lineScene.index) drop.lineIndex = DROP_LINE_DONE;
  }
  const isDropLine = drop !== null && lineScene !== null && drop.lineIndex === lineScene.index;
  const scene = useMemo<LineScene | null>(
    () =>
      lineScene !== null && isDropLine
        ? { ...lineScene, direction: { ...lineScene.direction, entrance: 'drop' } }
        : lineScene,
    [lineScene, isDropLine],
  );

  // The drop's bounded stage presence: the scattering idle glyphs and the
  // caption's trace are removed by timers once they have run.
  const [dropPlay, setDropPlay] = useState<DropPlay | null>(null);
  const captionCountRef = useRef(0);
  useEffect(() => {
    const current = dropRef.current;
    if (current === null || current.fireAtMs !== dropAtMs) return undefined;
    const { fireAtMs, headMs, idleGlyphs } = current;
    setDropPlay({ fireAtMs, idleExit: idleGlyphs, captionTracing: true });
    const wait = headMs - fireAtMs;
    const periodMs = beatValues.periodMs.value;
    const exitEnd = wait + exitDurationMs('scatter', idleGlyphs?.length ?? 0, periodMs) + EXIT_SLACK_MS;
    const captionEnd = wait + entranceDurationMs('trace', captionCountRef.current, periodMs) + EXIT_SLACK_MS;
    const update = (patch: Partial<DropPlay>) =>
      setDropPlay((play) => {
        if (play === null || play.fireAtMs !== fireAtMs) return play;
        const next = { ...play, ...patch };
        return next.idleExit === null && !next.captionTracing ? null : next;
      });
    const ids = [
      setTimeout(() => update({ idleExit: null }), exitEnd),
      setTimeout(() => update({ captionTracing: false }), captionEnd),
    ];
    return () => ids.forEach((id) => clearTimeout(id));
  }, [dropAtMs, beatValues]);

  // The leaving line: when the displayed scene changes, the previous scene is
  // kept for the length of its exit (derived from its entrance, capped at one
  // beat) so a line change is a handover in one tempo, not an instant swap.
  const [exiting, setExiting] = useState<{ scene: LineScene; startedAtMs: number } | null>(null);
  const lastSceneRef = useRef<LineScene | null>(null);
  useEffect(() => {
    const prev = lastSceneRef.current;
    lastSceneRef.current = scene;
    if (prev === null || (scene !== null && scene.index === prev.index)) return;
    const duration = exitDurationMs(
      prev.direction.entrance,
      prev.layout.glyphs.length,
      beatValues.periodMs.value,
    );
    if (duration <= 0 || reducedMotion) {
      setExiting(null);
      return;
    }
    setExiting({ scene: prev, startedAtMs: scheduled?.startedAtMs ?? nowMonotonicMs });
  }, [scene, beatValues, scheduled, nowMonotonicMs, reducedMotion]);
  useEffect(() => {
    if (exiting === null) return undefined;
    const duration = exitDurationMs(
      exiting.scene.direction.entrance,
      exiting.scene.layout.glyphs.length,
      beatValues.periodMs.value,
    );
    const id = setTimeout(
      () => setExiting((current) => (current === exiting ? null : current)),
      duration + EXIT_SLACK_MS,
    );
    return () => clearTimeout(id);
  }, [exiting, beatValues]);

  const showIdle = fonts !== null && scene === null;
  const idleGlyphs = songDirection?.idleGlyphs ?? DEFAULT_IDLE_GLYPHS;
  const trackTitle = source.track?.title ?? null;
  const trackArtist = source.track?.artist ?? null;
  captionCountRef.current =
    trackTitle !== null && trackArtist !== null
      ? [...captionText({ title: trackTitle, artist: trackArtist })].filter((c) => c.trim() !== '').length
      : 0;
  // The idle composition is fixed inside an 8-bar epoch; one glyph swaps per
  // bar. `beat.bar` reaches the stage frozen through silence, so a quiet room
  // holds the composition still.
  const epoch = Math.floor(beat.bar / IDLE_EPOCH_BARS);
  const barInEpoch = beat.bar % IDLE_EPOCH_BARS;
  const idle = useMemo(() => {
    if (!showIdle || fonts === null) return null;
    const track =
      trackTitle !== null && trackArtist !== null ? { title: trackTitle, artist: trackArtist } : null;
    return composeIdle(epoch, barInEpoch, idleGlyphs, viewport, track, measureWith(fonts, 'gothic', 'regular'));
  }, [barInEpoch, epoch, fonts, idleGlyphs, showIdle, trackArtist, trackTitle, viewport]);
  // Stage-clock times at which the current bar / epoch first appeared, so the
  // idle layers can time their `rise` entrances: the whole composition rises
  // at an epoch change, and the one swapped glyph rises at its bar change.
  // (The stage clock tracks performance.now(); see the anchor logic above.)
  const barRef = useRef(beat.bar);
  const barStartedAtRef = useRef(nowMonotonicMs);
  if (barRef.current !== beat.bar) {
    barRef.current = beat.bar;
    barStartedAtRef.current = performance.now();
  }
  const epochRef = useRef(epoch);
  const epochStartedAtRef = useRef(nowMonotonicMs);
  if (epochRef.current !== epoch) {
    epochRef.current = epoch;
    epochStartedAtRef.current = performance.now();
  }
  const idleSwapped = idle?.glyphs.find((g) => g.index >= 1000) ?? null;
  const idleBase = idle?.glyphs.filter((g) => g !== idleSwapped) ?? null;
  idleShownRef.current = idle;
  // After a drop the idle layers are remounted (key) so their rise replays,
  // timed to begin once the previous idle glyphs have scattered.
  const idleKey = drop?.fireAtMs ?? 0;
  const idleRiseAtMs = drop?.idleRiseAtMs ?? 0;
  const idleExit = dropPlay?.idleExit ?? null;
  // While the caption traces in it is drawn glyph by glyph from the head.
  const captionTraceFromMs = dropPlay?.captionTracing === true && drop !== null ? drop.headMs : null;
  const caption = idle?.caption ?? null;
  const captionTrace = useMemo(
    () =>
      caption !== null && captionTraceFromMs !== null && fonts !== null
        ? captionGlyphs(caption, measureWith(fonts, 'gothic', 'regular'))
        : null,
    [caption, captionTraceFromMs, fonts],
  );

  const palette = songDirection?.palette ?? DEFAULT_PALETTE;
  const texture = songDirection?.texture ?? 'grain';
  const feel = TEMPO_FEEL_FACTOR[songDirection?.tempoFeel ?? 'sway'];
  // The palette's continuous change (design spec §4, §6): the ink and accent
  // as they stand at the current surge strength, derived once per frame on
  // the UI thread and shared by every glyph layer and the glow.
  const inkNow = useDerivedValue(() => surgeInk(palette, beatValues.surge.value), [palette, beatValues]);
  const accentNow = useDerivedValue(
    () => surgeAccent(palette, beatValues.surge.value),
    [palette, beatValues],
  );
  const shared = {
    time,
    beat: beatValues,
    reducedMotion,
    palette,
    feel,
    inkValue: inkNow,
    accentValue: accentNow,
  } as const;
  // Stable font getters keep the memoised GlyphLayers from re-rendering on every beat update.
  const gothic = useCallback((sizePx: number) => fonts!('gothic', 'regular', sizePx), [fonts]);
  const lineFace = scene?.direction.font ?? 'gothic';
  const lineWeight = scene?.direction.weight ?? 'regular';
  const lineFont = useCallback(
    (sizePx: number) => fonts!(lineFace, lineWeight, sizePx),
    [fonts, lineFace, lineWeight],
  );
  const lineHeavy = lineWeight === 'bold' || lineFace === 'gothic-heavy';
  // The drop line lands on the drop's head when that is still ahead of the
  // line's start; otherwise (and for every other line) the scheduler's landing.
  const lineLandsAtMs =
    drop !== null && isDropLine && drop.headMs > lineStartedAtMs
      ? drop.headMs
      : (scheduled?.landsAtMs ?? null);
  // The line's end on the stage clock: lines play in real time, so the next
  // line's song-time distance from this one is also its stage-time distance.
  const currentLine = lines !== null && lineIndex >= 0 ? lines[lineIndex] : undefined;
  const nextLine = lines !== null && lineIndex >= 0 ? lines[lineIndex + 1] : undefined;
  const lineEndsAtMs =
    currentLine !== undefined && nextLine !== undefined
      ? lineStartedAtMs + (nextLine.startMs - currentLine.startMs)
      : null;
  const exitFace = exiting?.scene.direction.font ?? 'gothic';
  const exitWeight = exiting?.scene.direction.weight ?? 'regular';
  const exitFont = useCallback(
    (sizePx: number) => fonts!(exitFace, exitWeight, sizePx),
    [fonts, exitFace, exitWeight],
  );
  const exitHeavy = exitWeight === 'bold' || exitFace === 'gothic-heavy';

  return (
    <View
      onLayout={onLayout}
      style={[styles.root, { backgroundColor: palette.background }]}
      testID="lyric-stage"
    >
      <View style={styles.layer}>
        <TextureBackground
          texture={texture}
          palette={palette}
          pulse={beatValues.pulse}
          energy={beatValues.energy}
          low={beatValues.low}
          mid={beatValues.mid}
          high={beatValues.high}
          confidence={beatValues.confidence}
          surge={beatValues.surge}
          time={time}
          dropAtMs={drop?.fireAtMs ?? null}
          width={width}
          height={height}
          reducedMotion={reducedMotion}
        />
      </View>
      {fonts !== null ? (
        <Canvas style={styles.layer}>
          {idleExit !== null && drop !== null ? (
            // The idle glyphs at the fire: held in place until the head, then
            // scattered (the exit derived from `scatter`).
            <GlyphLayer
              {...shared}
              glyphs={idleExit}
              fontFor={gothic}
              lineStartedAtMs={drop.headMs}
              entrance="scatter"
              hold="still"
              accent={false}
              exiting
              seed={epoch + 1}
              testIDPrefix="exit-idle-glyph"
            />
          ) : null}
          {exiting !== null ? (
            <GlyphLayer
              {...shared}
              glyphs={exiting.scene.layout.glyphs}
              fontFor={exitFont}
              lineStartedAtMs={exiting.startedAtMs}
              entrance={exiting.scene.direction.entrance}
              hold={exiting.scene.direction.hold}
              accent={exiting.scene.direction.accent}
              heavy={exitHeavy}
              exiting
              seed={exiting.scene.index + 1}
              testIDPrefix="exit-glyph"
            />
          ) : null}
          {scene !== null ? (
            <>
              <Ornament
                ornament={scene.direction.ornament}
                orientation={scene.direction.orientation}
                bounds={scene.layout.bounds}
                viewport={viewport}
                ink={palette.ink}
                bar={beat.bar}
                numeralFont={gothic(viewport.width * SIZE_RATIO.xs)}
              />
              {!reducedMotion ? (
                // The beat-head glow of the surge (spec §5): blurred twins of
                // the emphasized glyphs only, under the line, dark outside a
                // surge. Never under reduced motion (the clock stands still).
                <GlowLayer
                  glyphs={scene.layout.glyphs}
                  fontFor={lineFont}
                  time={time}
                  lineStartedAtMs={lineStartedAtMs}
                  lineLandsAtMs={lineLandsAtMs}
                  entrance={scene.direction.entrance}
                  hold={scene.direction.hold}
                  color={accentNow}
                  beat={beatValues}
                  seed={scene.index + 1}
                  feel={feel}
                />
              ) : null}
              <GlyphLayer
                {...shared}
                glyphs={scene.layout.glyphs}
                fontFor={lineFont}
                lineStartedAtMs={lineStartedAtMs}
                lineLandsAtMs={lineLandsAtMs}
                lineEndsAtMs={lineEndsAtMs}
                entrance={scene.direction.entrance}
                hold={scene.direction.hold}
                accent={scene.direction.accent}
                heavy={lineHeavy}
                seed={scene.index + 1}
              />
              {(['prev', 'next'] as const).map((side) => {
                const glyphs = scene[side];
                if (glyphs === null) return null;
                const testProps = { testID: `context-${side}` } as object;
                return (
                  <Group key={side} opacity={CONTEXT_OPACITY} {...testProps}>
                    <GlyphLayer
                      {...shared}
                      glyphs={glyphs}
                      fontFor={gothic}
                      lineStartedAtMs={lineStartedAtMs}
                      entrance={CONTEXT_DIRECTION.entrance}
                      hold={CONTEXT_DIRECTION.hold}
                      accent={false}
                      seed={scene.index + 1}
                      testIDPrefix={`context-${side}-glyph`}
                    />
                  </Group>
                );
              })}
            </>
          ) : null}
          {idle !== null && idleBase !== null ? (
            <>
              <GlyphLayer
                key={`idle-base-${idleKey}`}
                {...shared}
                glyphs={idleBase}
                fontFor={gothic}
                lineStartedAtMs={Math.max(epochStartedAtRef.current, idleRiseAtMs)}
                entrance="rise"
                hold="breathe"
                accent={false}
                seed={epoch}
              />
              {idleSwapped !== null ? (
                <GlyphLayer
                  key={`idle-swap-${idleKey}`}
                  {...shared}
                  glyphs={[idleSwapped]}
                  fontFor={gothic}
                  lineStartedAtMs={Math.max(barStartedAtRef.current, idleRiseAtMs)}
                  entrance="rise"
                  hold="breathe"
                  accent={false}
                  seed={epoch}
                />
              ) : null}
              {idle.caption !== null && captionTrace !== null && captionTraceFromMs !== null ? (
                // The caption leads the first line after a drop: traced in
                // from the head, glyph by glyph, then it stands as plain text.
                <Group opacity={CAPTION_OPACITY}>
                  <GlyphLayer
                    {...shared}
                    glyphs={captionTrace}
                    fontFor={gothic}
                    lineStartedAtMs={captionTraceFromMs}
                    entrance="trace"
                    hold="still"
                    accent={false}
                    seed={0}
                    testIDPrefix="idle-caption-glyph"
                  />
                </Group>
              ) : idle.caption !== null ? (
                <Text
                  x={idle.caption.x}
                  y={idle.caption.y}
                  text={idle.caption.text}
                  font={gothic(idle.caption.sizePx)}
                  color={inkNow}
                  opacity={CAPTION_OPACITY}
                  {...({ testID: 'idle-caption' } as object)}
                />
              ) : null}
            </>
          ) : null}
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
});
