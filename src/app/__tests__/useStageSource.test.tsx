import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createEarEmitter } from '../../audio/earStream';
import type { EarEmitter } from '../../audio/earStream';
import type { EarFeatures, ListeningStatus } from '../../audio/types';
import { FIXTURE_DIRECTION, FIXTURE_LRC, FIXTURE_TRACK } from '../../dev/fixture/fixtureSong';
import type { FixturePlayback } from '../../dev/fixture/useFixturePlayback';
import { parseLrc } from '../../recognition/lrc';
import type { LyricResult, TimestampedLyricResult, Track } from '../../recognition/types';
import { QUIET_BEAT, useStageSource } from '../useStageSource';
import type { StageInputs } from '../useStageSource';

const track: Track = {
  trackId: 'shazam-1',
  title: '架空の歌',
  artist: '架空の人',
  album: null,
  artworkUrl: null,
};

const result: TimestampedLyricResult = {
  kind: 'timestamped',
  track,
  lines: [
    { startMs: 0, text: '夜の底で' },
    { startMs: 4_000, text: '走れ！' },
  ],
  anchor: { offsetMs: 1_000, anchoredAtMonotonicMs: 10_000 },
};

const noop = () => {};

const playbackOff: FixturePlayback = {
  enabled: true,
  active: false,
  paused: false,
  anchor: null,
  direction: FIXTURE_DIRECTION,
  toggle: noop,
  playPause: noop,
  seek: noop,
  reloadDirection: noop,
};

const frame = (timestampMs: number, level: number): EarFeatures => ({
  timestampMs,
  rms: level,
  low: level,
  mid: level,
  high: level,
});

interface Props {
  status: ListeningStatus;
  playback: FixturePlayback;
  result: LyricResult | null;
}

describe('useStageSource', () => {
  // Jest's fake timers break Reanimated's mocked frame-callback registry, so
  // the scheduler interval runs on real timers and only performance.now() moves.
  let clockMs = 10_000;
  let emitter: EarEmitter;
  let renders = 0;

  beforeEach(() => {
    clockMs = 10_000;
    renders = 0;
    emitter = createEarEmitter();
    jest.spyOn(performance, 'now').mockImplementation(() => clockMs);
  });
  afterEach(() => jest.restoreAllMocks());

  const setup = (initial: Partial<Props> = {}) =>
    renderHook(
      (props: Props): StageInputs => {
        renders += 1;
        return useStageSource({ earStream: emitter, ...props });
      },
      {
        initialProps: { status: 'listening', playback: playbackOff, result, ...initial } as Props,
      },
    );

  const syncedOf = (inputs: StageInputs) => {
    const { source } = inputs;
    if (source.kind !== 'synced') throw new Error(`expected a synced source, got ${source.kind}`);
    return source;
  };

  test('a timestamped result becomes a synced source positioned on the anchor', async () => {
    clockMs = 10_500; // position 1_500 ms → line 0
    const hook = await setup();
    const source = syncedOf(hook.result.current);

    expect(source.kind).toBe('synced');
    expect(source.scheduled.index).toBe(0);
    expect(source.lines).toBe(result.lines);
    expect(source.direction.lines).toHaveLength(2);
    expect(source.track).toEqual({ title: track.title, artist: track.artist });
    expect(hook.result.current.pastOutro).toBe(false);

    clockMs = 13_100; // position 4_100 ms → line 1
    await waitFor(() => expect(syncedOf(hook.result.current).scheduled.index).toBe(1));
    expect(syncedOf(hook.result.current).scheduled.startedAtMs).toBe(13_100);
    expect(hook.result.current.nowMonotonicMs).toBe(13_100);
  });

  test('a new anchor for the same lines rewinds the scheduled line at once', async () => {
    clockMs = 14_000; // position 5_000 ms → line 1
    const hook = await setup();
    expect(syncedOf(hook.result.current).scheduled.index).toBe(1);

    clockMs = 14_020;
    const rewound: LyricResult = {
      ...result,
      anchor: { offsetMs: 0, anchoredAtMonotonicMs: clockMs },
    };
    await hook.rerender({ status: 'listening', playback: playbackOff, result: rewound });

    const scheduled = syncedOf(hook.result.current).scheduled;
    expect(scheduled.index).toBe(0);
    expect(scheduled.startedAtMs).toBe(clockMs);
    expect(hook.result.current.nowMonotonicMs).toBe(clockMs);
  });

  test('past the outro the source is an idle line and pastOutro is true', async () => {
    clockMs = 10_000 + 4_000 + 15_000 + 100; // position past the last line + OUTRO_MS
    const hook = await setup();

    const scheduled = syncedOf(hook.result.current).scheduled;
    expect(scheduled.index).toBe(-1);
    expect(scheduled.isEmpty).toBe(true);
    expect(hook.result.current.pastOutro).toBe(true);

    // A re-recognition that lands back inside the song clears it.
    await hook.rerender({
      status: 'listening',
      playback: playbackOff,
      result: { ...result, anchor: { offsetMs: 500, anchoredAtMonotonicMs: clockMs } },
    });
    expect(syncedOf(hook.result.current).scheduled.index).toBe(0);
    expect(hook.result.current.pastOutro).toBe(false);
  });

  describe('when the room goes quiet (the needle is lifted)', () => {
    // One long line so the song clock alone never changes the scheduled line.
    const longSong: TimestampedLyricResult = {
      ...result,
      lines: [
        { startMs: 0, text: '夜の底で' },
        { startMs: 600_000, text: '走れ！' },
      ],
      anchor: { offsetMs: 1_000, anchoredAtMonotonicMs: 10_000 },
    };

    /** Frames every 50 ms on the mocked clock, from `fromMs` for `forMs`. */
    const emitFor = async (fromMs: number, forMs: number, level: number) => {
      for (let t = fromMs; t <= fromMs + forMs; t += 50) {
        clockMs = 10_000 + t;
        await act(async () => emitter.emit(frame(clockMs, level)));
      }
    };
    const pause = () => act(async () => new Promise((resolve) => setTimeout(resolve, 120)));

    test('4.1 s of silence turns the synced line into the idle line', async () => {
      const hook = await setup({ result: longSong });
      expect(syncedOf(hook.result.current).scheduled.index).toBe(0);

      await emitFor(0, 4_100, 0);
      await waitFor(() => expect(syncedOf(hook.result.current).scheduled.index).toBe(-1));
      expect(syncedOf(hook.result.current).scheduled.isEmpty).toBe(true);
      expect(hook.result.current.pastOutro).toBe(false);
    });

    test('3.5 s of silence keeps the line', async () => {
      const hook = await setup({ result: longSong });

      await emitFor(0, 3_500, 0);
      await pause();
      expect(syncedOf(hook.result.current).scheduled.index).toBe(0);
    });

    test('when sound returns the line comes back from the song clock', async () => {
      const hook = await setup({ result: longSong });
      await emitFor(0, 4_100, 0);
      await waitFor(() => expect(syncedOf(hook.result.current).scheduled.index).toBe(-1));

      await emitFor(4_150, 200, 0.3);
      await waitFor(() => expect(syncedOf(hook.result.current).scheduled.index).toBe(0));
      expect(hook.result.current.pastOutro).toBe(false);
    });
  });

  test('the fixture wins over a recognized song while it is active', async () => {
    clockMs = 10_500;
    const playing: FixturePlayback = {
      ...playbackOff,
      active: true,
      anchor: { offsetMs: 2_500, anchoredAtMonotonicMs: clockMs },
    };
    const hook = await setup({ playback: playing });
    const source = syncedOf(hook.result.current);

    expect(source.track).toEqual(FIXTURE_TRACK);
    expect(source.lines).toEqual(parseLrc(FIXTURE_LRC));
    expect(source.direction).toBe(FIXTURE_DIRECTION);
    expect(source.scheduled.index).toBe(0);

    // When the fixture stops the recognized song takes the stage again.
    await hook.rerender({ status: 'listening', playback: playbackOff, result });
    expect(syncedOf(hook.result.current).track).toEqual({ title: track.title, artist: track.artist });
  });

  test('a plain-lyrics result or no result is an idle source', async () => {
    const plain: LyricResult = { kind: 'plain', track, text: '夜の底で' };
    const hook = await setup({ result: plain });
    expect(hook.result.current.source).toEqual({
      kind: 'idle',
      direction: null,
      track: { title: track.title, artist: track.artist },
    });

    await hook.rerender({ status: 'listening', playback: playbackOff, result: null });
    expect(hook.result.current.source).toEqual({ kind: 'idle', direction: null, track: null });
    expect(hook.result.current.pastOutro).toBe(false);
  });

  test('ear frames drive the beat without re-rendering per frame: a hit publishes at once, a steady bed at most every 60 ms', async () => {
    const hook = await setup({ result: null });
    expect(hook.result.current.beat).toBe(QUIET_BEAT);
    const before = renders;

    for (let i = 0; i < 45; i += 1) {
      await act(async () => emitter.emit(frame(i * 20, 0.1)));
    }
    expect(renders - before).toBeLessThanOrEqual(16);
    expect(renders - before).toBeGreaterThan(0);
    expect(hook.result.current.beat.pulse).toBe(0);
    expect(hook.result.current.beat.silence).toBe(false);

    // One more bed frame publishes on the 60 ms rule (900 − 840)...
    await act(async () => emitter.emit(frame(900, 0.1)));
    const published = hook.result.current.beat;
    // ...so the hit 20 ms later is published only because it is a new pulse head.
    await act(async () => emitter.emit(frame(920, 0.9)));
    expect(hook.result.current.beat).not.toBe(published);
    expect(hook.result.current.beat.pulse).toBeGreaterThan(0.5);
  });

  test('ear frames write the shared beat values every frame, independent of the 60 ms publish', async () => {
    const hook = await setup({ result: null });
    for (let i = 0; i < 45; i += 1) {
      await act(async () => emitter.emit(frame(i * 20, 0.1)));
    }
    const published = hook.result.current.beat;
    const values = hook.result.current.beatValues;
    // The band envelopes have settled on the bed level.
    expect(values.low.value).toBeCloseTo(0.1, 5);
    expect(values.mid.value).toBeCloseTo(0.1, 5);
    expect(values.confidence.value).toBe(published.confidence);

    // 10 ms after the last frame (50 ms after the last publish): no new pulse
    // head (rms and low are flat, and mid/high never drive onsets), so the
    // React beat is not republished — but the shared values still move.
    const bandFrame: EarFeatures = { timestampMs: 890, rms: 0.1, low: 0.1, mid: 0.9, high: 0.8 };
    await act(async () => emitter.emit(bandFrame));
    expect(hook.result.current.beat).toBe(published);
    expect(values.mid.value).toBeGreaterThan(0.35);
    expect(values.high.value).toBeGreaterThan(0.3);
    expect(values.low.value).toBeCloseTo(0.1, 5);
  });

  test('the published bar freezes while the room is silent', async () => {
    const hook = await setup({ result: null });
    // A 120 BPM click train (a hit every 500 ms over a faint bed) long enough
    // for the engine to find the tempo and advance the bar.
    const run = async (fromMs: number, toMs: number, bed: number, hit: number | null) => {
      await act(async () => {
        for (let t = fromMs; t <= toMs; t += 20) {
          emitter.emit(frame(t, hit !== null && t % 500 === 0 ? hit : bed));
        }
      });
    };
    await run(0, 11_500, 0.02, 0.9);
    const barWithSound = hook.result.current.beat.bar;
    expect(barWithSound).toBeGreaterThan(0);
    expect(hook.result.current.beat.silence).toBe(false);

    // Three seconds of silence: the engine's grid keeps counting bars, but
    // the bar the stage sees must not move.
    await run(11_520, 14_500, 0, null);
    expect(hook.result.current.beat.silence).toBe(true);
    expect(hook.result.current.beat.bar).toBe(barWithSound);
  });

  test('the beat stays silent from the start of listening until the first audible frame', async () => {
    const hook = await setup({ result: null });

    for (let i = 0; i < 10; i += 1) {
      await act(async () => emitter.emit(frame(i * 20, 0)));
    }
    expect(hook.result.current.beat.silence).toBe(true);

    await act(async () => emitter.emit(frame(200, 0.3)));
    await act(async () => emitter.emit(frame(260, 0.3)));
    expect(hook.result.current.beat.silence).toBe(false);
  });

  test('a line confirmed ahead of a beat head carries landsAtMs through to the stage', async () => {
    clockMs = 10_000;
    const hook = await setup({ result: null });

    // A 120 BPM click train (a hit every 500 ms over a faint bed) on the same
    // clock as performance.now(), long enough for the engine to hold a grid.
    await act(async () => {
      for (let t = 10_000; t <= 21_500; t += 20) {
        emitter.emit(frame(t, t % 500 === 0 ? 0.9 : 0.02));
      }
    });
    const beat = hook.result.current.beat;
    expect(beat.confidence).toBeGreaterThanOrEqual(0.5);
    expect(beat.nextBeatAtMs).not.toBeNull();
    const head = beat.nextBeatAtMs!;

    // Hand over a song whose second line (position 4000) begins exactly
    // 150 ms before that predicted head: the switch moment T and the anchor
    // offset are both derived from the measured head.
    const T = head - 150;
    const landingResult: TimestampedLyricResult = {
      ...result,
      anchor: { offsetMs: 4_000 - (T - 10_000), anchoredAtMonotonicMs: 10_000 },
    };
    clockMs = 10_500; // position still before the first line
    await hook.rerender({ status: 'listening', playback: playbackOff, result: landingResult });
    expect(syncedOf(hook.result.current).scheduled.index).toBe(-1);

    clockMs = T;
    await waitFor(() => expect(syncedOf(hook.result.current).scheduled.index).toBe(1));
    const scheduled = syncedOf(hook.result.current).scheduled;
    expect(scheduled.startedAtMs).toBe(T);
    expect(scheduled.landsAtMs).toBe(head);
  });

  test('leaving listening resets to the quiet beat', async () => {
    const hook = await setup({ result: null });
    for (let i = 0; i < 45; i += 1) {
      await act(async () => emitter.emit(frame(i * 20, 0.1)));
    }
    await act(async () => emitter.emit(frame(900, 0.9)));
    expect(hook.result.current.beat.pulse).toBeGreaterThan(0.5);

    await hook.rerender({ status: 'idle', playback: playbackOff, result: null });
    expect(hook.result.current.beat).toBe(QUIET_BEAT);

    // Frames that still arrive while not listening are ignored.
    await act(async () => emitter.emit(frame(920, 0.9)));
    expect(hook.result.current.beat).toBe(QUIET_BEAT);
  });
});
