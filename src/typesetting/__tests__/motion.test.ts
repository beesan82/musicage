import { ENTRANCE_DURATION_MS, entranceDone, glyphTransform, type MotionInput } from '../motion';

const base: MotionInput = {
  entrance: 'cut', hold: 'still', elapsedMs: 0, glyphIndex: 0, glyphCount: 5,
  emphasized: false, pulse: 0, phase: 0, bar: 0, confidence: 1, reducedMotion: false, seed: 1,
};
const identity = { dx: 0, dy: 0, scale: 1, opacity: 1, rotateDeg: 0 };
const at = (o: Partial<MotionInput>) => glyphTransform({ ...base, ...o });

test('cut is identity from the first frame', () => expect(glyphTransform(base)).toEqual(identity));

test('drop starts 40px above with opacity 0 and settles within 420ms', () => {
  const t0 = at({ entrance: 'drop', elapsedMs: 0 });
  expect(t0.dy).toBe(-40);
  expect(t0.opacity).toBe(0);
  const end = at({ entrance: 'drop', elapsedMs: ENTRANCE_DURATION_MS.drop });
  expect(Math.abs(end.dy)).toBeLessThan(0.01);
  expect(end.opacity).toBeCloseTo(1, 2);
  expect(at({ entrance: 'drop', elapsedMs: 5000 })).toEqual(identity);
});

test('rise starts 24px below', () => {
  const t0 = at({ entrance: 'rise', elapsedMs: 0 });
  expect(t0.dy).toBe(24);
  expect(t0.opacity).toBe(0);
  expect(at({ entrance: 'rise', elapsedMs: 420 })).toEqual(identity);
});

test('scatter staggers glyphs by 40ms: glyph 3 is still invisible at 100ms, visible at 400ms', () => {
  expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 100 }).opacity).toBe(0);
  expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 120 }).opacity).toBe(0);
  expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 400 }).opacity).toBeGreaterThan(0.5);
  const start = at({ entrance: 'scatter', glyphIndex: 2, elapsedMs: 80 });
  expect(Math.abs(start.dx)).toBeLessThanOrEqual(30);
  expect(Math.abs(start.dy)).toBeLessThanOrEqual(30);
  expect(Math.abs(start.rotateDeg)).toBeLessThanOrEqual(12);
  expect(Math.abs(start.dx) + Math.abs(start.dy)).toBeGreaterThan(0);
  expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 120 + 600 })).toEqual(identity);
});

test('trace reveals glyphs in order, 60ms each', () => {
  const op = (i: number, ms: number) => at({ entrance: 'trace', glyphIndex: i, elapsedMs: ms }).opacity;
  expect(op(0, 0)).toBe(0);
  expect(op(2, 119)).toBe(0);
  expect(op(2, 120)).toBe(0);
  expect(op(2, 180)).toBeCloseTo(0.5, 5);
  expect(op(2, 240)).toBe(1);
  expect(op(0, 60)).toBeCloseTo(0.5, 5);
});

test('fade is opacity-only', () => {
  const t = at({ entrance: 'fade', elapsedMs: 150 });
  expect(t).toEqual({ ...identity, opacity: 0.5 });
  expect(at({ entrance: 'fade', elapsedMs: 300 })).toEqual(identity);
});

test('reducedMotion returns identity regardless of elapsed', () => {
  for (const entrance of ['drop', 'rise', 'scatter', 'trace', 'fade'] as const) {
    expect(at({ entrance, elapsedMs: 0, reducedMotion: true, hold: 'pulse', pulse: 1 })).toEqual(identity);
    expect(at({ entrance, elapsedMs: 77, reducedMotion: true })).toEqual(identity);
  }
});

test('hold pulse scales by 1 + 0.04·pulse (0.08 when emphasized)', () => {
  expect(at({ hold: 'pulse', pulse: 1 }).scale).toBeCloseTo(1.04, 10);
  expect(at({ hold: 'pulse', pulse: 0.5 }).scale).toBeCloseTo(1.02, 10);
  expect(at({ hold: 'pulse', pulse: 1, emphasized: true }).scale).toBeCloseTo(1.08, 10);
});

test('hold does not apply before the entrance is done', () => {
  const t = at({ entrance: 'fade', elapsedMs: 100, hold: 'pulse', pulse: 1 });
  expect(t.scale).toBe(1);
  expect(at({ entrance: 'fade', elapsedMs: 300, hold: 'pulse', pulse: 1 }).scale).toBeCloseTo(1.04, 10);
});

test('hold shake moves at most 1.5px and only when pulse > 0.5', () => {
  expect(at({ hold: 'shake', pulse: 0.5 })).toEqual(identity);
  let moved = false;
  for (let ms = 0; ms < 2000; ms += 37) {
    const t = at({ hold: 'shake', pulse: 1, elapsedMs: ms });
    expect(Math.abs(t.dx)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(t.dy)).toBeLessThanOrEqual(1.5);
    if (t.dx !== 0 || t.dy !== 0) moved = true;
  }
  expect(moved).toBe(true);
  const a = at({ hold: 'shake', pulse: 1, elapsedMs: 100, glyphIndex: 0 });
  const b = at({ hold: 'shake', pulse: 1, elapsedMs: 100, glyphIndex: 1 });
  expect([a.dx, a.dy]).not.toEqual([b.dx, b.dy]);
});

test('hold breathe scales ±0.02 over a two-bar period', () => {
  const s = (bar: number, phase: number) => at({ hold: 'breathe', bar, phase }).scale;
  expect(s(0, 0)).toBeCloseTo(1, 10);
  expect(s(0, 0.5)).toBeCloseTo(1.02, 10);
  expect(s(1, 0)).toBeCloseTo(1, 10);
  expect(s(1, 0.5)).toBeCloseTo(0.98, 10);
  expect(s(2, 0.5)).toBeCloseTo(s(0, 0.5), 10);
  expect(s(3, 0.5)).toBeCloseTo(s(1, 0.5), 10);
});

test('hold drift moves at most 2px', () => {
  let moved = false;
  for (let ms = 0; ms < 20000; ms += 250) {
    const t = at({ hold: 'drift', elapsedMs: ms, glyphIndex: 2 });
    expect(Math.abs(t.dx)).toBeLessThanOrEqual(2);
    expect(Math.abs(t.dy)).toBeLessThanOrEqual(2);
    if (t.dx !== 0) moved = true;
  }
  expect(moved).toBe(true);
});

test('low confidence (< 0.5) damps pulse-driven motion to a quarter', () => {
  expect(at({ hold: 'pulse', pulse: 1, confidence: 0.4 }).scale).toBeCloseTo(1.01, 10);
  expect(at({ hold: 'pulse', pulse: 1, confidence: 0.5 }).scale).toBeCloseTo(1.04, 10);
  for (let ms = 0; ms < 1000; ms += 60) {
    const full = at({ hold: 'shake', pulse: 1, elapsedMs: ms });
    const low = at({ hold: 'shake', pulse: 1, elapsedMs: ms, confidence: 0.1 });
    expect(low.dx).toBeCloseTo(full.dx * 0.25, 10);
    expect(low.dy).toBeCloseTo(full.dy * 0.25, 10);
  }
});

test('entranceDone is true after duration (+ stagger for scatter/trace)', () => {
  expect(entranceDone('cut', 5, 0)).toBe(true);
  expect(entranceDone('drop', 5, 419)).toBe(false);
  expect(entranceDone('drop', 5, 420)).toBe(true);
  expect(entranceDone('fade', 5, 300)).toBe(true);
  expect(entranceDone('scatter', 5, 600 + 160 - 1)).toBe(false);
  expect(entranceDone('scatter', 5, 600 + 160)).toBe(true);
  expect(entranceDone('trace', 5, 500 + 240 - 1)).toBe(false);
  expect(entranceDone('trace', 5, 500 + 240)).toBe(true);
});
