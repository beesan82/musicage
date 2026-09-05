import {
  AudDCalibration,
  CLIP_DURATIONS_MS,
  ClipDurationMs,
  DiagnosticInvalidReason,
  DurationEvaluation,
  SyncDiagnosticDecision,
  SyncDiagnosticSample,
} from './types';

const MINIMUM_VALID_SAMPLE_COUNT = 9;
const MINIMUM_TRACK_COUNT = 3;
const MINIMUM_POSITION_COUNT = 3;
const BASE_TOLERANCE_MS = 500;
const HARD_LIMIT_TOLERANCE_MS = 1_000;

export function isClipDurationMs(value: unknown): value is ClipDurationMs {
  return typeof value === 'number' && CLIP_DURATIONS_MS.includes(value as ClipDurationMs);
}

export function validateDiagnosticSample(
  sample: SyncDiagnosticSample,
): DiagnosticInvalidReason[] {
  const reasons: DiagnosticInvalidReason[] = [];
  const capture = sample?.capture;
  const audd = sample?.audd;
  const lrclib = sample?.lrclib;
  const groundTruth = sample?.groundTruth;

  if (sample?.schemaVersion !== 1) {
    reasons.push('invalid_schema_version');
  }

  if (!isClipDurationMs(capture?.requestedDurationMs)) {
    reasons.push('unsupported_clip_duration');
  }

  if (!isNonNegativeFinite(capture?.startedMonotonicMs)) {
    reasons.push('invalid_capture_start');
  }

  if (!isNonNegativeFinite(capture?.endedMonotonicMs)) {
    reasons.push('invalid_capture_end');
  }

  if (
    isFiniteNumber(capture?.startedMonotonicMs) &&
    isFiniteNumber(capture?.endedMonotonicMs) &&
    capture.endedMonotonicMs < capture.startedMonotonicMs
  ) {
    reasons.push('invalid_capture_range');
  }

  if (audd?.timecodeMs === null || audd?.timecodeMs === undefined) {
    reasons.push('missing_timecode');
  } else if (!isNonNegativeFinite(audd.timecodeMs)) {
    reasons.push('invalid_timecode');
  }

  if (!hasTrackIdentity(audd?.title) || !hasTrackIdentity(audd?.artist)) {
    reasons.push('missing_track');
  }

  if (
    !isFiniteNumber(lrclib?.syncedLineCount) ||
    lrclib.syncedLineCount < 1 ||
    !hasTrackIdentity(lrclib.syncedLyricsHash)
  ) {
    reasons.push('missing_synced_lyrics');
  }

  if (!groundTruth) {
    reasons.push('missing_ground_truth');
  } else {
    if (groundTruth.method !== 'video-timed-controlled-playback') {
      reasons.push('ground_truth_not_video_timed');
    }

    if (!isNonNegativeFinite(groundTruth.songPositionAtCaptureStartMs)) {
      reasons.push('invalid_ground_truth_position');
    }

    if (!isNonNegativeFinite(groundTruth.observedPrecisionMs)) {
      reasons.push('invalid_observed_precision');
    }
  }

  return reasons;
}

export function evaluateDuration(
  samples: readonly SyncDiagnosticSample[],
  clipDurationMs: ClipDurationMs,
): DurationEvaluation {
  const durationSamples = samples.filter(
    (sample) => sample?.capture?.requestedDurationMs === clipDurationMs,
  );
  const acceptedSamples = durationSamples
    .filter((sample) => validateDiagnosticSample(sample).length === 0)
    .map((sample) => ({
      sample,
      observedAnchorOffsetMs:
        (sample.audd.timecodeMs as number) -
        (sample.groundTruth?.songPositionAtCaptureStartMs as number),
    }));
  const uniqueTrackCount = new Set(
    acceptedSamples.map(({ sample }) => trackKey(sample)),
  ).size;
  const uniquePositionCount = new Set(
    acceptedSamples.map(({ sample }) => positionKey(sample)),
  ).size;

  if (
    acceptedSamples.length < MINIMUM_VALID_SAMPLE_COUNT ||
    uniqueTrackCount < MINIMUM_TRACK_COUNT ||
    uniquePositionCount < MINIMUM_POSITION_COUNT
  ) {
    return {
      clipDurationMs,
      status: 'insufficient',
      totalSampleCount: durationSamples.length,
      validSampleCount: acceptedSamples.length,
      uniqueTrackCount,
      uniquePositionCount,
      medianAnchorOffsetMs: null,
      p90AbsoluteResidualMs: null,
      maxAbsoluteResidualMs: null,
      withinToleranceCount: 0,
      hardLimitViolationCount: 0,
    };
  }

  const medianAnchorOffsetMs = median(
    acceptedSamples.map(({ observedAnchorOffsetMs }) => observedAnchorOffsetMs),
  );
  const absoluteResiduals = acceptedSamples.map(({ sample, observedAnchorOffsetMs }) => ({
    absoluteResidualMs: Math.abs(observedAnchorOffsetMs - medianAnchorOffsetMs),
    observedPrecisionMs: sample.groundTruth?.observedPrecisionMs as number,
  }));
  const withinToleranceCount = absoluteResiduals.filter(
    ({ absoluteResidualMs, observedPrecisionMs }) =>
      absoluteResidualMs <= BASE_TOLERANCE_MS + observedPrecisionMs,
  ).length;
  const hardLimitViolationCount = absoluteResiduals.filter(
    ({ absoluteResidualMs, observedPrecisionMs }) =>
      absoluteResidualMs > HARD_LIMIT_TOLERANCE_MS + observedPrecisionMs,
  ).length;
  const p90AbsoluteResidualMs = percentile90(
    absoluteResiduals.map(({ absoluteResidualMs }) => absoluteResidualMs),
  );
  const maxAbsoluteResidualMs = Math.max(
    ...absoluteResiduals.map(({ absoluteResidualMs }) => absoluteResidualMs),
  );
  const passed =
    withinToleranceCount / acceptedSamples.length >= 0.9 &&
    hardLimitViolationCount === 0;

  return {
    clipDurationMs,
    status: passed ? 'passed' : 'failed',
    totalSampleCount: durationSamples.length,
    validSampleCount: acceptedSamples.length,
    uniqueTrackCount,
    uniquePositionCount,
    medianAnchorOffsetMs,
    p90AbsoluteResidualMs,
    maxAbsoluteResidualMs,
    withinToleranceCount,
    hardLimitViolationCount,
  };
}

export function evaluateAllDurations(
  samples: readonly SyncDiagnosticSample[],
): DurationEvaluation[] {
  return CLIP_DURATIONS_MS.map((clipDurationMs) =>
    evaluateDuration(samples, clipDurationMs),
  );
}

export function selectPreferredCalibration(
  evaluations: readonly DurationEvaluation[],
): AudDCalibration | null {
  const passingEvaluation = [...evaluations]
    .filter(
      (evaluation) =>
        evaluation.status === 'passed' &&
        evaluation.medianAnchorOffsetMs !== null,
    )
    .sort((left, right) => left.clipDurationMs - right.clipDurationMs)[0];

  if (!passingEvaluation || passingEvaluation.medianAnchorOffsetMs === null) {
    return null;
  }

  return {
    schemaVersion: 1,
    clipDurationMs: passingEvaluation.clipDurationMs,
    anchorOffsetMs: passingEvaluation.medianAnchorOffsetMs,
    acceptedSampleCount: passingEvaluation.validSampleCount,
  };
}

export function deriveDecision(
  evaluations: readonly DurationEvaluation[],
): SyncDiagnosticDecision {
  const everyDurationFailed = CLIP_DURATIONS_MS.every((clipDurationMs) =>
    evaluations.some(
      (evaluation) =>
        evaluation.clipDurationMs === clipDurationMs &&
        evaluation.status === 'failed',
    ),
  );

  return everyDurationFailed ? { kind: 'rejected' } : { kind: 'undecided' };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function hasTrackIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function trackKey(sample: SyncDiagnosticSample): string {
  return `${sample.audd.title?.trim().toLowerCase()}\0${sample.audd.artist?.trim().toLowerCase()}`;
}

function positionKey(sample: SyncDiagnosticSample): number {
  return Math.round(
    (sample.groundTruth?.songPositionAtCaptureStartMs as number) / 1_000,
  );
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upperMiddle = sorted[middle]!;

  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + upperMiddle) / 2
    : upperMiddle;
}

function percentile90(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.9) - 1]!;
}
