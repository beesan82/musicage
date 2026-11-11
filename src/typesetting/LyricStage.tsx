import { Canvas, Group, Paint, Rect, Shadow, Text } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BeatState } from '../beat/types';
import { lightHexFor, rgbaOf } from '../direction/palettes';
import { surgeHighHex } from '../direction/surge';
import { DEFAULT_PALETTE } from '../direction/types';
import type { LineDirection, SongDirection } from '../direction/types';
import { RECOGNITION_COPY, unsyncedNote } from '../recognition/recognitionCopy';
import type { LyricLine, UnsyncedKind } from '../recognition/types';
import type { ScheduledLine } from '../sync/lineScheduler';
import { IDLE_FOCUS } from '../textures/surfaceModel';
import type { Uv } from '../textures/surfaceModel';
import { TextureBackground } from '../textures/TextureBackground';
import { BandMeter } from './BandMeter';
import { createStageFont, FONT_SOURCES, useStageTypefaces } from './fonts';
import type { FontKey, FontWeight } from './fonts';
import { GlowLayer } from './GlowLayer';
import { GlyphLayer } from './GlyphLayer';
import type { GlyphBody } from './GlyphLayer';
import { captionText, CLOCK_TEXT_FACE, CLOCK_TIME_FACE, composeClock, idleFaces } from './idleComposition';
import type { IdleComposition, IdleTrack } from './idleComposition';
import { layoutLine, printArea, SIZE_RATIO } from './layout';
import type { GlyphMeasure, LineLayout, PlacedGlyph, PrintArea, Viewport } from './layout';
import { dropHeadMs, ENTRANCE_DURATION_MS, entranceDurationMs, exitDurationMs, TEMPO_FEEL_FACTOR } from './motion';
import { composeNameplate } from './nameplate';
import type { Nameplate } from './nameplate';
import { lineArea, Ornament } from './Ornaments';
import { PlainBody } from './PlainBody';
import type { PlainBodyProps } from './PlainBody';
import {
  composePlainSheet,
  PLAIN_BODY_DELAY_MS,
  PLAIN_EXIT_MS,
  plainBodyOpacity,
} from './plainSheet';
import type { PlainRun, PlainSheet } from './plainSheet';
import { accentBody, contextInk, inkBody, surgeAccent, surgeInk } from './surgeColors';
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
  | {
      /**
       * A recognized song the stage cannot follow (no synced lyrics: plain
       * text only, an instrumental record, or none). The stage prints its
       * nameplate (nameplate.ts): the title large as the line on stage with
       * the `pulse` hold, the artist small, the band meter answering the
       * music, and a short honest note on the caption row.
       */
      kind: 'unsynced';
      track: NonNullable<IdleTrack>;
      direction: SongDirection;
      reason: UnsyncedKind;
      /** As for `synced`: the recognition drop fires for a new song with or without lyrics. */
      dropAtMs?: number | null;
    }
  | {
      /**
       * A recognized song whose lyrics are plain text without times (design
       * spec §7, 2026-11-10, 2026-11-11). The stage prints them as a lyric
       * sheet (plainSheet.ts) that never follows the song: a small heading,
       * the whole body at once on one sheet, the band meter, an honest note. Only text with something printable comes as this kind.
       */
      kind: 'plain';
      track: NonNullable<IdleTrack>;
      direction: SongDirection;
      text: string;
      /** As for `synced`; on the sheet only its heading's title takes the drop. */
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

/** Context lines sit in the lamp's half-shadow (visual overhaul spec §3c.3). */
const CONTEXT_OPACITY = 0.5;
/** Distance between the line on stage and a context line. */
const CONTEXT_GAP = 28;
/** The context line's accent rule: 10×2px, this far from its text. */
const CONTEXT_RULE_WIDTH = 10;
const CONTEXT_RULE_HEIGHT = 2;
const CONTEXT_RULE_GAP = 6;
/**
 * Beside a vertical line, a context line wraps to the room on its side, which
 * must hold at least this many xs glyphs a row; with less (two xl columns
 * reach the margins) it goes above (prev) or below (next) the column block,
 * clamped into the print area even if that overlaps the block.
 */
const CONTEXT_MIN_GLYPHS = 2;
const CONTEXT_ROW_GAP = 1.3;
/**
 * The line on stage's grounding shadow (spec §3c.2): one blurred shadow for the
 * whole line, in the background's colour, so it shows only where the lamp has
 * lit the surface.
 */
const LINE_SHADOW_DY = 2;
const LINE_SHADOW_BLUR = 3;
const LINE_SHADOW_ALPHA = 0.6;
const CAPTION_OPACITY = 0.6;
/** The idle caption's accent rule (spec §3e): 12×2px, this far above its text. */
const CAPTION_RULE_WIDTH = 12;
const CAPTION_RULE_HEIGHT = 2;
const CAPTION_RULE_GAP = 6;
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

interface ContextRow {
  glyphs: { char: string; index: number; offset: number }[];
  /** Advance so far, spaces included. */
  cursor: number;
  /** Up to the end of the row's last glyph. */
  width: number;
}

interface ContextLine {
  glyphs: PlacedGlyph[];
  /** The accent rule: after the last glyph (prev) or before the first (next). */
  rule: { x: number; y: number; width: number; height: number };
}

/**
 * Lays a neighbour line out in gothic xs, horizontal, next to the line on
 * stage (visual overhaul spec §3c.3), as a block of its text plus its rule:
 * - Horizontal line: prev ends at the line's right edge, CONTEXT_GAP above
 *   it (right-aligned); next starts at the line's left edge, CONTEXT_GAP
 *   below it (left-aligned).
 * - Vertical line: prev to the right of the column block, level with its top;
 *   next to the left of it, level with its foot. Each wraps to the room on its
 *   side; with room for fewer than CONTEXT_MIN_GLYPHS it is placed as for a
 *   horizontal line instead.
 * The block is then clamped into `area` (the line's area: the print area,
 * never under the wordmark, the controls or the caption row, nor in the side
 * margins, less the room of the line's ornament); at the bottom the clamp
 * wins over the top, so the block never slides under the controls.
 */
function contextLine(
  line: LyricLine | undefined,
  side: 'prev' | 'next',
  main: LineLayout,
  vertical: boolean,
  viewport: Viewport,
  area: PrintArea,
  fonts: StageFonts,
): ContextLine | null {
  const text = line?.text.trim() ?? '';
  if (text === '') return null;
  const chars = [...text];
  const sizePx = viewport.width * SIZE_RATIO.xs;
  const measure = measureWith(fonts, 'gothic', 'regular');
  const { ascent, descent } = measure(chars[0]!, sizePx);
  const b = main.bounds;
  const ruleSpan = CONTEXT_RULE_WIDTH + CONTEXT_RULE_GAP;

  // Where the block goes: one horizontal edge and one vertical edge it hangs from.
  const besideRoom = side === 'prev' ? area.right - (b.x + b.width + CONTEXT_GAP) : b.x - CONTEXT_GAP - area.left;
  const beside = vertical && besideRoom >= CONTEXT_MIN_GLYPHS * sizePx + ruleSpan;
  const maxWidth = (beside ? besideRoom : area.right - area.left) - ruleSpan;

  // Greedy rows within maxWidth; spaces keep their advance but never start a row.
  // A row's cursor runs over its spaces; its width ends at its last glyph, so
  // a space before a wrap does not push a right-aligned row off its edge.
  const rows: ContextRow[] = [{ glyphs: [], cursor: 0, width: 0 }];
  chars.forEach((char, index) => {
    const { advance } = measure(char, sizePx);
    let row = rows[rows.length - 1]!;
    if (row.cursor > 0 && row.cursor + advance > maxWidth) {
      row = { glyphs: [], cursor: 0, width: 0 };
      rows.push(row);
    }
    if (char.trim() === '') {
      if (row.cursor > 0) row.cursor += advance;
      return;
    }
    row.glyphs.push({ char, index, offset: row.cursor });
    row.cursor += advance;
    row.width = row.cursor;
  });
  const pitch = sizePx * CONTEXT_ROW_GAP;
  const blockWidth = Math.max(...rows.map((row) => row.width)) + ruleSpan;
  const blockHeight = -ascent + descent + (rows.length - 1) * pitch;

  let left: number;
  let top: number;
  if (beside) {
    left = side === 'prev' ? b.x + b.width + CONTEXT_GAP : b.x - CONTEXT_GAP - blockWidth;
    top = side === 'prev' ? b.y : b.y + b.height - blockHeight;
  } else {
    left = side === 'prev' ? b.x + b.width - blockWidth : b.x;
    top = side === 'prev' ? b.y - CONTEXT_GAP - blockHeight : b.y + b.height + CONTEXT_GAP;
  }
  left = Math.max(area.left, Math.min(left, area.right - blockWidth));
  top = Math.min(Math.max(top, area.top), area.bottom - blockHeight);

  // prev: rows right-aligned, the rule after the last row's end. next: rows
  // left-aligned after the rule's room, the rule before the first row.
  const glyphs: PlacedGlyph[] = [];
  rows.forEach((row, line) => {
    const rowLeft = side === 'prev' ? left + blockWidth - ruleSpan - row.width : left + ruleSpan;
    const baseline = top - ascent + line * pitch;
    for (const { char, index, offset } of row.glyphs) {
      glyphs.push({ char, index, x: rowLeft + offset, y: baseline, rotateDeg: 0, sizePx, emphasized: false });
    }
  });
  const ruleLine = side === 'prev' ? rows.length - 1 : 0;
  const ruleBaseline = top - ascent + ruleLine * pitch;
  return {
    glyphs,
    rule: {
      x: side === 'prev' ? left + blockWidth - CONTEXT_RULE_WIDTH : left,
      y: ruleBaseline + (ascent + descent) / 2 - CONTEXT_RULE_HEIGHT / 2,
      width: CONTEXT_RULE_WIDTH,
      height: CONTEXT_RULE_HEIGHT,
    },
  };
}

/** The idle clock's glyphs split by face role, one GlyphLayer each: the time, then the seconds and the date. */
function splitByFace(glyphs: readonly PlacedGlyph[]): { primary: PlacedGlyph[]; secondary: PlacedGlyph[] } {
  return {
    primary: glyphs.filter((g) => g.face === 'primary'),
    secondary: glyphs.filter((g) => g.face !== 'primary'),
  };
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
  /** Identifies the line on stage across renders: `line:<index>` for a lyric line, `title:<song>` for a nameplate. */
  key: string;
  /** The lyric line's index, or TITLE_INDEX for a nameplate's title (seeds and keys only). */
  index: number;
  direction: LineDirection;
  layout: LineLayout;
  prev: ContextLine | null;
  next: ContextLine | null;
}

/** The scene index of a nameplate's title (never a lyric line's index). */
const TITLE_INDEX = -3;
/** Marks a drop whose line has been and gone: no later line takes the drop entrance. */
const DROP_LINE_DONE = 'drop:done';
/** Slack after an exit's computed end before its layer is removed. */
const EXIT_SLACK_MS = 80;
/** The idle clock ticks this long after each second boundary, so a timer firing early still lands in the new second. */
const CLOCK_TICK_SLACK_MS = 15;

/** The lyric sheet's body on stage, as it was last drawn (what a leaving body fades from). */
interface ShownBody {
  key: string;
  runs: readonly PlainRun[];
  startMs: number;
  font: FontKey;
  sizePx: number;
}

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
  /** The scene key of the line that drops in; null until one is shown, DROP_LINE_DONE after it. */
  lineKey: string | null;
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
 * change (the idle clock also once a second); all motion is derived on the UI
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
  const unsynced = source.kind === 'unsynced' ? source : null;
  const plain = source.kind === 'plain' ? source : null;
  const songDirection = source.direction;
  const lineIndex = scheduled?.index ?? -1;
  const lineIsEmpty = scheduled?.isEmpty ?? true;
  // The faces the nameplate is set in (spec §3e): from the song's line
  // directions, or mincho-old over gothic before a song is recognised (and for
  // a song without lines, which has no directions). The idle clock does not
  // use them; it is always CLOCK_TIME_FACE over CLOCK_TEXT_FACE.
  const faces = useMemo(() => idleFaces(songDirection), [songDirection]);

  // The print area (visual overhaul spec §3d), shared with the idle
  // composition: the caption row in its bottom band is gothic xs.
  const area = useMemo<PrintArea | null>(
    () =>
      fonts === null
        ? null
        : printArea(viewport, fonts('gothic', 'regular', viewport.width * SIZE_RATIO.xs).getMetrics().ascent),
    [fonts, viewport],
  );
  const numeralFont = fonts === null ? null : fonts('gothic', 'regular', viewport.width * SIZE_RATIO.s);

  // The nameplate of a recognized song without synced lyrics (nameplate.ts):
  // its title is the line on stage below, the rest is drawn beside it.
  const unsyncedTitle = unsynced?.track.title ?? null;
  const unsyncedArtist = unsynced?.track.artist ?? null;
  const nameplate = useMemo<Nameplate | null>(() => {
    if (fonts === null || area === null || unsyncedTitle === null || unsyncedArtist === null) return null;
    return composeNameplate(
      { title: unsyncedTitle, artist: unsyncedArtist },
      faces,
      viewport,
      area,
      (font, weight) => measureWith(fonts, font, weight),
    );
  }, [area, faces, fonts, unsyncedArtist, unsyncedTitle, viewport]);

  // The lyric sheet of a recognized song with plain lyrics only (plainSheet.ts):
  // its heading's title is the line on stage below; the body, the rest of the
  // heading, the meter and the note are drawn beside it.
  const plainTitle = plain?.track.title ?? null;
  const plainArtist = plain?.track.artist ?? null;
  const plainText = plain?.text ?? null;
  const sheet = useMemo<PlainSheet | null>(() => {
    if (fonts === null || area === null || plainTitle === null || plainArtist === null || plainText === null) {
      return null;
    }
    return composePlainSheet(
      { title: plainTitle, artist: plainArtist },
      plainText,
      faces,
      viewport,
      area,
      (font, weight) => measureWith(fonts, font, weight),
    );
  }, [area, faces, fonts, plainArtist, plainText, plainTitle, viewport]);

  const lineScene = useMemo<LineScene | null>(() => {
    if (fonts === null || area === null || numeralFont === null) return null;
    if (nameplate !== null) {
      return {
        key: `title:${unsyncedArtist}/${unsyncedTitle}`,
        index: TITLE_INDEX,
        direction: nameplate.title.direction,
        layout: nameplate.title.layout,
        prev: null,
        next: null,
      };
    }
    if (sheet !== null) {
      // A key of its own: the sheet and the nameplate of the same song are
      // different stages (a re-resolution between them hands over by exit
      // and rise).
      return {
        key: `plain:${plainArtist}/${plainTitle}`,
        index: TITLE_INDEX,
        direction: sheet.title.direction,
        layout: sheet.title.layout,
        prev: null,
        next: null,
      };
    }
    if (lines === null || songDirection === null || lineIsEmpty) return null;
    const text = lines[lineIndex]?.text.trim() ?? '';
    if (text === '') return null;
    const direction = songDirection.lines[lineIndex] ?? FALLBACK_DIRECTION;
    // The line and its context lines keep clear of the room its ornament takes.
    const inner = lineArea(area, direction, numeralFont.getMetrics());
    const layout = layoutLine(
      text,
      direction,
      viewport,
      measureWith(fonts, direction.font, direction.weight),
      inner,
    );
    const showContext = direction.size !== 'xl';
    const vertical = direction.orientation === 'vertical';
    const context = (side: 'prev' | 'next', line: LyricLine | undefined) =>
      showContext ? contextLine(line, side, layout, vertical, viewport, inner, fonts) : null;
    return {
      key: `line:${lineIndex}`,
      index: lineIndex,
      direction,
      layout,
      prev: context('prev', lines[lineIndex - 1]),
      next: context('next', lines[lineIndex + 1]),
    };
  }, [
    area,
    fonts,
    lineIndex,
    lineIsEmpty,
    lines,
    nameplate,
    numeralFont,
    plainArtist,
    plainTitle,
    sheet,
    songDirection,
    unsyncedArtist,
    unsyncedTitle,
    viewport,
  ]);

  // When the nameplate or lyric sheet on stage appeared, on the stage clock
  // (performance.now() is the clock the anchor below tracks): its title's
  // rise, or the drop that lands it, is timed from here, and so is the
  // sheet's body. A lyric line is timed by its schedule.
  const plateKey = (nameplate !== null || sheet !== null) && lineScene !== null ? lineScene.key : null;
  const plateKeyRef = useRef<string | null>(null);
  const plateStartedAtRef = useRef(nowMonotonicMs);
  if (plateKeyRef.current !== plateKey) {
    plateKeyRef.current = plateKey;
    plateStartedAtRef.current = performance.now();
  }
  const lineStartedAtMs = scheduled?.startedAtMs ?? (plateKey !== null ? plateStartedAtRef.current : 0);

  // The recognition drop (design spec §7), once per fire time. Computed in
  // render so the line shown in the very same render can take it: the head
  // it lands on (the next beat head, if the grid is trusted), the idle glyphs
  // on stage at the fire, and when a fresh idle may rise after their scatter.
  // Skipped under reduced motion, where the stage clock does not advance.
  const dropAtMs = source.kind === 'idle' ? null : (source.dropAtMs ?? null);
  const dropRef = useRef<Drop | null>(null);
  // The idle composition shown in the previous render (null while a line is on
  // stage): the glyphs a drop firing now sends scattering. With it, when idle
  // last came on after something else was on stage (−∞ for the idle the stage
  // mounted with, which counts as long risen).
  const idleShownRef = useRef<IdleComposition | null>(null);
  const idleCameOnAtRef = useRef(Number.NEGATIVE_INFINITY);
  if (dropAtMs !== null && !reducedMotion && dropRef.current?.fireAtMs !== dropAtMs) {
    const periodMs = beatValues.periodMs.value;
    const headMs = dropHeadMs(
      dropAtMs,
      beatValues.nextBeatAtMs.value,
      periodMs,
      beatValues.confidence.value,
    );
    // Only an idle that had finished rising scatters. One that came on a
    // moment ago (the render between the previous song's line or nameplate
    // and the new song's, while the new result is confirmed) has hardly been
    // seen: scattering it would hold it at full opacity until the head, a
    // clock flashing up between two songs. It is simply replaced. (An idle
    // that rose after a previous drop rose from that drop's idleRiseAtMs.)
    const idleShown = idleShownRef.current;
    const idleRiseFromMs = Math.max(idleCameOnAtRef.current, dropRef.current?.idleRiseAtMs ?? 0);
    const idleSettled = idleShown !== null && dropAtMs - idleRiseFromMs >= ENTRANCE_DURATION_MS.rise;
    const idleGlyphs = idleSettled ? idleShown.glyphs : null;
    dropRef.current = {
      fireAtMs: dropAtMs,
      headMs,
      idleRiseAtMs: headMs + exitDurationMs('scatter', idleGlyphs?.length ?? 0, periodMs),
      idleGlyphs,
      lineKey: null,
    };
  }
  const drop = dropRef.current;
  // The first line shown after the fire (a lyric line, or a nameplate's title)
  // is the one that drops in; once the stage has moved past it (to another
  // line, or to idle), no later line takes the drop, not even the same line
  // coming back (a nameplate returning after a quiet spell rises as usual).
  if (drop !== null) {
    if (lineScene !== null) {
      if (drop.lineKey === null) drop.lineKey = lineScene.key;
      else if (drop.lineKey !== lineScene.key) drop.lineKey = DROP_LINE_DONE;
    } else if (drop.lineKey !== null) {
      drop.lineKey = DROP_LINE_DONE;
    }
  }
  const isDropLine = drop !== null && lineScene !== null && drop.lineKey === lineScene.key;
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
    // The same fire coming back after the stage moved past its line (a
    // nameplate returning from a quiet spell): the drop has played. Its idle
    // glyphs are the ones on stage at the fire, long scattered; whatever of
    // its play the timers did not get to remove (they were cleared when the
    // fire went away) is removed now, not replayed.
    if (current.lineKey === DROP_LINE_DONE) {
      setDropPlay((play) => (play !== null && play.fireAtMs === fireAtMs ? null : play));
      return undefined;
    }
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
    if (prev === null || (scene !== null && scene.key === prev.key)) return;
    const duration = exitDurationMs(
      prev.direction.entrance,
      prev.layout.glyphs.length,
      beatValues.periodMs.value,
    );
    if (duration <= 0 || reducedMotion) {
      setExiting(null);
      return;
    }
    // The exit starts when the next line did. Without a schedule (a nameplate
    // or a line leaving because its song was lost, replaced by another song,
    // or quiet) there is no next line, so it starts now: the stage clock's
    // anchor (nowMonotonicMs) is the last line change, possibly long ago, and
    // an exit timed from it would be over before it was drawn.
    const startedAtMs = scheduled?.startedAtMs ?? performance.now();
    setExiting({ scene: prev, startedAtMs });
  }, [scene, beatValues, scheduled, reducedMotion]);
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

  // The lyric sheet's body (design spec §7, 2026-11-11): the whole text at
  // once, fading in from PLAIN_BODY_DELAY_MS after the sheet came on (wall
  // clock) and then staying as it is. Nothing switches it on a timer, and
  // nothing the music does reaches it (not the beat, the bands, the surge,
  // nor the drop's head). The fade is derived on the UI thread from the stage
  // clock; React does not re-render for the body after it is laid out.
  const bodyStartMs = sheet !== null && plateKey !== null ? plateStartedAtRef.current + PLAIN_BODY_DELAY_MS : null;
  const shownBody = useMemo<ShownBody | null>(
    () =>
      sheet === null || plateKey === null || bodyStartMs === null
        ? null
        : {
            key: plateKey,
            runs: sheet.body.runs,
            startMs: bodyStartMs,
            font: sheet.body.font,
            sizePx: sheet.body.sizePx,
          },
    [bodyStartMs, plateKey, sheet],
  );
  const bodyTiming = useMemo<PlainBodyProps['timing'] | null>(
    () => (shownBody === null ? null : { kind: 'shown', startMs: shownBody.startMs }),
    [shownBody],
  );
  // The leaving body: when the sheet leaves the stage (or gives way to
  // another song's sheet), its body fades out over the fixed PLAIN_EXIT_MS
  // from the opacity it had, then is removed. Not under reduced motion.
  const [leavingBody, setLeavingBody] = useState<{
    body: ShownBody;
    timing: Extract<PlainBodyProps['timing'], { kind: 'leaving' }>;
  } | null>(null);
  const lastBodyRef = useRef<ShownBody | null>(null);
  useEffect(() => {
    const prev = lastBodyRef.current;
    lastBodyRef.current = shownBody;
    if (prev === null || (shownBody !== null && shownBody.key === prev.key)) return;
    const now = performance.now();
    const fromOpacity = plainBodyOpacity(now - prev.startMs);
    if (reducedMotion || fromOpacity <= 0) {
      setLeavingBody(null);
      return;
    }
    setLeavingBody({ body: prev, timing: { kind: 'leaving', startMs: now, fromOpacity } });
  }, [shownBody, reducedMotion]);
  useEffect(() => {
    if (leavingBody === null) return undefined;
    const id = setTimeout(
      () => setLeavingBody((current) => (current === leavingBody ? null : current)),
      PLAIN_EXIT_MS + EXIT_SLACK_MS,
    );
    return () => clearTimeout(id);
  }, [leavingBody]);

  const showIdle = fonts !== null && scene === null;
  const trackTitle = source.track?.title ?? null;
  const trackArtist = source.track?.artist ?? null;
  captionCountRef.current =
    trackTitle !== null && trackArtist !== null
      ? [...captionText({ title: trackTitle, artist: trackArtist })].filter((c) => c.trim() !== '').length
      : 0;
  // The idle clock's time: a wall clock, so it keeps going through silence.
  // Ticks only while idle is shown, on each second boundary, and re-renders
  // only when the second has actually changed (an early timer is a no-op), so
  // the stage re-renders at most once a second for it. A layout effect, so
  // the time is current before the first idle frame is painted.
  const [clockNow, setClockNow] = useState(() => new Date());
  useLayoutEffect(() => {
    if (!showIdle) return undefined;
    let id: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = new Date();
      setClockNow((previous) =>
        Math.floor(previous.getTime() / 1000) === Math.floor(now.getTime() / 1000) ? previous : now,
      );
      id = setTimeout(tick, 1000 - now.getMilliseconds() + CLOCK_TICK_SLACK_MS);
    };
    tick();
    return () => clearTimeout(id);
  }, [showIdle]);
  const idle = useMemo(() => {
    if (!showIdle || fonts === null) return null;
    const track =
      trackTitle !== null && trackArtist !== null ? { title: trackTitle, artist: trackArtist } : null;
    return composeClock(
      clockNow,
      viewport,
      track,
      measureWith(fonts, CLOCK_TEXT_FACE, 'regular'),
      measureWith(fonts, CLOCK_TIME_FACE, 'regular'),
    );
  }, [clockNow, fonts, showIdle, trackArtist, trackTitle, viewport]);
  // When idle last came on, on the stage clock (which tracks performance.now();
  // see the anchor logic above): the clock rises in from here. The seconds
  // ticking never move it, so the entrance plays once per appearance.
  const idleOnRef = useRef(showIdle);
  const idleStartedAtRef = useRef(nowMonotonicMs);
  if (idleOnRef.current !== showIdle) {
    idleOnRef.current = showIdle;
    if (showIdle) {
      idleStartedAtRef.current = performance.now();
      idleCameOnAtRef.current = idleStartedAtRef.current;
    }
  }
  const idleBase = useMemo(() => (idle === null ? null : splitByFace(idle.glyphs)), [idle]);
  idleShownRef.current = idle;
  // After a drop the idle layers are remounted (key) so their rise replays,
  // timed to begin once the previous idle glyphs have scattered.
  const idleKey = drop?.fireAtMs ?? 0;
  const idleRiseAtMs = drop?.idleRiseAtMs ?? 0;
  const idleRiseFromMs = Math.max(idleStartedAtRef.current, idleRiseAtMs);
  const idleExit = dropPlay?.idleExit ?? null;
  const idleExitByFace = useMemo(() => (idleExit === null ? null : splitByFace(idleExit)), [idleExit]);
  // While the caption traces in it is drawn glyph by glyph from the head.
  const captionTraceFromMs = dropPlay?.captionTracing === true && drop !== null ? drop.headMs : null;
  const caption = idle?.caption ?? null;
  const captionTrace = useMemo(
    () =>
      caption !== null && captionTraceFromMs !== null && fonts !== null
        ? captionGlyphs(caption, measureWith(fonts, CLOCK_TEXT_FACE, 'regular'))
        : null,
    [caption, captionTraceFromMs, fonts],
  );

  // The lamp's centre (visual overhaul spec §3c.3): the line on stage's
  // bounds, in uv; in idle the clock's own focus (the centre of its HH:MM), or
  // failing that a primary accent glyph's centre; failing all, a little above
  // the centre. Written only when it moves (a new line, idle coming on, a new
  // viewport; the clock's focus does not move with the seconds); the
  // background slides the lamp there on the UI thread.
  const focusTarget = useSharedValue<Uv>(IDLE_FOCUS);
  // On the lyric sheet the lamp lies on the body (the whole text), not on the
  // small heading.
  const sheetBounds = sheet !== null && scene !== null ? sheet.body.bounds : null;
  const sceneBounds = scene?.layout.bounds ?? null;
  const idleFocus = idle?.focus ?? null;
  const idleAnchor = idle?.glyphs.find((g) => g.face === 'primary' && g.accent === true) ?? null;
  let focusX = IDLE_FOCUS.x;
  let focusY = IDLE_FOCUS.y;
  if (sheetBounds !== null) {
    focusX = (sheetBounds.x + sheetBounds.width / 2) / width;
    focusY = (sheetBounds.y + sheetBounds.height / 2) / height;
  } else if (sceneBounds !== null) {
    focusX = (sceneBounds.x + sceneBounds.width / 2) / width;
    focusY = (sceneBounds.y + sceneBounds.height / 2) / height;
  } else if (idleFocus !== null) {
    focusX = idleFocus.x / width;
    focusY = idleFocus.y / height;
  } else if (idleAnchor !== null && fonts !== null) {
    const { advance, ascent, descent } = measureWith(fonts, CLOCK_TIME_FACE, 'regular')(
      idleAnchor.char,
      idleAnchor.sizePx,
    );
    focusX = (idleAnchor.x + advance / 2) / width;
    focusY = (idleAnchor.y + (ascent + descent) / 2) / height;
  }
  useEffect(() => {
    focusTarget.value = { x: focusX, y: focusY };
  }, [focusTarget, focusX, focusY]);

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
  // The ink's body (visual overhaul spec §3c.1): the gradient colours of ink
  // and accent glyphs, derived here once per frame and shared by every glyph.
  // A context line is flat, in the ink leaned toward the lamp (§3c.3).
  const light = lightHexFor(palette);
  const inkBodyNow = useDerivedValue(
    () => inkBody(inkNow.value, light, palette.background),
    [palette, light],
  );
  const accentBodyNow = useDerivedValue(
    () => accentBody(accentNow.value, surgeHighHex(palette)),
    [palette],
  );
  const body = useMemo<GlyphBody>(
    () => ({ ink: inkBodyNow, accent: accentBodyNow }),
    [inkBodyNow, accentBodyNow],
  );
  const contextInkNow = useDerivedValue(() => contextInk(inkNow.value, light), [light]);
  const lineShadowColor = rgbaOf(palette.background, LINE_SHADOW_ALPHA);
  const shared = {
    time,
    beat: beatValues,
    reducedMotion,
    palette,
    feel,
    inkValue: inkNow,
    accentValue: accentNow,
    body,
  } as const;
  // Stable font getters keep the memoised GlyphLayers from re-rendering on every beat update.
  const gothic = useCallback((sizePx: number) => fonts!('gothic', 'regular', sizePx), [fonts]);
  // The idle clock's faces: the time in CLOCK_TIME_FACE, the seconds, the
  // date and the caption in CLOCK_TEXT_FACE, whatever the song (so a clock
  // scattering at a drop is in the faces it was set in, too).
  const idlePrimary = useCallback((sizePx: number) => fonts!(CLOCK_TIME_FACE, 'regular', sizePx), [fonts]);
  const idleSecondary = useCallback((sizePx: number) => fonts!(CLOCK_TEXT_FACE, 'regular', sizePx), [fonts]);
  // The nameplate's artist is in the song's secondary face.
  const plateSecondary = useCallback(
    (sizePx: number) => fonts!(faces.secondary, 'regular', sizePx),
    [fonts, faces.secondary],
  );
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
          silence={beatValues.silence}
          focus={focusTarget}
          time={time}
          dropAtMs={drop?.fireAtMs ?? null}
          width={width}
          height={height}
          reducedMotion={reducedMotion}
        />
      </View>
      {fonts !== null ? (
        <Canvas style={styles.layer}>
          {idleExitByFace !== null && drop !== null
            ? // The idle glyphs at the fire, in the faces they were set in:
              // held in place until the head, then scattered (the exit derived
              // from `scatter`). No shadow, like any leaving line.
              (['primary', 'secondary'] as const).map((role) => (
                <GlyphLayer
                  key={`exit-idle-${role}`}
                  {...shared}
                  glyphs={idleExitByFace[role]}
                  fontFor={role === 'primary' ? idlePrimary : idleSecondary}
                  lineStartedAtMs={drop.headMs}
                  entrance="scatter"
                  hold="still"
                  accent={false}
                  exiting
                  seed={1}
                  testIDPrefix="exit-idle-glyph"
                />
              ))
            : null}
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
          {scene !== null && area !== null && numeralFont !== null ? (
            <>
              <Ornament
                ornament={scene.direction.ornament}
                orientation={scene.direction.orientation}
                bounds={scene.layout.bounds}
                area={area}
                ink={inkNow}
                accent={accentNow}
                accentLine={scene.direction.accent}
                bar={beat.bar}
                numeralFont={numeralFont}
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
              {/* The grounding shadow (spec §3c.2): one offscreen layer for the
                  whole line on stage. Not on the leaving line, the context
                  lines, the caption or the glow. */}
              <Group
                layer={
                  <Paint>
                    <Shadow dx={0} dy={LINE_SHADOW_DY} blur={LINE_SHADOW_BLUR} color={lineShadowColor} />
                  </Paint>
                }
                {...({ testID: 'line-shadow' } as object)}
              >
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
              </Group>
              {(['prev', 'next'] as const).map((side) => {
                const context = scene[side];
                if (context === null) return null;
                const testProps = { testID: `context-${side}` } as object;
                return (
                  <Group key={side} opacity={CONTEXT_OPACITY} {...testProps}>
                    <Rect {...context.rule} color={accentNow} {...({ testID: `context-${side}-rule` } as object)} />
                    <GlyphLayer
                      {...shared}
                      inkValue={contextInkNow}
                      body={null}
                      glyphs={context.glyphs}
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
          {unsynced !== null && nameplate !== null && scene !== null ? (
            <>
              {/* The rest of the nameplate (nameplate.ts), beside the title the
                  block above draws as the line on stage: the artist small and
                  flat under its accent rule (no shadow, like the caption), the
                  band meter on the foot of the print area, the note on the
                  caption row. The artist arrives with the title (fades in at
                  the same landing) and otherwise stands still. */}
              {nameplate.artist.glyphs.length > 0 ? (
                <Group opacity={CAPTION_OPACITY} {...({ testID: 'nameplate-artist' } as object)}>
                  <Rect
                    {...nameplate.artist.rule}
                    color={accentNow}
                    {...({ testID: 'nameplate-artist-rule' } as object)}
                  />
                  <GlyphLayer
                    {...shared}
                    body={null}
                    glyphs={nameplate.artist.glyphs}
                    fontFor={plateSecondary}
                    lineStartedAtMs={lineStartedAtMs}
                    lineLandsAtMs={lineLandsAtMs}
                    entrance="fade"
                    hold="still"
                    accent={false}
                    seed={scene.index + 1}
                    testIDPrefix="nameplate-artist-glyph"
                  />
                </Group>
              ) : null}
              <BandMeter
                x={nameplate.meter.x}
                width={nameplate.meter.width}
                baseline={nameplate.meter.baseline}
                beat={beatValues}
                ink={inkNow}
                reducedMotion={reducedMotion}
              />
              <Text
                x={nameplate.note.x}
                y={nameplate.note.y}
                text={unsyncedNote(unsynced.reason)}
                font={gothic(nameplate.note.sizePx)}
                color={inkNow}
                opacity={CAPTION_OPACITY}
                {...({ testID: 'unsynced-note' } as object)}
              />
            </>
          ) : null}
          {leavingBody !== null ? (
            <PlainBody
              runs={leavingBody.body.runs}
              font={fonts(leavingBody.body.font, 'regular', leavingBody.body.sizePx)}
              color={palette.ink}
              time={time}
              timing={leavingBody.timing}
              reducedMotion={reducedMotion}
              testID="plain-body-leaving"
            />
          ) : null}
          {plain !== null && sheet !== null && scene !== null ? (
            <>
              {/* The lyric sheet (plainSheet.ts), beside its heading's title
                  that the block above draws as the line on stage: the whole
                  body at once in the palette's own ink (flat, no shadow, no
                  motion, never highlighted, never turned), the artist small
                  and flat, the accent rule under the heading, the band meter
                  on the foot of the print area, the note on the caption row. */}
              {shownBody !== null && bodyTiming !== null ? (
                <PlainBody
                  runs={shownBody.runs}
                  font={fonts(shownBody.font, 'regular', shownBody.sizePx)}
                  color={palette.ink}
                  time={time}
                  timing={bodyTiming}
                  reducedMotion={reducedMotion}
                  testID="plain-body"
                />
              ) : null}
              {sheet.artist.glyphs.length > 0 ? (
                <Group opacity={CAPTION_OPACITY} {...({ testID: 'plain-artist' } as object)}>
                  <GlyphLayer
                    {...shared}
                    body={null}
                    glyphs={sheet.artist.glyphs}
                    fontFor={plateSecondary}
                    lineStartedAtMs={lineStartedAtMs}
                    lineLandsAtMs={lineLandsAtMs}
                    entrance="fade"
                    hold="still"
                    accent={false}
                    seed={scene.index + 1}
                    testIDPrefix="plain-artist-glyph"
                  />
                </Group>
              ) : null}
              <Rect {...sheet.rule} color={accentNow} {...({ testID: 'plain-rule' } as object)} />
              <BandMeter
                x={sheet.meter.x}
                width={sheet.meter.width}
                baseline={sheet.meter.baseline}
                beat={beatValues}
                ink={inkNow}
                reducedMotion={reducedMotion}
              />
              <Text
                x={sheet.note.x}
                y={sheet.note.y}
                text={RECOGNITION_COPY.lyrics_plain_sheet}
                font={gothic(sheet.note.sizePx)}
                color={inkNow}
                opacity={CAPTION_OPACITY}
                {...({ testID: 'plain-note' } as object)}
              />
            </>
          ) : null}
          {idle !== null && idleBase !== null ? (
            <>
              {/* The idle clock: one layer per face, under the same grounding
                  shadow as the line on stage (§3c.2), one offscreen layer for
                  the whole clock. Not on the caption. It rises in once each
                  time idle comes on (or after a drop's scatter) and then holds
                  still: a wall clock does not wobble. The glyph keys are
                  stable, so the ticking seconds swap characters in place. */}
              <Group
                layer={
                  <Paint>
                    <Shadow dx={0} dy={LINE_SHADOW_DY} blur={LINE_SHADOW_BLUR} color={lineShadowColor} />
                  </Paint>
                }
                {...({ testID: 'idle-shadow' } as object)}
              >
                {(['primary', 'secondary'] as const).map((role) => (
                  <GlyphLayer
                    key={`idle-base-${role}-${idleKey}`}
                    {...shared}
                    glyphs={idleBase[role]}
                    fontFor={role === 'primary' ? idlePrimary : idleSecondary}
                    lineStartedAtMs={idleRiseFromMs}
                    entrance="rise"
                    hold="still"
                    accent={false}
                    seed={0}
                  />
                ))}
              </Group>
              {idle.caption !== null ? (
                <Rect
                  x={idle.caption.x}
                  y={
                    idle.caption.y +
                    idleSecondary(idle.caption.sizePx).getMetrics().ascent -
                    CAPTION_RULE_GAP -
                    CAPTION_RULE_HEIGHT
                  }
                  width={CAPTION_RULE_WIDTH}
                  height={CAPTION_RULE_HEIGHT}
                  color={accentNow}
                  {...({ testID: 'idle-caption-rule' } as object)}
                />
              ) : null}
              {idle.caption !== null && captionTrace !== null && captionTraceFromMs !== null ? (
                // The caption leads the first line after a drop: traced in
                // from the head, glyph by glyph, then it stands as plain text.
                <Group opacity={CAPTION_OPACITY}>
                  <GlyphLayer
                    {...shared}
                    body={null}
                    glyphs={captionTrace}
                    fontFor={idleSecondary}
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
                  font={idleSecondary(idle.caption.sizePx)}
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
