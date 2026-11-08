import type { EarRecognition } from '../../modules/expo-musicage-ear/src/types';
import type { LyricAnchor } from '../sync/lyricClock';

export interface Track {
  trackId: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
}

export interface LyricLine {
  startMs: number;
  text: string;
}

export interface TimestampedLyricResult {
  kind: 'timestamped';
  track: Track;
  lines: LyricLine[];
  anchor: LyricAnchor;
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
  | 'listening'
  | 'resolving_lyrics'
  | 'error'
  | 'unavailable';

export interface RecognitionViewState {
  phase: RecognitionPhase;
  result: LyricResult | null;
  message: string | null;
  retryable: boolean;
}

export function trackFromRecognition(r: EarRecognition): Track {
  return {
    trackId: r.trackId,
    title: r.title,
    artist: r.artist,
    album: r.album ?? null,
    artworkUrl: r.artworkUrl ?? null,
  };
}
