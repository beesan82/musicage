import { useEffect, useMemo, useRef, useState } from 'react';

import type { EarStream } from '../audio/earStream';
import type { ListeningStatus } from '../audio/types';
import { createBeatEngine } from '../beat/beatEngine';
import { createEnergyProfile, smoothSurge } from '../beat/energyProfile';
import type { EnergyProfile } from '../beat/energyProfile';
import { SILENCE_RMS } from '../beat/types';
import type { BeatEngine, BeatState } from '../beat/types';
import { FIXTURE_LRC, FIXTURE_TRACK } from '../dev/fixture/fixtureSong';
import { fixturePositionMs } from '../dev/fixture/useFixturePlayback';
import type { FixturePlayback } from '../dev/fixture/useFixturePlayback';
import { directSongByRules } from '../direction/ruleBasedDirector';
import type { SongDirection } from '../direction/types';
import { parseLrc } from '../recognition/lrc';
import { SILENCE_REARM_MS } from '../recognition/autoRecognition';
import type { LyricLine, LyricResult } from '../recognition/types';
import { isPastOutro, scheduleLine } from '../sync/lineScheduler';
import type { ScheduledLine } from '../sync/lineScheduler';
import { songPositionMs } from '../sync/lyricClock';
import type { StageSource } from '../typesetting/LyricStage';
import type { IdleTrack } from '../typesetting/idleComposition';
import { useBeatSharedValues } from '../typesetting/useBeatSharedValues';
import type { BeatSharedValues } from '../typesetting/useBeatSharedValues';

const SCHEDULER_INTERVAL_MS = 50;
/** A steady bed publishes the beat at most this often; a new pulse head at once. */
export const BEAT_PUBLISH_MS = 60;
const FIXTURE_LINES = parseLrc(FIXTURE_LRC);

export const QUIET_BEAT: BeatState = {
  bpm: null,
  confidence: 0,
  phase: 0,
  pulse: 0,
  bar: 0,
  barConfidence: 0,
  nextBeatAtMs: null,
  energy: 0,
  silence: true,
};

export interface StageSourceInput {
  earStream: EarStream;
  status: ListeningStatus;
  playback: FixturePlayback;
  result: LyricResult | null;
}

export interface StageInputs {
  source: StageSource;
  beat: BeatState;
  /** Shared values the ear writes on every frame; the stage's worklets read these. */
  beatValues: BeatSharedValues;
  nowMonotonicMs: number;
  /** The recognized song's clock is OUTRO_MS past its last line. */
  pastOutro: boolean;
}

interface Schedule {
  line: ScheduledLine;
  pastOutro: boolean;
}

const sameLine = (a: ScheduledLine | null, b: ScheduledLine) =>
  a !== null && a.index === b.index && a.startedAtMs === b.startedAtMs;

/**
 * Everything the lyric stage needs from the app: the beat (one engine fed by
 * the ear stream), the source (the fixture song while it plays, else the
 * recognized song synced to its ShazamKit anchor, else idle), and the
 * `performance.now()` clock the scheduled line is on. Ear frames never
 * re-render on their own: the beat is published at once on a new pulse head
 * and otherwise at most every BEAT_PUBLISH_MS; per-frame motion stays in
 * shared values.
 */
export function useStageSource({
  earStream,
  status,
  playback,
  result,
}: StageSourceInput): StageInputs {
  const engineRef = useRef<BeatEngine | null>(null);
  engineRef.current ??= createBeatEngine();
  // The surge (design spec §4): the acoustic profile of the song so far, OR'd
  // with the accent line on stage, smoothed, written to `beatValues.surge`
  // on every ear frame. The accent flag is set in render and read by the ear
  // subscription; the smoother's state lives with the subscription.
  const profileRef = useRef<EnergyProfile | null>(null);
  profileRef.current ??= createEnergyProfile();
  const accentLineRef = useRef(false);
  const surgeRef = useRef({ value: 0, atMs: Number.NaN });
  const beatValues = useBeatSharedValues();
  const [beat, setBeat] = useState<BeatState>(QUIET_BEAT);
  const beatRef = useRef(beat);
  beatRef.current = beat;
  // The bar the stage last saw while there was sound. The engine's grid keeps
  // counting bars through silence, but the stage's bar freezes so the idle
  // composition holds still in a quiet room.
  const frozenBarRef = useRef(0);
  // The stage clock's anchor. Set only at mount and when the scheduled line
  // changes: every re-anchor is pinned at a later UI frame by a varying lag, so
  // re-anchoring on each ear frame would make entrances stall or skip.
  const [nowMonotonicMs, setNowMonotonicMs] = useState(() => performance.now());
  // performance.now() when the computed beat last turned silent; null while
  // there is sound (or the ear is not listening).
  const silentSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const engine = engineRef.current!;
    const profile = profileRef.current!;
    if (status !== 'listening') {
      engine.reset();
      profile.reset();
      surgeRef.current = { value: 0, atMs: Number.NaN };
      silentSinceRef.current = null;
      frozenBarRef.current = 0;
      beatValues.write(
        { timestampMs: performance.now(), rms: 0, low: 0, mid: 0, high: 0 },
        QUIET_BEAT,
      );
      beatValues.surge.value = 0;
      setBeat(QUIET_BEAT);
      return undefined;
    }
    let previous: BeatState = QUIET_BEAT;
    let publishedAtMs: number | null = null;
    // The engine only calls a quiet room silent after its hold time, so until
    // the first audible frame the beat stays silent: starting to listen in a
    // quiet room is not "sound returned" to the auto-recognition trigger.
    let heardSound = false;
    return earStream.subscribe((frame) => {
      const pushed = engine.push(frame);
      heardSound ||= frame.rms >= SILENCE_RMS;
      const raw = heardSound ? pushed : { ...pushed, silence: true };
      if (!raw.silence) {
        silentSinceRef.current = null;
        frozenBarRef.current = raw.bar;
      } else {
        silentSinceRef.current ??= performance.now();
      }
      const next = raw.silence ? { ...raw, bar: frozenBarRef.current } : raw;
      // Every frame reaches the shared values before the throttled publish:
      // worklets derive the continuous beat from them without re-rendering.
      beatValues.write(frame, next);
      // The surge: the acoustic detection (guarded inside the profile by the
      // beat confidence, the silence hold-off and the song's history) OR the
      // accent line, on a fast-in / slow-out follower.
      const acoustic = profile.push({
        timestampMs: frame.timestampMs,
        energy: next.energy,
        low: frame.low,
        confidence: next.confidence,
        silence: next.silence,
        periodMs: next.bpm === null ? null : 60_000 / next.bpm,
      });
      const target = Math.max(acoustic.strength, accentLineRef.current ? 1 : 0);
      const surge = surgeRef.current;
      const dtMs = Number.isNaN(surge.atMs) ? 0 : frame.timestampMs - surge.atMs;
      surge.value = smoothSurge(surge.value, target, dtMs);
      surge.atMs = frame.timestampMs;
      beatValues.surge.value = surge.value;
      const newPulseHead = next.pulse > previous.pulse;
      previous = next;
      if (
        newPulseHead ||
        publishedAtMs === null ||
        frame.timestampMs - publishedAtMs >= BEAT_PUBLISH_MS
      ) {
        publishedAtMs = frame.timestampMs;
        setBeat(next);
      }
    });
  }, [beatValues, earStream, status]);

  const timed = result?.kind === 'timestamped' ? result : null;
  const timedLines = timed?.lines ?? null;
  const timedAnchor = timed?.anchor ?? null;
  const timedTrackId = timed?.track.trackId ?? null;
  const named = result !== null && result.kind !== 'not_recognized' ? result.track : null;
  const title = named?.title ?? null;
  const artist = named?.artist ?? null;

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const previousRef = useRef<ScheduledLine | null>(null);
  const linesRef = useRef<readonly LyricLine[] | null>(null);
  const pastOutroRef = useRef(false);
  const { active, anchor: fixtureAnchor, paused } = playback;

  useEffect(() => {
    const lines: readonly LyricLine[] | null = active ? FIXTURE_LINES : timedLines;
    // A different song starts over; a new anchor for the same lines keeps the
    // previous line so the scheduler rewinds or advances from it at once.
    if (linesRef.current !== lines) {
      linesRef.current = lines;
      previousRef.current = null;
    }
    if (lines === null || (!active && timedAnchor === null)) {
      pastOutroRef.current = false;
      setSchedule(null);
      return undefined;
    }
    const positionAt = (now: number) =>
      active || timedAnchor === null
        ? fixturePositionMs({ anchor: fixtureAnchor, paused }, now)
        : songPositionMs(timedAnchor, now);
    // Only the recognized song's end asks for a re-recognition.
    const reportsOutro = !active;

    const tick = () => {
      const now = performance.now();
      const positionMs = positionAt(now);
      const previous = previousRef.current;
      // OUTRO_MS after the last line the stage returns to idle (index −1).
      const outro = isPastOutro(lines, positionMs);
      // A recognized song in a room silent for SILENCE_REARM_MS (the needle
      // was lifted) is no longer in sync: show the idle line until sound
      // returns, then resume from the song clock.
      const silentSince = silentSinceRef.current;
      const quiet =
        !active && silentSince !== null && now - silentSince >= SILENCE_REARM_MS;
      const next = outro || quiet
        ? previous?.index === -1 && previous.isEmpty
          ? previous
          : { index: -1, startedAtMs: now, isEmpty: true }
        : scheduleLine(lines, positionMs, beatRef.current, now, previous);
      const pastOutro = outro && reportsOutro;
      const lineChanged = !sameLine(previous, next);
      if (!lineChanged && pastOutroRef.current === pastOutro) return;
      previousRef.current = next;
      pastOutroRef.current = pastOutro;
      setSchedule({ line: next, pastOutro });
      if (lineChanged) setNowMonotonicMs(now);
    };
    // Tick at once so a start, a seek or a re-recognition lands without
    // waiting for the interval.
    tick();
    const id = setInterval(tick, SCHEDULER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, fixtureAnchor, paused, timedLines, timedAnchor]);

  // The recognition drop (design spec §7): fires once when a song is confirmed,
  // i.e. when the synced track is a new trackId. A re-anchor of the same
  // trackId (re-recognition of the same song, or the same song coming back
  // after a miss) does not fire; neither does synced → idle. The fixture
  // starting counts as a confirmation so the drop can be seen in Expo Go;
  // the fixture stopping does not.
  const [dropAtMs, setDropAtMs] = useState<number | null>(null);
  const lastRecognizedRef = useRef<string | null>(null);
  const fixtureWasActiveRef = useRef(false);
  useEffect(() => {
    const fixtureStarted = active && !fixtureWasActiveRef.current;
    fixtureWasActiveRef.current = active;
    const newSong = timedTrackId !== null && timedTrackId !== lastRecognizedRef.current;
    if (timedTrackId !== null) lastRecognizedRef.current = timedTrackId;
    if (fixtureStarted || (newSong && !active)) {
      setDropAtMs(performance.now());
      // A new song starts its energy distribution from nothing (a re-anchor
      // of the same song keeps it).
      profileRef.current?.reset();
    }
  }, [active, timedTrackId]);

  // A re-anchored result keeps its lines and track, so neither is rebuilt.
  const recognizedTrack = useMemo<IdleTrack>(
    () => (title === null || artist === null ? null : { title, artist }),
    [title, artist],
  );
  const recognizedDirection = useMemo<SongDirection | null>(
    () =>
      timedLines === null
        ? null
        : directSongByRules(
            timedLines.map((l) => l.text),
            `${artist}/${title}`,
          ),
    [timedLines, artist, title],
  );
  const fixtureDirection = playback.direction;

  const source = useMemo<StageSource>(() => {
    if (schedule !== null && active) {
      return {
        kind: 'synced',
        lines: FIXTURE_LINES,
        direction: fixtureDirection,
        scheduled: schedule.line,
        track: FIXTURE_TRACK,
        dropAtMs,
      };
    }
    if (schedule !== null && timedLines !== null && recognizedDirection !== null) {
      return {
        kind: 'synced',
        lines: timedLines,
        direction: recognizedDirection,
        scheduled: schedule.line,
        track: recognizedTrack,
        dropAtMs,
      };
    }
    return { kind: 'idle', direction: recognizedDirection, track: recognizedTrack };
  }, [active, dropAtMs, fixtureDirection, recognizedDirection, recognizedTrack, schedule, timedLines]);

  // The line on stage is chorus-like (`accent`, spec §4): the surge's lyric side.
  accentLineRef.current =
    source.kind === 'synced' &&
    !source.scheduled.isEmpty &&
    (source.direction.lines[source.scheduled.index]?.accent ?? false);

  return { source, beat, beatValues, nowMonotonicMs, pastOutro: schedule?.pastOutro ?? false };
}
