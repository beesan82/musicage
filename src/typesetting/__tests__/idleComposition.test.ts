import { DEFAULT_IDLE_GLYPHS } from '../../direction/types';
import { composeIdle } from '../idleComposition';
import { SIZE_RATIO } from '../layout';
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
const compose = (epoch: number, barInEpoch: number, glyphs: string = GLYPHS) =>
  composeIdle(epoch, barInEpoch, glyphs, vp, null, measure);

test('is deterministic for the same epoch and bar', () => {
  expect(compose(7, 3)).toEqual(compose(7, 3));
  expect(compose(0, 0)).toEqual(compose(0, 0));
});

test('within an epoch the layout and count are fixed; exactly one slot changes char per bar', () => {
  for (let epoch = 0; epoch < 6; epoch++) {
    const base = compose(epoch, 0).glyphs;
    for (let bar = 1; bar < 8; bar++) {
      const prev = compose(epoch, bar - 1).glyphs;
      const next = compose(epoch, bar).glyphs;
      expect(next).toHaveLength(base.length);
      next.forEach((g, slot) => {
        // Position, size and grid phase never move inside an epoch.
        expect(g.x).toBe(base[slot]!.x);
        expect(g.y).toBe(base[slot]!.y);
        expect(g.sizePx).toBe(base[slot]!.sizePx);
        expect(g.phaseOffset).toBe(base[slot]!.phaseOffset);
        expect(g.emphasized).toBe(false);
      });
      const changed = next.filter((g, slot) => g.char !== prev[slot]!.char);
      expect(changed).toHaveLength(1);
      expect(changed[0]).toBe(next[(bar - 1) % next.length]);
    }
  }
});

test('the swapped slot carries a unique index (1000 + absolute bar) so its layer key changes', () => {
  for (let epoch = 0; epoch < 4; epoch++) {
    expect(compose(epoch, 0).glyphs.every((g, slot) => g.index === slot)).toBe(true);
    for (let bar = 1; bar < 8; bar++) {
      const glyphs = compose(epoch, bar).glyphs;
      const unique = glyphs.filter((g) => g.index >= 1000);
      expect(unique).toHaveLength(1);
      expect(unique[0]!.index).toBe(1000 + epoch * 8 + bar);
      expect(unique[0]).toBe(glyphs[(bar - 1) % glyphs.length]);
      glyphs.forEach((g, slot) => {
        if (g !== unique[0]) expect(g.index).toBe(slot);
      });
    }
  }
});

test('never rotates glyphs sideways (digits and the long-vowel mark included)', () => {
  for (let epoch = 0; epoch < 8; epoch++) {
    for (let bar = 0; bar < 8; bar++) {
      for (const g of compose(epoch, bar, '').glyphs) expect(g.rotateDeg).toBe(0);
      for (const g of compose(epoch, bar).glyphs) expect(g.rotateDeg).toBe(0);
    }
  }
});

test('phaseOffset is (col + row) / 8 of the glyph grid cell', () => {
  for (let epoch = 0; epoch < 4; epoch++) {
    for (const g of compose(epoch, 0).glyphs) {
      const { col, row } = cellOf(g);
      expect(g.phaseOffset).toBe((col + row) / 8);
    }
  }
});

test('epoch 0 scatters 5-9 glyphs over distinct cells; epoch 1 aligns exactly 3 in a line', () => {
  const scattered = compose(0, 0).glyphs;
  expect(scattered.length).toBeGreaterThanOrEqual(5);
  expect(scattered.length).toBeLessThanOrEqual(9);
  const cells = scattered.map((g) => {
    const { col, row } = cellOf(g);
    expect(col).toBeGreaterThanOrEqual(0);
    expect(col).toBeLessThan(3);
    expect(row).toBeGreaterThanOrEqual(0);
    expect(row).toBeLessThan(5);
    return `${col},${row}`;
  });
  expect(new Set(cells).size).toBe(scattered.length);
  scattered.forEach((g) => {
    expect([SIZE_RATIO.s * 390, SIZE_RATIO.m * 390]).toContain(g.sizePx);
  });

  const aligned = compose(1, 0).glyphs;
  expect(aligned).toHaveLength(3);
  const alignedCells = aligned.map(cellOf);
  const sameCol = alignedCells.every((c) => c.col === alignedCells[0]!.col);
  const sameRow = alignedCells.every((c) => c.row === alignedCells[0]!.row);
  expect(sameCol || sameRow).toBe(true);
});

test('every epoch is one of the two shapes (scattered 5-9 or aligned 3)', () => {
  for (let epoch = 0; epoch < 8; epoch++) {
    const { glyphs } = compose(epoch, 0);
    if (glyphs.length === 3) {
      const cells = glyphs.map(cellOf);
      const sameCol = cells.every((c) => c.col === cells[0]!.col);
      const sameRow = cells.every((c) => c.row === cells[0]!.row);
      expect(sameCol || sameRow).toBe(true);
    } else {
      expect(glyphs.length).toBeGreaterThanOrEqual(5);
      expect(glyphs.length).toBeLessThanOrEqual(9);
    }
  }
});

test('the composition changes across epochs', () => {
  expect(compose(0, 0).glyphs).not.toEqual(compose(1, 0).glyphs);
  expect(compose(1, 0).glyphs).not.toEqual(compose(2, 0).glyphs);
});

test('uses only characters from the glyph string, also after swaps', () => {
  for (let epoch = 0; epoch < 4; epoch++) {
    for (let bar = 0; bar < 8; bar++) {
      for (const g of compose(epoch, bar).glyphs) {
        expect([...GLYPHS]).toContain(g.char);
      }
    }
  }
});

test('caption is "artist — title" bottom-left at size xs when a track is given, null otherwise', () => {
  const { caption } = composeIdle(3, 0, GLYPHS, vp, track, measure);
  expect(caption).toEqual({
    text: 'Kei — Night Drive',
    x: 24,
    y: 844 - 34 - 24,
    sizePx: SIZE_RATIO.xs * 390,
  });
  expect(compose(3, 0).caption).toBeNull();
});

test('falls back to DEFAULT_IDLE_GLYPHS when the string is empty', () => {
  for (let epoch = 0; epoch < 3; epoch++) {
    const { glyphs } = compose(epoch, 0, '');
    expect(glyphs.length).toBeGreaterThanOrEqual(3);
    for (const g of glyphs) expect([...DEFAULT_IDLE_GLYPHS]).toContain(g.char);
  }
});
