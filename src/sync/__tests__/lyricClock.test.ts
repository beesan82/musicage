import { songPositionMs } from '../lyricClock';

test('songPositionMs advances by the monotonic delta', () => {
  expect(songPositionMs({ offsetMs: 30_000, anchoredAtMonotonicMs: 1000 }, 2500)).toBe(31_500);
});

test('songPositionMs equals the offset at the anchor instant', () => {
  expect(songPositionMs({ offsetMs: 12_345, anchoredAtMonotonicMs: 777 }, 777)).toBe(12_345);
});
