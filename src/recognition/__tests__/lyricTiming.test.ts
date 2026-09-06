import {
  currentCalibratedSongPositionMs,
  resolveLyricTiming,
} from '../lyricTiming';
import type { TimestampedLyricResult, Track } from '../types';

const track: Track = {
  title: 'Test Track',
  artist: 'Test Artist',
  album: null,
  durationSeconds: null,
  timecodeRaw: '01:23',
  timecodeMs: 83_000,
};

function resultCapturedAt(
  captureStartedMonotonicMs: number,
  clipDurationMs: 3_000 | 5_000 | 7_000 | 12_000,
  auddTimecodeMs: number | null,
): TimestampedLyricResult {
  return {
    kind: 'timestamped',
    track: { ...track, timecodeMs: auddTimecodeMs },
    lines: [{ startMs: 83_000, text: 'first real line' }],
    timingEvidence: {
      clipDurationMs,
      captureStartedMonotonicMs,
      auddTimecodeMs,
    },
  };
}

const calibrationFor12Seconds = {
  schemaVersion: 1 as const,
  clipDurationMs: 12_000 as const,
  anchorOffsetMs: 4_050,
  acceptedSampleCount: 9,
};

describe('resolveLyricTiming', () => {
  it('returns unverified without an approved matching calibration and valid timecode', () => {
    const result = resultCapturedAt(10_000, 12_000, 83_000);

    expect(resolveLyricTiming(result, null)).toEqual({ kind: 'unverified' });
    expect(resolveLyricTiming(result, {
      ...calibrationFor12Seconds,
      clipDurationMs: 7_000,
    })).toEqual({ kind: 'unverified' });
    expect(resolveLyricTiming(resultCapturedAt(10_000, 12_000, null), calibrationFor12Seconds))
      .toEqual({ kind: 'unverified' });
  });

  it('uses only the approved capture-start plus measured offset anchor equation', () => {
    const timing = resolveLyricTiming(
      resultCapturedAt(10_000, 12_000, 83_000),
      calibrationFor12Seconds,
    );

    expect(timing).toEqual({
      kind: 'calibrated',
      localAnchorMonotonicMs: 14_050,
      auddTimecodeMs: 83_000,
    });

    if (timing.kind !== 'calibrated') {
      throw new Error('Expected calibrated timing');
    }

    expect(currentCalibratedSongPositionMs(timing, 16_550)).toBe(85_500);
  });
});
