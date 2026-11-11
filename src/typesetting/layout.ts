import type { LineDirection, Placement, Size } from '../direction/types';

// Coordinate convention (canvas pixels, y grows downward):
// - `x`, `y` on a PlacedGlyph are the glyph's baseline origin, i.e. where Skia's
//   <Text x y> puts it. `ascent` from GlyphMeasure is negative (above the baseline).
// - The usable area is the print area (`printArea`, visual overhaul spec §3d) the
//   caller passes in, less any room the line's ornament needs (Ornaments.tsx `lineArea`).
// - Vertical: each glyph takes a square cell of its own `sizePx` and the cells stack
//   downward from the top of the usable area. Column 1 is centred on the usable
//   area's centre x; each further column sits `sizePx · 1.4` to the left. An upright glyph's
//   origin is its left edge (column centre minus half its advance) on the baseline
//   `ascent` below the cell top. A glyph with `rotateDeg: 90` is drawn by the renderer
//   rotated 90° clockwise about its own origin, so its advance runs downward and its
//   ascent points right: the origin sits at the cell top (centred on the advance) and
//   is shifted so the ascent-plus-descent box straddles the column centre.
// - Vertical punctuation (、。，．) stays upright (`rotateDeg: 0`) but its origin is
//   shifted by (+0.5·sizePx, −0.5·sizePx) from the upright placement, so the mark
//   sits in the cell's upper right as vertical Japanese typesetting expects.
// - Horizontal: rows start at the usable area's left edge and advance by each glyph's `advance`;
//   rows are `sizePx · 1.3` apart and the block is centred vertically in the usable area.
// - A line that needs more than two columns (rows) is retried one size smaller, down
//   to `xs`, which wraps into as many columns (rows) as it needs.
// - `bounds` is the union of the glyph cells (vertical) or glyph boxes (horizontal).
// - A direction's `placement` then moves the whole block (glyphs and bounds)
//   to the centre or a corner of the usable area (`placeBlock`).

export interface Viewport {
  width: number;
  height: number;
  insetTop: number;
  insetBottom: number;
}

export interface GlyphMeasure {
  (char: string, sizePx: number): { advance: number; ascent: number; descent: number };
}

export interface PlacedGlyph {
  char: string;
  index: number;
  x: number;
  y: number;
  rotateDeg: 0 | 90;
  sizePx: number;
  emphasized: boolean;
  /**
   * Extra breathe phase for this glyph, in cycles. Nothing sets it at present
   * (the idle poster used it for a wave across its grid); unset reads as 0.
   */
  phaseOffset?: number;
  /**
   * Which of the idle clock's two faces sets this glyph: the time row the
   * primary, the seconds and the date the secondary. Only the idle
   * composition sets it; the stage resolves it to a FontKey.
   */
  face?: 'primary' | 'secondary';
  /**
   * Drawn in the accent, statically, instead of the ink. Only the idle
   * composition sets it (the weekday kanji of the clock's date).
   */
  accent?: boolean;
  /**
   * Opacity multiplier on top of the motion's opacity. Only the idle
   * composition sets it (the clock's seconds and date); unset reads as 1.
   */
  alpha?: number;
}

export interface LineLayout {
  glyphs: PlacedGlyph[];
  sizePx: number;
  bounds: { x: number; y: number; width: number; height: number };
  columns: number;
}

export const SIZE_RATIO: Record<Size, number> = { xs: 0.045, s: 0.06, m: 0.08, l: 0.11, xl: 0.16 };

export const ROTATED_IN_VERTICAL = /[A-Za-z0-9ー（）「」『』【】()\[\]<>〈〉…‐–—]/;
export const SHIFTED_IN_VERTICAL = /[、。，．]/;

const MARGIN = 24;

// Reserved bands (y down). The stage is drawn full-screen behind MusicageApp's
// chrome, which drifts with it (both are inside the burn-in drift view), so
// the bands can be fixed offsets from the safe-area insets.

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

/**
 * The print area (visual overhaul spec §3d): the part of the stage between the
 * reserved bands and inside the side margins, where every stage element sits.
 * The bottom band holds the controls and the caption row; the caption is gothic
 * xs, so its top needs that font's (negative) ascent.
 */
export interface PrintArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The caption's baseline, at the left margin. */
  captionBaseline: number;
}

export function printArea(viewport: Viewport, captionAscent: number): PrintArea {
  const controlsTop = viewport.height - viewport.insetBottom - BOTTOM_RESERVED;
  const captionBaseline = controlsTop - CAPTION_GAP;
  return {
    left: MARGIN,
    right: viewport.width - MARGIN,
    top: viewport.insetTop + TOP_RESERVED + MARGIN,
    bottom: captionBaseline + captionAscent - MARGIN,
    captionBaseline,
  };
}

const COLUMN_GAP = 1.4;
const ROW_GAP = 1.3;
const MAX_WRAPPED_LINES = 2;
const SIZE_ORDER: Size[] = ['xs', 's', 'm', 'l', 'xl'];
const EPSILON = 1e-6;

interface Cell {
  char: string;
  index: number;
  space: boolean;
  emphasized: boolean;
  sizePx: number;
  advance: number;
  ascent: number;
  descent: number;
}

interface Slot {
  cell: Cell;
  line: number;
  offset: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ZERO_BOUNDS: Box = { x: 0, y: 0, width: 0, height: 0 };

export function layoutLine(
  text: string,
  direction: LineDirection,
  viewport: Viewport,
  measure: GlyphMeasure,
  area: PrintArea,
): LineLayout {
  const chars = [...text.trim()];
  let step = SIZE_ORDER.indexOf(direction.size);
  for (;;) {
    const layout = layoutAtSize(chars, direction, viewport, measure, area, step);
    if (layout.columns <= MAX_WRAPPED_LINES || step === 0) return placeBlock(layout, direction.placement, area);
    step -= 1;
  }
}

/**
 * Moves the laid-out block to its placement (design spec §4, 2026-11-11
 * evening): its bounds into the centre or a corner of `area`. Without a
 * placement the block stays where the classic layout put it. Along an axis
 * where the block is larger than the area it is not moved (it already
 * overflows; moving it would only push it further out on one side).
 */
function placeBlock(layout: LineLayout, placement: Placement | undefined, area: PrintArea): LineLayout {
  if (placement === undefined || layout.glyphs.length === 0) return layout;
  const b = layout.bounds;
  const roomX = area.right - area.left - b.width;
  const roomY = area.bottom - area.top - b.height;
  const fx = placement === 'center' ? 0.5 : placement.endsWith('left') ? 0 : 1;
  const fy = placement === 'center' ? 0.5 : placement.startsWith('top') ? 0 : 1;
  const dx = roomX >= 0 ? area.left + fx * roomX - b.x : 0;
  const dy = roomY >= 0 ? area.top + fy * roomY - b.y : 0;
  if (dx === 0 && dy === 0) return layout;
  return {
    ...layout,
    glyphs: layout.glyphs.map((g) => ({ ...g, x: g.x + dx, y: g.y + dy })),
    bounds: { ...b, x: b.x + dx, y: b.y + dy },
  };
}

function layoutAtSize(
  chars: string[],
  direction: LineDirection,
  viewport: Viewport,
  measure: GlyphMeasure,
  area: PrintArea,
  step: number,
): LineLayout {
  const sizePx = viewport.width * SIZE_RATIO[SIZE_ORDER[step]!];
  const emphasisPx = viewport.width * SIZE_RATIO[SIZE_ORDER[Math.min(step + 1, SIZE_ORDER.length - 1)]!];
  const emphasis = new Set(direction.emphasis);
  const cells = chars.map((char, index): Cell => {
    const emphasized = emphasis.has(index);
    const cellPx = emphasized ? emphasisPx : sizePx;
    return { char, index, space: /\s/.test(char), emphasized, sizePx: cellPx, ...measure(char, cellPx) };
  });
  if (!cells.some((c) => !c.space)) return { glyphs: [], sizePx, bounds: ZERO_BOUNDS, columns: 0 };

  const top = area.top;
  const usableHeight = area.bottom - area.top;
  const usableWidth = area.right - area.left;
  const vertical = direction.orientation === 'vertical';
  const slots = vertical
    ? wrap(cells, (c) => c.sizePx, usableHeight)
    : wrap(cells, (c) => c.advance, usableWidth);
  const columns = Math.max(...slots.map((s) => s.line)) + 1;

  const glyphs: PlacedGlyph[] = [];
  const boxes: Box[] = [];
  if (vertical) {
    for (const { cell, line, offset } of slots) {
      const centerX = (area.left + area.right) / 2 - line * sizePx * COLUMN_GAP;
      const cellTop = top + offset;
      const { x, y, rotateDeg } = verticalOrigin(cell.char, cell, cell.sizePx, centerX, cellTop);
      glyphs.push(place(cell, x, y, rotateDeg));
      boxes.push({ x: centerX - cell.sizePx / 2, y: cellTop, width: cell.sizePx, height: cell.sizePx });
    }
  } else {
    const first = cells.find((c) => !c.space)!;
    const metrics = measure(first.char, sizePx);
    const blockHeight = -metrics.ascent + metrics.descent + (columns - 1) * sizePx * ROW_GAP;
    const firstBaseline = top + (usableHeight - blockHeight) / 2 - metrics.ascent;
    for (const { cell, line, offset } of slots) {
      const x = area.left + offset;
      const y = firstBaseline + line * sizePx * ROW_GAP;
      glyphs.push(place(cell, x, y, 0));
      boxes.push({ x, y: y + cell.ascent, width: cell.advance, height: cell.descent - cell.ascent });
    }
  }
  return { glyphs, sizePx, bounds: union(boxes), columns };
}

/**
 * Where a glyph of a vertical column is drawn: its baseline origin and turn,
 * for a square cell of `sizePx` whose top is `cellTop` on a column centred on
 * `centerX` (see the coordinate convention at the top of this file).
 */
export function verticalOrigin(
  char: string,
  metrics: { advance: number; ascent: number; descent: number },
  sizePx: number,
  centerX: number,
  cellTop: number,
): { x: number; y: number; rotateDeg: 0 | 90 } {
  const rotated = ROTATED_IN_VERTICAL.test(char);
  const shift = !rotated && SHIFTED_IN_VERTICAL.test(char) ? sizePx / 2 : 0;
  return rotated
    ? { x: centerX - (-metrics.ascent - metrics.descent) / 2, y: cellTop + (sizePx - metrics.advance) / 2, rotateDeg: 90 }
    : { x: centerX - metrics.advance / 2 + shift, y: cellTop - metrics.ascent - shift, rotateDeg: 0 };
}

// Greedy wrap: a cell that would overflow `limit` starts the next line. Spaces keep
// their extent but are not returned, and a space that lands at the start of a
// wrapped line is dropped so lines never begin with blank space.
function wrap(cells: Cell[], extentOf: (cell: Cell) => number, limit: number): Slot[] {
  const slots: Slot[] = [];
  let line = 0;
  let cursor = 0;
  for (const cell of cells) {
    const extent = extentOf(cell);
    if (cursor > 0 && cursor + extent > limit + EPSILON) {
      line += 1;
      cursor = 0;
    }
    if (cell.space) {
      if (cursor > 0) cursor += extent;
      continue;
    }
    slots.push({ cell, line, offset: cursor });
    cursor += extent;
  }
  return slots;
}

function place(cell: Cell, x: number, y: number, rotateDeg: 0 | 90): PlacedGlyph {
  return { char: cell.char, index: cell.index, x, y, rotateDeg, sizePx: cell.sizePx, emphasized: cell.emphasized };
}

function union(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
