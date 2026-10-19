import type { LineDirection, Size } from '../direction/types';

// Coordinate convention (canvas pixels, y grows downward):
// - `x`, `y` on a PlacedGlyph are the glyph's baseline origin, i.e. where Skia's
//   <Text x y> puts it. `ascent` from GlyphMeasure is negative (above the baseline).
// - The usable area is the viewport minus the safe-area insets and a 24px margin
//   on every side.
// - Vertical: each glyph takes a square cell of its own `sizePx` and the cells stack
//   downward from the top of the usable area. Column 1 is centred on the viewport's
//   centre x; each further column sits `sizePx · 1.4` to the left. An upright glyph's
//   origin is its left edge (column centre minus half its advance) on the baseline
//   `ascent` below the cell top. A glyph with `rotateDeg: 90` is drawn by the renderer
//   rotated 90° clockwise about its own origin, so its advance runs downward and its
//   ascent points right: the origin sits at the cell top (centred on the advance) and
//   is shifted so the ascent-plus-descent box straddles the column centre.
// - Vertical punctuation (、。，．) stays upright (`rotateDeg: 0`) but its origin is
//   shifted by (+0.5·sizePx, −0.5·sizePx) from the upright placement, so the mark
//   sits in the cell's upper right as vertical Japanese typesetting expects.
// - Horizontal: rows start 24px from the left and advance by each glyph's `advance`;
//   rows are `sizePx · 1.3` apart and the block is centred vertically in the usable area.
// - A line that needs more than two columns (rows) is retried one size smaller, down
//   to `xs`, which wraps into as many columns (rows) as it needs.
// - `bounds` is the union of the glyph cells (vertical) or glyph boxes (horizontal).

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
): LineLayout {
  const chars = [...text.trim()];
  let step = SIZE_ORDER.indexOf(direction.size);
  for (;;) {
    const layout = layoutAtSize(chars, direction, viewport, measure, step);
    if (layout.columns <= MAX_WRAPPED_LINES || step === 0) return layout;
    step -= 1;
  }
}

function layoutAtSize(
  chars: string[],
  direction: LineDirection,
  viewport: Viewport,
  measure: GlyphMeasure,
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

  const top = viewport.insetTop + MARGIN;
  const usableHeight = viewport.height - viewport.insetTop - viewport.insetBottom - 2 * MARGIN;
  const usableWidth = viewport.width - 2 * MARGIN;
  const vertical = direction.orientation === 'vertical';
  const slots = vertical
    ? wrap(cells, (c) => c.sizePx, usableHeight)
    : wrap(cells, (c) => c.advance, usableWidth);
  const columns = Math.max(...slots.map((s) => s.line)) + 1;

  const glyphs: PlacedGlyph[] = [];
  const boxes: Box[] = [];
  if (vertical) {
    for (const { cell, line, offset } of slots) {
      const centerX = viewport.width / 2 - line * sizePx * COLUMN_GAP;
      const cellTop = top + offset;
      const rotated = ROTATED_IN_VERTICAL.test(cell.char);
      const shift = !rotated && SHIFTED_IN_VERTICAL.test(cell.char) ? cell.sizePx / 2 : 0;
      const x = rotated ? centerX - (-cell.ascent - cell.descent) / 2 : centerX - cell.advance / 2 + shift;
      const y = rotated ? cellTop + (cell.sizePx - cell.advance) / 2 : cellTop - cell.ascent - shift;
      glyphs.push(place(cell, x, y, rotated ? 90 : 0));
      boxes.push({ x: centerX - cell.sizePx / 2, y: cellTop, width: cell.sizePx, height: cell.sizePx });
    }
  } else {
    const first = cells.find((c) => !c.space)!;
    const metrics = measure(first.char, sizePx);
    const blockHeight = -metrics.ascent + metrics.descent + (columns - 1) * sizePx * ROW_GAP;
    const firstBaseline = top + (usableHeight - blockHeight) / 2 - metrics.ascent;
    for (const { cell, line, offset } of slots) {
      const x = MARGIN + offset;
      const y = firstBaseline + line * sizePx * ROW_GAP;
      glyphs.push(place(cell, x, y, 0));
      boxes.push({ x, y: y + cell.ascent, width: cell.advance, height: cell.descent - cell.ascent });
    }
  }
  return { glyphs, sizePx, bounds: union(boxes), columns };
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
