import type { AudDCalibration } from './syncDiagnostics/types';
import type { LyricTimingStatus, TimestampedLyricResult } from './types';

export function resolveLyricTiming(
  result: TimestampedLyricResult,
  calibration: AudDCalibration | null,
): LyricTimingStatus {
  const timecodeMs = result.timingEvidence.auddTimecodeMs;
  const captureStartedMonotonicMs = result.timingEvidence.captureStartedMonotonicMs;

  if (
    calibration === null
    || calibration.clipDurationMs !== result.timingEvidence.clipDurationMs
    || !isNonNegativeFinite(timecodeMs)
    || !Number.isFinite(captureStartedMonotonicMs)
    || !Number.isFinite(calibration.anchorOffsetMs)
  ) {
    return { kind: 'unverified' };
  }

  return {
    kind: 'calibrated',
    localAnchorMonotonicMs: captureStartedMonotonicMs + calibration.anchorOffsetMs,
    auddTimecodeMs: timecodeMs,
  };
}

export function currentCalibratedSongPositionMs(
  timing: Extract<LyricTimingStatus, { kind: 'calibrated' }>,
  nowMonotonicMs: number,
): number {
  return timing.auddTimecodeMs + (nowMonotonicMs - timing.localAnchorMonotonicMs);
}

function isNonNegativeFinite(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
