export interface Track {
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  timecodeSeconds: number | null;
}

export interface LyricLine {
  startMs: number;
  text: string;
}

export type LyricResult =
  | {
      kind: 'synced';
      track: Track;
      lines: LyricLine[];
      positionAtCaptureMs: number;
      captureStartedMonotonicMs: number;
    }
  | { kind: 'plain'; track: Track; text: string }
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
