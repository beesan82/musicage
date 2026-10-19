import { act, renderHook, waitFor } from '@testing-library/react-native';

import type {
  EarError,
  EarModule,
  EarRecognition,
} from '../../../modules/expo-musicage-ear/src';
import type { ListeningStatus } from '../../audio/types';
import { LrclibRequestError, lookupLrclib } from '../lrclibClient';
import { RECOGNITION_COPY } from '../recognitionCopy';
import { useEarRecognition } from '../useEarRecognition';

jest.mock('../lrclibClient', () => {
  const actual = jest.requireActual('../lrclibClient');
  return { ...actual, lookupLrclib: jest.fn() };
});

type FakeModule = { [K in keyof EarModule]: jest.Mock };

const lookup = lookupLrclib as jest.Mock;

const rec = (over: Partial<EarRecognition> = {}): EarRecognition => ({
  trackId: 't1',
  title: 'Song',
  artist: 'Artist',
  matchedAtMonotonicMs: 10_000,
  currentOffsetMs: 12_345,
  ...over,
});

describe('useEarRecognition', () => {
  let recognitionListeners: Array<(r: EarRecognition) => void>;
  let errorListeners: Array<(e: EarError) => void>;
  let fake: FakeModule;

  const emitRecognition = (r: EarRecognition) =>
    act(async () => recognitionListeners.forEach((l) => l(r)));
  const emitError = (e: EarError) => act(async () => errorListeners.forEach((l) => l(e)));

  const setup = (status: ListeningStatus = 'listening') =>
    renderHook(
      ({ s }: { s: ListeningStatus }) => useEarRecognition(fake as unknown as EarModule, s),
      { initialProps: { s: status } },
    );

  beforeEach(() => {
    recognitionListeners = [];
    errorListeners = [];
    lookup.mockReset();
    lookup.mockResolvedValue({
      recordId: 1,
      instrumental: false,
      syncedLyrics: '[00:12.00] first line',
      plainLyrics: null,
    });
    fake = {
      now: jest.fn(() => 0),
      startListening: jest.fn().mockResolvedValue(undefined),
      stopListening: jest.fn().mockResolvedValue(undefined),
      listenForMatch: jest.fn().mockResolvedValue(undefined),
      cancelMatch: jest.fn().mockResolvedValue(undefined),
      addFeaturesListener: jest.fn(() => ({ remove: jest.fn() })),
      addRecognitionListener: jest.fn((l) => {
        recognitionListeners.push(l);
        return { remove: jest.fn() };
      }),
      addErrorListener: jest.fn((l) => {
        errorListeners.push(l);
        return { remove: jest.fn() };
      }),
    };
  });

  test('is unavailable without a recognizer', async () => {
    const { result } = await renderHook(() => useEarRecognition(null, 'listening'));
    expect(result.current.state).toEqual({
      phase: 'unavailable',
      result: null,
      message: RECOGNITION_COPY.unavailable,
      retryable: false,
    });
  });

  test('recognize starts a 20 s match and enters listening', async () => {
    const { result } = await setup();
    await act(async () => result.current.recognize());
    expect(fake.listenForMatch).toHaveBeenCalledWith(20_000);
    expect(result.current.state.phase).toBe('listening');
  });

  test('a match resolves LRCLIB lyrics into a timestamped result anchored on the match', async () => {
    const { result } = await setup();
    await act(async () => result.current.recognize());
    await emitRecognition(rec());
    await waitFor(() => expect(result.current.state.phase).toBe('idle'));
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Song', artist: 'Artist' }),
      undefined,
      expect.anything(),
    );
    expect(result.current.state.result).toEqual({
      kind: 'timestamped',
      track: { trackId: 't1', title: 'Song', artist: 'Artist', album: null, artworkUrl: null },
      lines: [{ startMs: 12_000, text: 'first line' }],
      anchor: { offsetMs: 12_345, anchoredAtMonotonicMs: 10_000 },
    });
  });

  test('the same track matched again only moves the anchor and skips LRCLIB', async () => {
    const { result } = await setup();
    await act(async () => result.current.recognize());
    await emitRecognition(rec());
    await waitFor(() => expect(result.current.state.phase).toBe('idle'));
    await act(async () => result.current.recognize());
    await emitRecognition(rec({ matchedAtMonotonicMs: 50_000, currentOffsetMs: 40_000 }));
    await waitFor(() => expect(result.current.state.phase).toBe('idle'));
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(result.current.state.result).toMatchObject({
      kind: 'timestamped',
      anchor: { offsetMs: 40_000, anchoredAtMonotonicMs: 50_000 },
    });
  });

  test('match_timeout keeps the previous result, sets the copy and makes retry possible', async () => {
    const { result } = await setup();
    await act(async () => result.current.recognize());
    await emitRecognition(rec());
    await waitFor(() => expect(result.current.state.phase).toBe('idle'));
    const previous = result.current.state.result;
    await act(async () => result.current.recognize());
    await emitError({ code: 'match_timeout' });
    expect(result.current.state).toEqual({
      phase: 'idle',
      result: previous,
      message: RECOGNITION_COPY.match_timeout,
      retryable: true,
    });
  });

  test('match_failed and invalid_match use their copy', async () => {
    const { result } = await setup();
    await act(async () => result.current.recognize());
    await emitError({ code: 'match_failed' });
    expect(result.current.state.message).toBe(RECOGNITION_COPY.match_failed);
    await act(async () => result.current.recognize());
    await emitError({ code: 'invalid_match' });
    expect(result.current.state.message).toBe(RECOGNITION_COPY.invalid_match);
  });

  test('a match after cancel is ignored', async () => {
    const { result } = await setup();
    await act(async () => result.current.recognize());
    await act(async () => result.current.cancel());
    expect(fake.cancelMatch).toHaveBeenCalled();
    await emitRecognition(rec());
    expect(lookup).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('idle');
  });

  test('a match after the ear left listening is ignored', async () => {
    const { result, rerender } = await setup();
    await act(async () => result.current.recognize());
    await rerender({ s: 'idle' });
    expect(fake.cancelMatch).toHaveBeenCalled();
    await emitRecognition(rec());
    expect(lookup).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('idle');
  });

  test('an LRCLIB failure keeps the track as lyrics_unavailable with the lyrics_failed copy', async () => {
    lookup.mockRejectedValue(new LrclibRequestError('network'));
    const { result } = await setup();
    await act(async () => result.current.recognize());
    await emitRecognition(rec());
    await waitFor(() => expect(result.current.state.phase).toBe('idle'));
    expect(result.current.state.result).toEqual({
      kind: 'lyrics_unavailable',
      track: { trackId: 't1', title: 'Song', artist: 'Artist', album: null, artworkUrl: null },
    });
    expect(result.current.state.message).toBe(RECOGNITION_COPY.lyrics_failed);
    expect(result.current.state.retryable).toBe(true);
  });

  test('recognize while listening is a no-op', async () => {
    const { result } = await setup();
    await act(async () => result.current.recognize());
    await act(async () => result.current.recognize());
    expect(fake.listenForMatch).toHaveBeenCalledTimes(1);
  });

  test('unmount cancels the native match', async () => {
    const { result, unmount } = await setup();
    await act(async () => result.current.recognize());
    await unmount();
    expect(fake.cancelMatch).toHaveBeenCalled();
  });

  test('a rejected listenForMatch returns to idle with match_failed and allows retry', async () => {
    fake.listenForMatch.mockRejectedValueOnce(new Error('native'));
    const { result } = await setup();
    await act(async () => result.current.recognize());
    expect(result.current.state).toEqual({
      phase: 'idle',
      result: null,
      message: RECOGNITION_COPY.match_failed,
      retryable: true,
    });
    await act(async () => result.current.recognize());
    expect(fake.listenForMatch).toHaveBeenCalledTimes(2);
    expect(result.current.state.phase).toBe('listening');
  });

  test('cancel during resolving_lyrics aborts the lookup and ignores its late result', async () => {
    let resolveLookup: (v: unknown) => void = () => undefined;
    lookup.mockReturnValue(new Promise((r) => (resolveLookup = r)));
    const { result } = await setup();
    await act(async () => result.current.recognize());
    await emitRecognition(rec());
    expect(result.current.state.phase).toBe('resolving_lyrics');
    const signal = lookup.mock.calls[0][2] as AbortSignal;
    await act(async () => result.current.cancel());
    expect(signal.aborted).toBe(true);
    expect(result.current.state.phase).toBe('idle');
    await act(async () =>
      resolveLookup({ recordId: 1, instrumental: false, syncedLyrics: '[00:12.00] x', plainLyrics: null }),
    );
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.result).toBeNull();
    await act(async () => result.current.recognize());
    expect(fake.listenForMatch).toHaveBeenCalledTimes(2);
    expect(result.current.state.phase).toBe('listening');
  });
});
