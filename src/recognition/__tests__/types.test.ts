import { trackFromRecognition } from '../types';

test('trackFromRecognition keeps nulls for missing album and artwork', () => {
  expect(
    trackFromRecognition({ trackId: 't', title: 'S', artist: 'A', matchedAtMonotonicMs: 0, currentOffsetMs: 0 }),
  ).toEqual({ trackId: 't', title: 'S', artist: 'A', album: null, artworkUrl: null });
});
