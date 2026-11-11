import type { LineDirection } from '../../direction/types';
import { layoutLine, printArea, ROTATED_IN_VERTICAL, SIZE_RATIO } from '../layout';
import type { GlyphMeasure } from '../layout';

const vp = { width: 390, height: 844, insetTop: 59, insetBottom: 34 };
const measure: GlyphMeasure = (_ch, size) => ({ advance: size, ascent: -size * 0.88, descent: size * 0.12 });
const base: LineDirection = {
  font: 'mincho',
  weight: 'regular',
  size: 'm',
  orientation: 'vertical',
  entrance: 'cut',
  hold: 'still',
  emphasis: [],
  accent: false,
  ornament: 'none',
};
const horizontal: LineDirection = { ...base, orientation: 'horizontal' };

// The print area (visual overhaul spec §3d), with a gothic xs caption row:
// top = 59 + 28 (wordmark row) + 24 = 111; bottom = 844 − 34 − 130 (controls)
// − 12 (caption gap) − 0.88·xs (caption ascent) − 24 ≈ 628.56; left 24, right 366.
const XS = 390 * SIZE_RATIO.xs;
const AREA = printArea(vp, -XS * 0.88);
// size m: 390 · 0.08; usable height H ≈ 517.56.
const M = 31.2;
const TOP = AREA.top;
const H = AREA.bottom - AREA.top;

test('vertical: glyphs share x and descend by advance, centered horizontally', () => {
  const l = layoutLine('夜の底', base, vp, measure, AREA);
  expect(l.sizePx).toBeCloseTo(M);
  expect(l.columns).toBe(1);
  expect(l.glyphs.map((g) => g.char)).toEqual(['夜', 'の', '底']);
  for (const g of l.glyphs) {
    expect(g.x).toBeCloseTo(195 - M / 2);
    expect(g.rotateDeg).toBe(0);
  }
  expect(l.glyphs.map((g) => g.y)).toEqual([0, 1, 2].map((i) => expect.closeTo(TOP + M * 0.88 + i * M)));
  expect(l.bounds.x).toBeCloseTo(195 - M / 2);
  expect(l.bounds.y).toBeCloseTo(TOP);
  expect(l.bounds.width).toBeCloseTo(M);
  expect(l.bounds.height).toBeCloseTo(3 * M);
});

test('vertical: latin letters, digits, chōonpu and brackets are rotated 90', () => {
  const l = layoutLine('東京ーA1（夜）', base, vp, measure, AREA);
  expect(l.glyphs.map((g) => g.rotateDeg)).toEqual([0, 0, 90, 90, 90, 90, 0, 90]);
  expect(ROTATED_IN_VERTICAL.test('東')).toBe(false);
});

test('vertical: a rotated glyph origin is centred on the column and starts at its cell top', () => {
  const l = layoutLine('夜A', base, vp, measure, AREA);
  const a = l.glyphs[1]!;
  // Rotated 90° clockwise about its origin, the ascent points right and the descent left.
  expect(a.x).toBeCloseTo(195 - (M * 0.88 - M * 0.12) / 2);
  expect(a.y).toBeCloseTo(TOP + M);
});

test('vertical: 、。，． stay upright and move to the upper right of their cell', () => {
  const l = layoutLine('雨、鼓動', base, vp, measure, AREA);
  const comma = l.glyphs[1]!;
  expect(comma.char).toBe('、');
  expect(comma.rotateDeg).toBe(0);
  // An upright glyph in the second cell would sit at (195 − M/2, TOP + M + 0.88·M).
  expect(comma.x).toBeCloseTo(195 - M / 2 + M / 2);
  expect(comma.y).toBeCloseTo(TOP + M + M * 0.88 - M / 2);
  // Neighbours keep the normal upright placement.
  expect(l.glyphs[2]!.x).toBeCloseTo(195 - M / 2);
  expect(l.glyphs[2]!.y).toBeCloseTo(TOP + 2 * M + M * 0.88);

  const others = layoutLine('雨。雨，雨．', base, vp, measure, AREA);
  for (const i of [1, 3, 5]) {
    expect(others.glyphs[i]!.x).toBeCloseTo(195);
    expect(others.glyphs[i]!.y).toBeCloseTo(TOP + i * M + M * 0.88 - M / 2);
  }
});

test('horizontal: punctuation is not shifted', () => {
  const l = layoutLine('雨、鼓動', horizontal, vp, measure, AREA);
  expect(l.glyphs[1]!.x).toBeCloseTo(24 + M);
  expect(l.glyphs[1]!.y).toBeCloseTo(l.glyphs[0]!.y);
});

test('horizontal: glyphs share y and advance by width, left-aligned at 24px', () => {
  const l = layoutLine('夜の底', horizontal, vp, measure, AREA);
  expect(l.columns).toBe(1);
  expect(l.glyphs.map((g) => g.x)).toEqual([0, 1, 2].map((i) => expect.closeTo(24 + i * M)));
  const baseline = TOP + (H - M) / 2 + M * 0.88;
  for (const g of l.glyphs) {
    expect(g.y).toBeCloseTo(baseline);
    expect(g.rotateDeg).toBe(0);
  }
  expect(l.bounds.x).toBeCloseTo(24);
  expect(l.bounds.y).toBeCloseTo(TOP + (H - M) / 2);
  expect(l.bounds.width).toBeCloseTo(3 * M);
  expect(l.bounds.height).toBeCloseTo(M);
});

test('the line keeps to the area it is given: below the wordmark row, above the caption row', () => {
  // The old usable area started 24px below the top inset, under the wordmark row.
  expect(TOP).toBeCloseTo(59 + 28 + 24);
  const vertical = layoutLine('夜'.repeat(30), base, vp, measure, AREA);
  const flat = layoutLine('夜'.repeat(30), horizontal, vp, measure, AREA);
  for (const { bounds } of [vertical, flat]) {
    expect(bounds.y).toBeGreaterThanOrEqual(AREA.top - 1e-6);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(AREA.bottom + 1e-6);
    expect(bounds.x).toBeGreaterThanOrEqual(AREA.left - 1e-6);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(AREA.right + 1e-6);
  }

  // A narrower area (an ornament's room): rows start at its left edge, columns
  // centre on it, and both wrap to it.
  const inner = { ...AREA, left: 36, right: 354, top: 123, bottom: AREA.bottom - 12 };
  const row = layoutLine('夜'.repeat(15), horizontal, vp, measure, inner);
  expect(row.glyphs[0]!.x).toBeCloseTo(36);
  // floor(318 / 31.2) = 10 glyphs per row.
  expect(row.glyphs[10]!.x).toBeCloseTo(36);
  const column = layoutLine('夜の底', base, vp, measure, inner);
  expect(column.bounds.y).toBeCloseTo(123);
  expect(column.bounds.x + column.bounds.width / 2).toBeCloseTo(195);
});

test('spaces consume advance but produce no glyph, and indices stay code-point indices', () => {
  const l = layoutLine(' 夜 𠮷底 ', horizontal, vp, measure, AREA);
  expect(l.glyphs.map((g) => [g.char, g.index])).toEqual([
    ['夜', 0],
    ['𠮷', 2],
    ['底', 3],
  ]);
  expect(l.glyphs.map((g) => g.x)).toEqual([24, 24 + 2 * M, 24 + 3 * M].map((x) => expect.closeTo(x)));
});

test('size xl uses 0.16 of the viewport width', () =>
  expect(layoutLine('夜', { ...base, size: 'xl' }, vp, measure, AREA).sizePx).toBeCloseTo(62.4));

test('emphasized glyphs are one size step larger and flagged', () => {
  const l = layoutLine('夜の底', { ...base, emphasis: [0] }, vp, measure, AREA);
  expect(l.glyphs[0]!.emphasized).toBe(true);
  expect(l.glyphs[0]!.sizePx).toBeCloseTo(vp.width * SIZE_RATIO.l);
  expect(l.glyphs[1]!.emphasized).toBe(false);
  expect(l.glyphs[1]!.sizePx).toBeCloseTo(M);
  // The larger glyph takes a larger cell, so the next one starts lower.
  expect(l.glyphs[1]!.y).toBeCloseTo(TOP + vp.width * SIZE_RATIO.l + M * 0.88);
});

test('emphasis on xl stays at xl', () => {
  const l = layoutLine('夜', { ...base, size: 'xl', emphasis: [0] }, vp, measure, AREA);
  expect(l.glyphs[0]!.sizePx).toBeCloseTo(62.4);
});

test('vertical: a line taller than the usable height wraps into a second column to the left', () => {
  // floor(517.56 / 31.2) = 16 glyphs per column.
  const l = layoutLine('夜'.repeat(30), base, vp, measure, AREA);
  expect(l.sizePx).toBeCloseTo(M);
  expect(l.columns).toBe(2);
  const first = l.glyphs.slice(0, 16);
  const second = l.glyphs.slice(16);
  for (const g of first) expect(g.x).toBeCloseTo(195 - M / 2);
  for (const g of second) expect(g.x).toBeCloseTo(195 - M * 1.4 - M / 2);
  expect(second).toHaveLength(14);
  expect(second[0]!.y).toBeCloseTo(TOP + M * 0.88);
  expect(l.bounds.x).toBeCloseTo(195 - M * 1.4 - M / 2);
  expect(l.bounds.width).toBeCloseTo(M * 2.4);
  expect(l.bounds.height).toBeCloseTo(16 * M);
});

test('horizontal: a line wider than width-48 wraps into a second row', () => {
  // floor(342 / 31.2) = 10 glyphs per row.
  const l = layoutLine('夜'.repeat(15), horizontal, vp, measure, AREA);
  expect(l.sizePx).toBeCloseTo(M);
  expect(l.columns).toBe(2);
  const blockTop = TOP + (H - (M + M * 1.3)) / 2;
  expect(l.glyphs[9]!.y).toBeCloseTo(blockTop + M * 0.88);
  expect(l.glyphs[10]!.x).toBeCloseTo(24);
  expect(l.glyphs[10]!.y).toBeCloseTo(blockTop + M * 0.88 + M * 1.3);
  expect(l.bounds.y).toBeCloseTo(blockTop);
  expect(l.bounds.width).toBeCloseTo(10 * M);
  expect(l.bounds.height).toBeCloseTo(M + M * 1.3);
});

test('a space that falls on a wrap is dropped instead of starting the next row', () => {
  const l = layoutLine(`${'夜'.repeat(10)} 底`, horizontal, vp, measure, AREA);
  const last = l.glyphs[10]!;
  expect(last.char).toBe('底');
  expect(last.index).toBe(11);
  expect(last.x).toBeCloseTo(24);
});

test('drops one size step when two columns still do not fit', () => {
  // m holds 32 glyphs in two columns; s (23.4px) holds floor(517.56 / 23.4) = 22 per column.
  const l = layoutLine('夜'.repeat(40), base, vp, measure, AREA);
  expect(l.sizePx).toBeCloseTo(vp.width * SIZE_RATIO.s);
  expect(l.columns).toBe(2);
  for (const g of l.glyphs) expect(g.sizePx).toBeCloseTo(vp.width * SIZE_RATIO.s);
});

test('xs is the floor: an overlong line keeps wrapping at xs', () => {
  // xs (17.55px) holds floor(517.56 / 17.55) = 29 per column.
  const l = layoutLine('夜'.repeat(200), base, vp, measure, AREA);
  expect(l.sizePx).toBeCloseTo(vp.width * SIZE_RATIO.xs);
  expect(l.columns).toBe(7);
  expect(l.glyphs).toHaveLength(200);
});

test('empty text yields no glyphs and zero bounds', () => {
  for (const text of ['', '   ']) {
    const l = layoutLine(text, base, vp, measure, AREA);
    expect(l.glyphs).toEqual([]);
    expect(l.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(l.columns).toBe(0);
  }
});
