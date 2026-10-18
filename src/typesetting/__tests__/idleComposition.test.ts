import { DEFAULT_IDLE_GLYPHS } from '../../direction/types';
import { composeIdle } from '../idleComposition';
import { ROTATED_IN_VERTICAL, SIZE_RATIO } from '../layout';
import type { GlyphMeasure } from '../layout';

const vp = { width: 390, height: 844, insetTop: 59, insetBottom: 34 };
const measure: GlyphMeasure = (_ch, size) => ({ advance: size, ascent: -size * 0.88, descent: size * 0.12 });
const GLYPHS = 'ABC一二三四五六七八九十';
const track = { title: 'Night Drive', artist: 'Kei' };

// usable area: x 24..366, y 83..787 (insets + 24 margin); 3 columns x 5 rows.
const cellOf = (g: { x: number; y: number; sizePx: number }) => {
  const cx = g.x + g.sizePx / 2;
  const cy = g.y - g.sizePx * 0.35;
  return { col: Math.floor((cx - 24) / ((390 - 48) / 3)), row: Math.floor((cy - 83) / (703 / 5)) };
};

test('is deterministic for the same bar', () => {
  expect(composeIdle(7, GLYPHS, vp, track, measure)).toEqual(composeIdle(7, GLYPHS, vp, track, measure));
});

test('changes between consecutive bars', () => {
  for (let bar = 0; bar < 60; bar++) {
    const a = composeIdle(bar, GLYPHS, vp, null, measure).glyphs;
    const b = composeIdle(bar + 1, GLYPHS, vp, null, measure).glyphs;
    expect(a).not.toEqual(b);
  }
});

test('places between 5 and 9 glyphs on a 3x5 grid, no two in the same cell', () => {
  const counts = new Set<number>();
  for (let bar = 0; bar < 60; bar++) {
    const { glyphs } = composeIdle(bar, GLYPHS, vp, null, measure);
    counts.add(glyphs.length);
    expect(glyphs.length).toBeGreaterThanOrEqual(5);
    expect(glyphs.length).toBeLessThanOrEqual(9);
    const cells = glyphs.map((g) => {
      const { col, row } = cellOf(g);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(3);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(5);
      return `${col},${row}`;
    });
    expect(new Set(cells).size).toBe(glyphs.length);
    glyphs.forEach((g, i) => {
      expect(g.index).toBe(i);
      expect(g.emphasized).toBe(false);
      expect([SIZE_RATIO.s * 390, SIZE_RATIO.m * 390]).toContain(g.sizePx);
      expect(g.rotateDeg).toBe(ROTATED_IN_VERTICAL.test(g.char) ? 90 : 0);
    });
  }
  expect(counts.size).toBeGreaterThan(1);
});

test('uses only characters from the glyph string', () => {
  for (let bar = 0; bar < 30; bar++) {
    for (const g of composeIdle(bar, GLYPHS, vp, null, measure).glyphs) {
      expect([...GLYPHS]).toContain(g.char);
    }
  }
});

test('caption is "artist — title" bottom-left at size xs when a track is given, null otherwise', () => {
  const { caption } = composeIdle(3, GLYPHS, vp, track, measure);
  expect(caption).toEqual({
    text: 'Kei — Night Drive',
    x: 24,
    y: 844 - 34 - 24,
    sizePx: SIZE_RATIO.xs * 390,
  });
  expect(composeIdle(3, GLYPHS, vp, null, measure).caption).toBeNull();
});

test('falls back to DEFAULT_IDLE_GLYPHS when the string is empty', () => {
  for (let bar = 0; bar < 10; bar++) {
    const { glyphs } = composeIdle(bar, '', vp, null, measure);
    expect(glyphs.length).toBeGreaterThanOrEqual(5);
    for (const g of glyphs) expect([...DEFAULT_IDLE_GLYPHS]).toContain(g.char);
  }
});
