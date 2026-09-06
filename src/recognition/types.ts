import type { ClipDurationMs } from './syncDiagnostics/types';

export interface Track {
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  timecodeRaw: string | null;
  timecodeMs: number | null;
}

export interface LyricLine {
  startMs: number;
  text: string;
}

export interface TimestampedLyricTimingEvidence {
  clipDurationMs: ClipDurationMs;
  captureStartedMonotonicMs: number;
  auddTimecodeMs: number | null;
}

export interface TimestampedLyricResult {
  kind: 'timestamped';
  track: Track;
  lines: LyricLine[];
  timingEvidence: TimestampedLyricTimingEvidence;
}

export type LyricResult =
  | TimestampedLyricResult
  | {
      kind: 'plain';
      track: Track;
      text: string;
    }
  | { kind: 'instrumental'; track: Track }
  | { kind: 'lyrics_unavailable'; track: Track }
  | { kind: 'not_recognized' };

export type RecognitionPhase =
  | 'idle'
  | 'setup_required'
  | 'capturing'
  | 'identifying'
  | 'resolving_lyrics'
  | 'error';

export interface RecognitionViewState {
  phase: RecognitionPhase;
  result: LyricResult | null;
  message: string | null;
  retryable: boolean;
}
