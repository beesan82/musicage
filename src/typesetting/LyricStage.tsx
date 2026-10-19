import { Canvas, Group, Text } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BeatState } from '../beat/types';
import { DEFAULT_IDLE_GLYPHS, DEFAULT_PALETTE } from '../direction/types';
import type { LineDirection, SongDirection } from '../direction/types';
import type { LyricLine } from '../recognition/types';
import type { ScheduledLine } from '../sync/lineScheduler';
import { TextureBackground } from '../textures/TextureBackground';
import { createStageFont, FONT_SOURCES, useStageTypefaces } from './fonts';
import type { FontKey, FontWeight } from './fonts';
import { GlyphLayer } from './GlyphLayer';
import { composeIdle } from './idleComposition';
import type { IdleTrack } from './idleComposition';
import { layoutLine, SIZE_RATIO } from './layout';
import type { GlyphMeasure, LineLayout, PlacedGlyph, Viewport } from './layout';
import { Ornament } from './Ornaments';
import { useBeatSharedValues } from './useBeatSharedValues';

export type StageSource =
  | {
      kind: 'synced';
      lines: readonly LyricLine[];
      direction: SongDirection;
      scheduled: ScheduledLine;
      track: IdleTrack;
    }
  | { kind: 'idle'; direction: SongDirection | null; track: IdleTrack };

export interface LyricStageProps {
  source: StageSource;
  beat: BeatState;
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

interface LineScene {
  index: number;
  direction: LineDirection;
  layout: LineLayout;
  prev: PlacedGlyph[] | null;
  next: PlacedGlyph[] | null;
}

/**
 * Full-screen lyric stage: the texture background, then the line's ornament and
 * glyphs (or the idle composition) on a second Canvas stacked above it.
 *
 * Layout runs on the JS thread only when the source, viewport or typefaces
 * change (idle also when the bar changes); all motion is derived on the UI
 * thread from the `time` shared value and the beat shared values.
 */
export function LyricStage({ source, beat, nowMonotonicMs, reducedMotion = false }: LyricStageProps) {
  const fonts = useStageFonts();
  const beatValues = useBeatSharedValues(beat);
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

  const showIdle = fonts !== null && lineScene === null;
  const idleGlyphs = songDirection?.idleGlyphs ?? DEFAULT_IDLE_GLYPHS;
  const trackTitle = source.track?.title ?? null;
  const trackArtist = source.track?.artist ?? null;
  const idle = useMemo(() => {
    if (!showIdle || fonts === null) return null;
    const track =
      trackTitle !== null && trackArtist !== null ? { title: trackTitle, artist: trackArtist } : null;
    return composeIdle(beat.bar, idleGlyphs, viewport, track, measureWith(fonts, 'gothic', 'regular'));
  }, [beat.bar, fonts, idleGlyphs, showIdle, trackArtist, trackTitle, viewport]);

  const palette = songDirection?.palette ?? DEFAULT_PALETTE;
  const texture = songDirection?.texture ?? 'grain';
  const lineStartedAtMs = scheduled?.startedAtMs ?? 0;
  const shared = { time, beat: beatValues, reducedMotion, palette } as const;
  // Stable font getters keep the memoised GlyphLayers from re-rendering on every beat update.
  const gothic = useCallback((sizePx: number) => fonts!('gothic', 'regular', sizePx), [fonts]);
  const lineFace = lineScene?.direction.font ?? 'gothic';
  const lineWeight = lineScene?.direction.weight ?? 'regular';
  const lineFont = useCallback(
    (sizePx: number) => fonts!(lineFace, lineWeight, sizePx),
    [fonts, lineFace, lineWeight],
  );

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
          width={width}
          height={height}
          reducedMotion={reducedMotion}
        />
      </View>
      {fonts !== null ? (
        <Canvas style={styles.layer}>
          {lineScene !== null ? (
            <>
              <Ornament
                ornament={lineScene.direction.ornament}
                orientation={lineScene.direction.orientation}
                bounds={lineScene.layout.bounds}
                viewport={viewport}
                ink={palette.ink}
                bar={beat.bar}
                numeralFont={gothic(viewport.width * SIZE_RATIO.xs)}
              />
              <GlyphLayer
                {...shared}
                glyphs={lineScene.layout.glyphs}
                fontFor={lineFont}
                lineStartedAtMs={lineStartedAtMs}
                entrance={lineScene.direction.entrance}
                hold={lineScene.direction.hold}
                accent={lineScene.direction.accent}
                seed={lineScene.index + 1}
              />
              {(['prev', 'next'] as const).map((side) => {
                const glyphs = lineScene[side];
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
                      seed={lineScene.index + 1}
                      testIDPrefix={`context-${side}-glyph`}
                    />
                  </Group>
                );
              })}
            </>
          ) : null}
          {idle !== null ? (
            <>
              <GlyphLayer
                {...shared}
                glyphs={idle.glyphs}
                fontFor={gothic}
                lineStartedAtMs={0}
                entrance="cut"
                hold="pulse"
                accent={false}
                seed={beat.bar}
              />
              {idle.caption !== null ? (
                <Text
                  x={idle.caption.x}
                  y={idle.caption.y}
                  text={idle.caption.text}
                  font={gothic(idle.caption.sizePx)}
                  color={palette.ink}
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
