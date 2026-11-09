import { DEFAULT_IDLE_GLYPHS } from '../direction/types';
import type { Size, SongDirection } from '../direction/types';
import type { FontKey, FontWeight } from './fonts';
import { printArea, SIZE_RATIO } from './layout';
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
// The print (visual overhaul spec §3e): each glyph carries its face role
// (anchors primary, companions secondary; the stage picks the faces with
// `idleFaces`), one anchor per epoch is in the accent, and so is the most
// recently swapped glyph until the next swap. The other glyphs are ink, the
// m-tier companions at MUTED_ALPHA. Rows and columns are measured with the
// caller's measure (the print area's gothic) whatever the faces, so a song
// being recognised never moves the rows.
//
// Reserved bands: the print area (layout.ts `printArea`, shared with the
// context lines of LyricStage):
// - Top: the wordmark row (MUSICAGE / status). Glyph boxes start below it
//   plus a margin.
// - Bottom: the controls stack (recognition row, listening row). Glyph boxes
//   and the caption stay above it. The caption's baseline sits a small gap
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
/** Opacity of the m-tier companions (ink 0.75, spec §3e). */
const MUTED_ALPHA = 0.75;

/** The idle screen's two faces (visual overhaul spec §3e). */
export interface IdleFaces {
  /** The anchors' face. */
  primary: FontKey;
  /** The companions' and the caption's face. */
  secondary: FontKey;
  /** Bold when the primary face is gothic (the only face with a bold file). */
  anchorWeight: FontWeight;
}

/** Before a song is recognised: an old mincho over gothic. */
export const UNRECOGNIZED_IDLE_FACES: IdleFaces = {
  primary: 'mincho-old',
  secondary: 'gothic',
  anchorWeight: 'regular',
};

/**
 * The idle faces for a song (spec §3e). The primary face is the face of the
 * most of the song's line directions; a tie goes to the face that appears on
 * the earlier line. The secondary is the song's other face (the next by the
 * same count, should a direction carry more than two), or gothic when the song
 * has one face only. With no song, or a song without line directions,
 * UNRECOGNIZED_IDLE_FACES.
 */
export function idleFaces(direction: SongDirection | null): IdleFaces {
  if (direction === null || direction.lines.length === 0) return UNRECOGNIZED_IDLE_FACES;
  // Map keeps insertion order, i.e. each face's first line; the stable sort
  // keeps that order between equal counts.
  const counts = new Map<FontKey, number>();
  for (const line of direction.lines) counts.set(line.font, (counts.get(line.font) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([font]) => font);
  const primary = ranked[0]!;
  return {
    primary,
    secondary: ranked[1] ?? 'gothic',
    anchorWeight: primary === 'gothic' ? 'bold' : 'regular',
  };
}

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
  const area = printArea(viewport, measure(pool[0]!, captionPx).ascent);
  const captionY = area.captionBaseline;
  const anchorMetrics = measure(pool[0]!, tierPx[0]!);
  const firstBaseline = area.top - anchorMetrics.ascent;
  const lastBaseline = area.bottom - anchorMetrics.descent;
  const pitch = Math.max((lastBaseline - firstBaseline) / (ROWS - 1), tierPx[0]! * MIN_ROW_PITCH);
  const columnWidth = (area.right - area.left) / COLUMNS;

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

  // The epoch's accent anchor: the anchor on one hashed row.
  const accentRow = pick('accentRow', ROWS);
  const placed = cells.map(({ row, col, tier }, slot): PlacedGlyph => {
    const accent = (tier === 0 && row === accentRow) || slot === swappedSlot;
    const muted = !accent && tier === TIERS.length - 1;
    return {
      char: chars[slot]!,
      // The swapped glyph gets a one-off index so its key in GlyphLayer
      // changes and its `rise` entrance replays; every other slot keeps its
      // slot number as a stable key.
      index: slot === swappedSlot ? 1000 + epoch * IDLE_EPOCH_BARS + barInEpoch : slot,
      x: area.left + col * columnWidth,
      y: firstBaseline + row * pitch,
      rotateDeg: 0,
      sizePx: tierPx[tier]!,
      emphasized: false,
      phaseOffset: (col + row) / 8,
      face: tier === 0 ? 'primary' : 'secondary',
      accent,
      ...(muted ? { alpha: MUTED_ALPHA } : {}),
    };
  });

  return {
    glyphs: placed,
    caption: track && {
      text: captionText(track),
      x: area.left,
      y: captionY,
      sizePx: captionPx,
    },
  };
}
