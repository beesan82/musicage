import { DEFAULT_IDLE_GLYPHS } from '../direction/types';
import type { Size } from '../direction/types';
import { SIZE_RATIO } from './layout';
import type { GlyphMeasure, PlacedGlyph, Viewport } from './layout';

// Idle composition: shown while no lyric line is active. The composition is
// seeded by an 8-bar epoch, so inside an epoch the cells, count and sizes are
// fixed and neighbouring bars differ only in one swapped glyph (see below).
//
// The shape is a typographic poster, not a scatter: the structure must stay
// readable even though the glyphs are arbitrary digits and marks.
// - Four baseline rows, evenly spaced over the free band of the stage (see
//   "reserved bands" below). Every glyph on a row sits on that row's baseline.
// - Three columns; a glyph's left edge (its origin x) sits on its column's
//   line, so a column reads as one vertical edge whatever the glyph sizes.
// - Three size tiers (xl, l, m). Each row holds exactly one anchor glyph at
//   the largest tier; the other glyphs on the row step down one tier per
//   column of distance from the anchor (l beside it, m two columns away).
// - Anchors follow one of two rules, alternating by epoch: on odd epochs they
//   share one column (a straight line of four, the "aligned" epochs); on even
//   epochs they zigzag across the columns (0,1,2,1 read downward, from a
//   hashed starting phase).
// - Companions: 1-5 further glyphs on free cells, so the count is 5-9.
// Idle glyphs are never rotated: the vertical-writing rotation rule made digits
// and marks lie sideways here. Each glyph carries `phaseOffset` from its cell,
// (col + row) / 8, so the breathe hold crosses the grid as a wave.
//
// Reserved bands (y down). The stage is drawn full-screen behind MusicageApp's
// chrome, which drifts with it (both are inside the burn-in drift view), so
// the bands can be fixed offsets from the safe-area insets:
// - Top: the wordmark row (MUSICAGE / status). Glyph boxes start below it
//   plus a margin.
// - Bottom: the controls stack (recognition row, listening row). Glyph boxes
//   and the caption stay above it. The caption's baseline sits CAPTION_GAP
//   above the controls, at the left margin; the glyph rows end a margin above
//   the caption's top. The caption line is reserved even when there is no
//   track, so recognising a song does not move the rows.

export type IdleTrack = { title: string; artist: string } | null;

export interface IdleComposition {
  glyphs: PlacedGlyph[];
  caption: { text: string; x: number; y: number; sizePx: number } | null;
}

/** Bars per epoch: at 120 BPM an epoch is about 16 seconds. */
export const IDLE_EPOCH_BARS = 8;

/** The caption's text for a recognized track: artist, an em dash, title. */
export function captionText(track: NonNullable<IdleTrack>): string {
  return `${track.artist} — ${track.title}`;
}

const MARGIN = 24;
const COLUMNS = 3;
const ROWS = 4;
/** Size tiers, largest first; tier 0 is the row anchor. */
const TIERS: readonly Size[] = ['xl', 'l', 'm'];
const MIN_COMPANIONS = 1;
const MAX_COMPANIONS = 5;
/** Anchor column per row on zigzag epochs, read downward from a hashed phase. */
const ZIGZAG = [0, 1, 2, 1];
/**
 * Rows never come closer than this many xl heights, so a stage too short for
 * the reserved bands degrades to touching rows rather than inverted ones.
 */
const MIN_ROW_PITCH = 1.15;

/**
 * Height of MusicageApp's wordmark row below the top inset: `wordmarkRow`
 * paddingTop 12 plus one line of 13pt text (about 16px on iOS).
 */
const TOP_RESERVED = 12 + 16;
/**
 * Height of MusicageApp's controls above the bottom inset: `content`
 * paddingBottom 18, then `controlsStack` holding RecognitionControls and
 * ListeningControls (each one button row of minHeight 48) with gap 16.
 * A message line (mic denied, recognition error) can grow the stack past
 * this; those are exceptional states and may cover the lowest row.
 */
const BOTTOM_RESERVED = 18 + 48 + 16 + 48;
/** From the caption's baseline down to the controls' top. */
const CAPTION_GAP = 12;

/** FNV-1a 32-bit hash. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

interface Cell {
  row: number;
  col: number;
  tier: number;
}

export function composeIdle(
  epoch: number,
  barInEpoch: number,
  glyphs: string,
  viewport: Viewport,
  track: IdleTrack,
  measure: GlyphMeasure,
): IdleComposition {
  const pool = [...(glyphs === '' ? DEFAULT_IDLE_GLYPHS : glyphs)];
  const pick = (key: string, n: number) => fnv1a(`${epoch}:${key}`) % n;
  const tierPx = TIERS.map((size) => viewport.width * SIZE_RATIO[size]);
  const captionPx = viewport.width * SIZE_RATIO.xs;

  // Vertical bands. Metrics come from the font, not the character, so any
  // pool character stands in for the row's ascent and descent.
  const controlsTop = viewport.height - viewport.insetBottom - BOTTOM_RESERVED;
  const captionY = controlsTop - CAPTION_GAP;
  const captionTop = captionY + measure(pool[0]!, captionPx).ascent;
  const areaTop = viewport.insetTop + TOP_RESERVED + MARGIN;
  const areaBottom = captionTop - MARGIN;
  const anchorMetrics = measure(pool[0]!, tierPx[0]!);
  const firstBaseline = areaTop - anchorMetrics.ascent;
  const lastBaseline = areaBottom - anchorMetrics.descent;
  const pitch = Math.max((lastBaseline - firstBaseline) / (ROWS - 1), tierPx[0]! * MIN_ROW_PITCH);
  const columnWidth = (viewport.width - 2 * MARGIN) / COLUMNS;

  // Anchors: one per row, on one column (odd epochs) or zigzagging (even).
  const aligned = epoch % 2 === 1;
  const alignColumn = pick('align', COLUMNS);
  const zigzagPhase = pick('zigzag', ZIGZAG.length);
  const anchorColumn = (row: number) =>
    aligned ? alignColumn : ZIGZAG[(row + zigzagPhase) % ZIGZAG.length]!;
  const cells: Cell[] = [];
  const free: Cell[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const distance = Math.abs(col - anchorColumn(row));
      const cell = { row, col, tier: Math.min(distance, TIERS.length - 1) };
      (distance === 0 ? cells : free).push(cell);
    }
  }
  // Companions on free cells, then everything in reading order so the swap
  // below walks the composition top-left to bottom-right.
  const companions = MIN_COMPANIONS + pick('count', MAX_COMPANIONS - MIN_COMPANIONS + 1);
  for (let index = 0; index < companions; index++) {
    cells.push(free.splice(pick(`cell${index}`, free.length), 1)[0]!);
  }
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  const count = cells.length;

  const chars = cells.map((_, slot) => pool[pick(`char${slot}`, pool.length)]!);
  // One swap per bar inside the epoch, cumulative: bar `barInEpoch` has seen
  // that many swaps, the j-th targeting slot j % count and redrawing its char
  // (never the char already there, so the change is always visible). The most
  // recently swapped slot is marked by a unique index below.
  let swappedSlot = -1;
  for (let j = 0; j < barInEpoch; j++) {
    const slot = j % count;
    swappedSlot = slot;
    if (pool.length > 1) {
      const current = chars[slot]!;
      const draw = fnv1a(`${epoch}:${j}:swap`) % (pool.length - 1);
      let seen = -1;
      for (const candidate of pool) {
        if (candidate === current) continue;
        seen += 1;
        if (seen === draw) {
          chars[slot] = candidate;
          break;
        }
      }
    }
  }

  const placed: PlacedGlyph[] = cells.map(({ row, col, tier }, slot) => ({
    char: chars[slot]!,
    // The swapped glyph gets a one-off index so its key in GlyphLayer
    // changes and its `rise` entrance replays; every other slot keeps its
    // slot number as a stable key.
    index: slot === swappedSlot ? 1000 + epoch * IDLE_EPOCH_BARS + barInEpoch : slot,
    x: MARGIN + col * columnWidth,
    y: firstBaseline + row * pitch,
    rotateDeg: 0,
    sizePx: tierPx[tier]!,
    emphasized: false,
    phaseOffset: (col + row) / 8,
  }));

  return {
    glyphs: placed,
    caption: track && {
      text: captionText(track),
      x: MARGIN,
      y: captionY,
      sizePx: captionPx,
    },
  };
}
