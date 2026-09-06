export const CLIP_DURATIONS_MS = [3_000, 5_000, 7_000, 12_000] as const;

export type ClipDurationMs = (typeof CLIP_DURATIONS_MS)[number];

export type GroundTruth =
  | {
      songPositionAtCaptureStartMs: number;
      method: 'video-timed-controlled-playback';
      observedPrecisionMs: number;
    }
  | {
      songPositionAtCaptureStartMs: number;
      method: 'manual-estimate';
      observedPrecisionMs: number;
    };

export interface SyncDiagnosticSample {
  schemaVersion: 1;
  id: string;
  capture: {
    requestedDurationMs: ClipDurationMs;
    startedMonotonicMs: number;
    endedMonotonicMs: number;
  };
  audd: {
    timecodeRaw: string | null;
    timecodeMs: number | null;
    responseMonotonicMs: number | null;
    title: string | null;
    artist: string | null;
  };
  lrclib: {
    recordId: number | null;
    syncedLineCount: number;
    syncedLyricsHash: string | null;
  };
  groundTruth: GroundTruth | null;
}

export interface AudDCalibration {
  schemaVersion: 1;
  clipDurationMs: ClipDurationMs;
  anchorOffsetMs: number;
  acceptedSampleCount: number;
}

export type DiagnosticInvalidReason =
  | 'invalid_schema_version'
  | 'unsupported_clip_duration'
  | 'invalid_capture_start'
  | 'invalid_capture_end'
  | 'invalid_capture_range'
  | 'missing_timecode'
  | 'invalid_timecode'
  | 'missing_track'
  | 'missing_synced_lyrics'
  | 'missing_ground_truth'
  | 'ground_truth_not_video_timed'
  | 'invalid_ground_truth_position'
  | 'invalid_observed_precision';

export type DurationEvaluationStatus = 'insufficient' | 'failed' | 'passed';

export interface DurationEvaluation {
  clipDurationMs: ClipDurationMs;
  status: DurationEvaluationStatus;
  totalSampleCount: number;
  validSampleCount: number;
  uniqueTrackCount: number;
  uniquePositionCount: number;
  medianAnchorOffsetMs: number | null;
  p90AbsoluteResidualMs: number | null;
  maxAbsoluteResidualMs: number | null;
  withinToleranceCount: number;
  hardLimitViolationCount: number;
}

export type SyncDiagnosticDecision =
  | { kind: 'undecided' }
  | { kind: 'approved'; clipDurationMs: ClipDurationMs }
  | { kind: 'rejected' };
