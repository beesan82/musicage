import type { LineDirection } from '../../direction/types';
import { layoutLine, ROTATED_IN_VERTICAL, SIZE_RATIO } from '../layout';
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

// size m: 390 · 0.08; usable area top = 59 + 24, usable height = 844 − 59 − 34 − 48 = 703.
const M = 31.2;
const TOP = 83;

test('vertical: glyphs share x and descend by advance, centered horizontally', () => {
  const l = layoutLine('夜の底', base, vp, measure);
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
  const l = layoutLine('東京ーA1（夜）', base, vp, measure);
  expect(l.glyphs.map((g) => g.rotateDeg)).toEqual([0, 0, 90, 90, 90, 90, 0, 90]);
  expect(ROTATED_IN_VERTICAL.test('東')).toBe(false);
});

test('vertical: a rotated glyph origin is centred on the column and starts at its cell top', () => {
  const l = layoutLine('夜A', base, vp, measure);
  const a = l.glyphs[1]!;
  // Rotated 90° clockwise about its origin, the ascent points right and the descent left.
  expect(a.x).toBeCloseTo(195 - (M * 0.88 - M * 0.12) / 2);
  expect(a.y).toBeCloseTo(TOP + M);
});

test('horizontal: glyphs share y and advance by width, left-aligned at 24px', () => {
  const l = layoutLine('夜の底', horizontal, vp, measure);
  expect(l.columns).toBe(1);
  expect(l.glyphs.map((g) => g.x)).toEqual([0, 1, 2].map((i) => expect.closeTo(24 + i * M)));
  const baseline = TOP + (703 - M) / 2 + M * 0.88;
  for (const g of l.glyphs) {
    expect(g.y).toBeCloseTo(baseline);
    expect(g.rotateDeg).toBe(0);
  }
  expect(l.bounds.x).toBeCloseTo(24);
  expect(l.bounds.y).toBeCloseTo(TOP + (703 - M) / 2);
  expect(l.bounds.width).toBeCloseTo(3 * M);
  expect(l.bounds.height).toBeCloseTo(M);
});

test('spaces consume advance but produce no glyph, and indices stay code-point indices', () => {
  const l = layoutLine(' 夜 𠮷底 ', horizontal, vp, measure);
  expect(l.glyphs.map((g) => [g.char, g.index])).toEqual([
    ['夜', 0],
    ['𠮷', 2],
    ['底', 3],
  ]);
  expect(l.glyphs.map((g) => g.x)).toEqual([24, 24 + 2 * M, 24 + 3 * M].map((x) => expect.closeTo(x)));
});

test('size xl uses 0.16 of the viewport width', () =>
  expect(layoutLine('夜', { ...base, size: 'xl' }, vp, measure).sizePx).toBeCloseTo(62.4));

test('emphasized glyphs are one size step larger and flagged', () => {
  const l = layoutLine('夜の底', { ...base, emphasis: [0] }, vp, measure);
  expect(l.glyphs[0]!.emphasized).toBe(true);
  expect(l.glyphs[0]!.sizePx).toBeCloseTo(vp.width * SIZE_RATIO.l);
  expect(l.glyphs[1]!.emphasized).toBe(false);
  expect(l.glyphs[1]!.sizePx).toBeCloseTo(M);
  // The larger glyph takes a larger cell, so the next one starts lower.
  expect(l.glyphs[1]!.y).toBeCloseTo(TOP + vp.width * SIZE_RATIO.l + M * 0.88);
});

test('emphasis on xl stays at xl', () => {
  const l = layoutLine('夜', { ...base, size: 'xl', emphasis: [0] }, vp, measure);
  expect(l.glyphs[0]!.sizePx).toBeCloseTo(62.4);
});

test('vertical: a line taller than the usable height wraps into a second column to the left', () => {
  // floor(703 / 31.2) = 22 glyphs per column.
  const l = layoutLine('夜'.repeat(30), base, vp, measure);
  expect(l.sizePx).toBeCloseTo(M);
  expect(l.columns).toBe(2);
  const first = l.glyphs.slice(0, 22);
  const second = l.glyphs.slice(22);
  for (const g of first) expect(g.x).toBeCloseTo(195 - M / 2);
  for (const g of second) expect(g.x).toBeCloseTo(195 - M * 1.4 - M / 2);
  expect(second).toHaveLength(8);
  expect(second[0]!.y).toBeCloseTo(TOP + M * 0.88);
  expect(l.bounds.x).toBeCloseTo(195 - M * 1.4 - M / 2);
  expect(l.bounds.width).toBeCloseTo(M * 2.4);
  expect(l.bounds.height).toBeCloseTo(22 * M);
});

test('horizontal: a line wider than width-48 wraps into a second row', () => {
  // floor(342 / 31.2) = 10 glyphs per row.
  const l = layoutLine('夜'.repeat(15), horizontal, vp, measure);
  expect(l.sizePx).toBeCloseTo(M);
  expect(l.columns).toBe(2);
  const blockTop = TOP + (703 - (M + M * 1.3)) / 2;
  expect(l.glyphs[9]!.y).toBeCloseTo(blockTop + M * 0.88);
  expect(l.glyphs[10]!.x).toBeCloseTo(24);
  expect(l.glyphs[10]!.y).toBeCloseTo(blockTop + M * 0.88 + M * 1.3);
  expect(l.bounds.y).toBeCloseTo(blockTop);
  expect(l.bounds.width).toBeCloseTo(10 * M);
  expect(l.bounds.height).toBeCloseTo(M + M * 1.3);
});

test('a space that falls on a wrap is dropped instead of starting the next row', () => {
  const l = layoutLine(`${'夜'.repeat(10)} 底`, horizontal, vp, measure);
  const last = l.glyphs[10]!;
  expect(last.char).toBe('底');
  expect(last.index).toBe(11);
  expect(last.x).toBeCloseTo(24);
});

test('drops one size step when two columns still do not fit', () => {
  // m holds 44 glyphs in two columns; s (23.4px) holds floor(703 / 23.4) = 30 per column.
  const l = layoutLine('夜'.repeat(50), base, vp, measure);
  expect(l.sizePx).toBeCloseTo(vp.width * SIZE_RATIO.s);
  expect(l.columns).toBe(2);
  for (const g of l.glyphs) expect(g.sizePx).toBeCloseTo(vp.width * SIZE_RATIO.s);
});

test('xs is the floor: an overlong line keeps wrapping at xs', () => {
  // xs (17.55px) holds floor(703 / 17.55) = 40 per column.
  const l = layoutLine('夜'.repeat(200), base, vp, measure);
  expect(l.sizePx).toBeCloseTo(vp.width * SIZE_RATIO.xs);
  expect(l.columns).toBe(5);
  expect(l.glyphs).toHaveLength(200);
});

test('empty text yields no glyphs and zero bounds', () => {
  for (const text of ['', '   ']) {
    const l = layoutLine(text, base, vp, measure);
    expect(l.glyphs).toEqual([]);
    expect(l.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(l.columns).toBe(0);
  }
});
