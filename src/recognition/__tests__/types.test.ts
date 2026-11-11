import { isUnsyncedKind, trackFromRecognition } from '../types';
import type { LyricResult } from '../types';

test('trackFromRecognition keeps nulls for missing album and artwork, and no duration field without one', () => {
  const track = trackFromRecognition({
    trackId: 't',
    title: 'S',
    artist: 'A',
    matchedAtMonotonicMs: 0,
    currentOffsetMs: 0,
  });
  expect(track).toEqual({ trackId: 't', title: 'S', artist: 'A', album: null, artworkUrl: null });
  expect('durationMs' in track).toBe(false);
});

test('trackFromRecognition carries a reported duration through for the lyrics lookup', () => {
  expect(
    trackFromRecognition({
      trackId: 't',
      title: 'S',
      artist: 'A',
      matchedAtMonotonicMs: 0,
      currentOffsetMs: 0,
      durationMs: 201_000,
    }),
  ).toMatchObject({ durationMs: 201_000 });
});

test('isUnsyncedKind names the confirmed-track results the stage cannot follow', () => {
  const kinds: LyricResult['kind'][] = ['timestamped', 'plain', 'instrumental', 'lyrics_unavailable', 'not_recognized'];
  expect(kinds.filter(isUnsyncedKind)).toEqual(['plain', 'instrumental', 'lyrics_unavailable']);
});
