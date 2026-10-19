import type { BeatState } from '../../beat/types';
import { ALIGN_WINDOW_MS, OUTRO_MS, isPastOutro, scheduleLine } from '../lineScheduler';

const LINES = [
  { startMs: 0, text: 'a' },
  { startMs: 2000, text: '' },
  { startMs: 4000, text: 'b' },
];
const noBeat: BeatState = {
  bpm: null,
  confidence: 0,
  phase: 0,
  pulse: 0,
  bar: 0,
  nextBeatAtMs: null,
  energy: 0,
  silence: false,
};
const prev0 = { index: 0, startedAtMs: 0, isEmpty: false };

test('constants', () => {
  expect(ALIGN_WINDOW_MS).toBe(80);
  expect(OUTRO_MS).toBe(15_000);
});

test('switches to the line whose startMs has passed', () => {
  const s = scheduleLine(LINES, 4100, noBeat, 5000, prev0);
  expect(s).toEqual({ index: 2, startedAtMs: 5000, isEmpty: false });
});

test('keeps the previous object when the line is unchanged', () => {
  expect(scheduleLine(LINES, 1000, noBeat, 5000, prev0)).toBe(prev0);
});

test('empty text line yields isEmpty true', () => {
  const s = scheduleLine(LINES, 2500, noBeat, 5000, prev0);
  expect(s).toEqual({ index: 1, startedAtMs: 5000, isEmpty: true });
});

test('position before the first line yields index -1', () => {
  const lines = [{ startMs: 1000, text: 'a' }];
  const s = scheduleLine(lines, 500, noBeat, 100, null);
  expect(s.index).toBe(-1);
  expect(s.isEmpty).toBe(true);
});

test('waits for a predicted beat within 80ms when confidence is high', () => {
  const beat = { ...noBeat, confidence: 0.8, nextBeatAtMs: 10_060 };
  const s = scheduleLine(LINES, 4000, beat, 10_000, { index: 0, startedAtMs: 0, isEmpty: false });
  expect(s.index).toBe(0);
  const after = scheduleLine(LINES, 4060, beat, 10_060, s);
  expect(after.index).toBe(2);
  expect(after.startedAtMs).toBe(10_060);
});

test('does not wait for a beat more than 80ms away', () => {
  const beat = { ...noBeat, confidence: 0.8, nextBeatAtMs: 10_081 };
  expect(scheduleLine(LINES, 4000, beat, 10_000, prev0).index).toBe(2);
});

test('waits for a beat exactly 80ms away', () => {
  const beat = { ...noBeat, confidence: 0.8, nextBeatAtMs: 10_080 };
  expect(scheduleLine(LINES, 4000, beat, 10_000, prev0)).toBe(prev0);
});

test('ignores beats when confidence is below 0.5', () => {
  const beat = { ...noBeat, confidence: 0.49, nextBeatAtMs: 10_050 };
  expect(scheduleLine(LINES, 4000, beat, 10_000, prev0).index).toBe(2);
});

test('does not wait for a beat that is already past', () => {
  const beat = { ...noBeat, confidence: 0.9, nextBeatAtMs: 9_990 };
  expect(scheduleLine(LINES, 4000, beat, 10_000, prev0).index).toBe(2);
});

test('rewinds to an earlier line and restarts its entrance when position jumps back', () => {
  const prev = { index: 2, startedAtMs: 10_000, isEmpty: false };
  const s = scheduleLine(LINES, 500, noBeat, 12_000, prev);
  expect(s.index).toBe(0);
  expect(s.startedAtMs).toBe(12_000);
});

test('rewind is not delayed by a nearby beat', () => {
  const beat = { ...noBeat, confidence: 0.9, nextBeatAtMs: 12_050 };
  const prev = { index: 2, startedAtMs: 10_000, isEmpty: false };
  expect(scheduleLine(LINES, 500, beat, 12_000, prev).index).toBe(0);
});

test('isPastOutro is true 15s after the last line', () => {
  expect(isPastOutro(LINES, 4000 + OUTRO_MS)).toBe(false);
  expect(isPastOutro(LINES, 4000 + OUTRO_MS + 1)).toBe(true);
  expect(isPastOutro([], 999_999)).toBe(false);
});
