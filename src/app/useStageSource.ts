import { useEffect, useMemo, useRef, useState } from 'react';

import type { EarFeatures } from '../audio/types';
import type { ListeningStatus } from '../audio/useMicrophoneAnalysis';
import { createBeatEngine } from '../beat/beatEngine';
import type { BeatEngine, BeatState } from '../beat/types';
import { FIXTURE_LRC, FIXTURE_TRACK } from '../dev/fixture/fixtureSong';
import { fixturePositionMs } from '../dev/fixture/useFixturePlayback';
import type { FixturePlayback } from '../dev/fixture/useFixturePlayback';
import { directSongByRules } from '../direction/ruleBasedDirector';
import type { SongDirection } from '../direction/types';
import { parseLrc } from '../recognition/lrc';
import type { LyricResult } from '../recognition/types';
import { scheduleLine } from '../sync/lineScheduler';
import type { ScheduledLine } from '../sync/lineScheduler';
import type { StageSource } from '../typesetting/LyricStage';
import type { IdleTrack } from '../typesetting/idleComposition';

const SCHEDULER_INTERVAL_MS = 50;
const FIXTURE_LINES = parseLrc(FIXTURE_LRC);

export const QUIET_BEAT: BeatState = {
  bpm: null,
  confidence: 0,
  phase: 0,
  pulse: 0,
  bar: 0,
  nextBeatAtMs: null,
  energy: 0,
  silence: true,
};

interface StageSourceInput {
  ear: EarFeatures;
  status: ListeningStatus;
  playback: FixturePlayback;
  result: LyricResult | null;
}

export interface StageInputs {
  source: StageSource;
  beat: BeatState;
  nowMonotonicMs: number;
}

interface RecognizedStage {
  track: IdleTrack;
  direction: SongDirection | null;
}

function recognizedStage(result: LyricResult | null): RecognizedStage {
  if (result === null || result.kind === 'not_recognized') {
    return { track: null, direction: null };
  }
  const { title, artist } = result.track;
  return {
    track: { title, artist },
    // Only timestamped lyrics have lines to direct; the idle stage uses the
    // direction's idle glyphs and palette.
    direction:
      result.kind === 'timestamped'
        ? directSongByRules(result.lines.map((l) => l.text), `${artist}/${title}`)
        : null,
  };
}

const sameLine = (a: ScheduledLine | null, b: ScheduledLine) =>
  a !== null && a.index === b.index && a.startedAtMs === b.startedAtMs;

/**
 * Everything the lyric stage needs from the app: the beat (one engine fed by
 * the microphone's ear features), the source (fixture song while it plays,
 * else the recognized track in idle), and the `performance.now()` clock the
 * scheduled line is on. React state changes at most every ear frame (60 ms)
 * and when the scheduled line changes; per-frame motion stays in shared values.
 */
export function useStageSource({ ear, status, playback, result }: StageSourceInput): StageInputs {
  const engineRef = useRef<BeatEngine | null>(null);
  engineRef.current ??= createBeatEngine();
  const [beat, setBeat] = useState<BeatState>(QUIET_BEAT);
  const beatRef = useRef(beat);
  beatRef.current = beat;
  const [nowMonotonicMs, setNowMonotonicMs] = useState(() => performance.now());

  useEffect(() => {
    const engine = engineRef.current!;
    if (status !== 'listening') {
      engine.reset();
      setBeat(QUIET_BEAT);
      return;
    }
    setBeat(engine.push(ear));
    setNowMonotonicMs(performance.now());
  }, [ear, status]);

  const [scheduled, setScheduled] = useState<ScheduledLine | null>(null);
  const previousRef = useRef<ScheduledLine | null>(null);
  const { active, anchor, paused } = playback;

  useEffect(() => {
    if (!active) {
      previousRef.current = null;
      setScheduled(null);
      return undefined;
    }
    const tick = () => {
      const now = performance.now();
      const next = scheduleLine(
        FIXTURE_LINES,
        fixturePositionMs({ anchor, paused }, now),
        beatRef.current,
        now,
        previousRef.current,
      );
      if (sameLine(previousRef.current, next)) return;
      previousRef.current = next;
      setScheduled(next);
      setNowMonotonicMs(now);
    };
    // Tick at once so a start or a seek lands without waiting for the interval.
    tick();
    const id = setInterval(tick, SCHEDULER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, anchor, paused]);

  const recognized = useMemo(() => recognizedStage(result), [result]);
  const fixtureDirection = playback.direction;

  const source = useMemo<StageSource>(() => {
    if (active && scheduled !== null) {
      return {
        kind: 'synced',
        lines: FIXTURE_LINES,
        direction: fixtureDirection,
        scheduled,
        track: FIXTURE_TRACK,
      };
    }
    return { kind: 'idle', direction: recognized.direction, track: recognized.track };
  }, [active, fixtureDirection, recognized, scheduled]);

  return { source, beat, nowMonotonicMs };
}
