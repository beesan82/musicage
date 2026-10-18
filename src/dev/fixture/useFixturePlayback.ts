import { useCallback, useState } from 'react';

import { validateSongDirection } from '../../direction/validateDirection';
import type { SongDirection } from '../../direction/types';
import { parseLrc } from '../../recognition/lrc';
import { songPositionMs } from '../../sync/lyricClock';
import type { LyricAnchor } from '../../sync/lyricClock';
import { FIXTURE_DIRECTION, FIXTURE_LRC } from './fixtureSong';

export interface FixturePlayback {
  /** False outside development builds: the fixture is never driven. */
  enabled: boolean;
  active: boolean;
  /** While paused, consumers must freeze at `anchor.offsetMs`. */
  paused: boolean;
  anchor: LyricAnchor | null;
  direction: SongDirection;
  toggle(): void;
  playPause(): void;
  seek(deltaMs: number): void;
  reloadDirection(): void;
}

interface Transport {
  active: boolean;
  paused: boolean;
  anchor: LyricAnchor | null;
}

const OFF: Transport = { active: false, paused: false, anchor: null };
const noop = () => {};
const FIXTURE_TEXTS = parseLrc(FIXTURE_LRC).map((l) => l.text);

/** Position of the fixture song, frozen while paused. */
export function fixturePositionMs(
  playback: Pick<FixturePlayback, 'anchor' | 'paused'>,
  nowMonotonicMs: number,
): number {
  if (playback.anchor === null) return 0;
  return playback.paused
    ? playback.anchor.offsetMs
    : songPositionMs(playback.anchor, nowMonotonicMs);
}

export function useFixturePlayback(enabled: boolean = __DEV__): FixturePlayback {
  const [transport, setTransport] = useState<Transport>(OFF);
  const [direction, setDirection] = useState<SongDirection>(FIXTURE_DIRECTION);

  const toggle = useCallback(() => {
    setTransport((t) =>
      t.active
        ? OFF
        : {
            active: true,
            paused: false,
            anchor: { offsetMs: 0, anchoredAtMonotonicMs: performance.now() },
          },
    );
  }, []);

  const playPause = useCallback(() => {
    setTransport((t) => {
      if (!t.active || t.anchor === null) return t;
      const now = performance.now();
      return {
        ...t,
        paused: !t.paused,
        anchor: { offsetMs: fixturePositionMs(t, now), anchoredAtMonotonicMs: now },
      };
    });
  }, []);

  const seek = useCallback((deltaMs: number) => {
    setTransport((t) => {
      if (!t.active || t.anchor === null) return t;
      const now = performance.now();
      return {
        ...t,
        anchor: {
          offsetMs: Math.max(0, fixturePositionMs(t, now) + deltaMs),
          anchoredAtMonotonicMs: now,
        },
      };
    });
  }, []);

  const reloadDirection = useCallback(() => {
    const validated = validateSongDirection(FIXTURE_DIRECTION, FIXTURE_TEXTS);
    if (validated !== null) setDirection(validated);
  }, []);

  if (!enabled) {
    return {
      enabled: false,
      active: false,
      paused: false,
      anchor: null,
      direction: FIXTURE_DIRECTION,
      toggle: noop,
      playPause: noop,
      seek: noop,
      reloadDirection: noop,
    };
  }

  return { enabled: true, ...transport, direction, toggle, playPause, seek, reloadDirection };
}
