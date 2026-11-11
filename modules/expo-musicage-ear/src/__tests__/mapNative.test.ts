import { mapNativeFeatures, mapNativeRecognition } from '../mapNative';

const identity = (ms: number) => ms;
test('maps features onto the JS clock and clamps to 0..1', () => {
  expect(mapNativeFeatures({ t: 1000, rms: 1.2, low: -0.1, mid: 0.5, high: 0.25 }, (ms) => ms - 400))
    .toEqual({ timestampMs: 600, rms: 1, low: 0, mid: 0.5, high: 0.25 });
});
test('drops unknown keys so no audio can ride along', () => {
  const f = mapNativeFeatures({ t: 0, rms: 0, low: 0, mid: 0, high: 0, samples: [1, 2, 3] } as never, identity);
  expect(Object.keys(f).sort()).toEqual(['high', 'low', 'mid', 'rms', 'timestampMs']);
});
test('maps a recognition and omits empty album and artwork', () => {
  expect(mapNativeRecognition({ trackId: 't1', title: 'Song', artist: 'Artist', album: '', artworkUrl: null, matchedAtNativeMs: 5000, currentOffsetMs: 12345 }, (ms) => ms - 400))
    .toEqual({ trackId: 't1', title: 'Song', artist: 'Artist', matchedAtMonotonicMs: 4600, currentOffsetMs: 12345 });
});
test('rejects an empty track id or a negative offset', () => {
  expect(mapNativeRecognition({ trackId: '', title: 'x', artist: 'y', matchedAtNativeMs: 0, currentOffsetMs: 1 }, identity)).toBeNull();
  expect(mapNativeRecognition({ trackId: 't', title: 'x', artist: 'y', matchedAtNativeMs: 0, currentOffsetMs: -1 }, identity)).toBeNull();
});
test('passes a positive finite duration through and omits any other', () => {
  const base = { trackId: 't', title: 'x', artist: 'y', matchedAtNativeMs: 0, currentOffsetMs: 1 };
  expect(mapNativeRecognition({ ...base, durationMs: 201_000 }, identity)).toMatchObject({ durationMs: 201_000 });
  for (const durationMs of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = mapNativeRecognition({ ...base, durationMs } as never, identity)!;
    expect('durationMs' in r).toBe(false);
  }
});
test('recognition exposes exactly the spec fields', () => {
  const r = mapNativeRecognition({ trackId: 't', title: 'x', artist: 'y', album: 'A', artworkUrl: 'https://img', matchedAtNativeMs: 0, currentOffsetMs: 1, raw: {} } as never, identity)!;
  expect(Object.keys(r).sort()).toEqual(['album', 'artist', 'artworkUrl', 'currentOffsetMs', 'matchedAtMonotonicMs', 'title', 'trackId']);
});
