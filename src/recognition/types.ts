import type { EarRecognition } from '../../modules/expo-musicage-ear/src/types';
import type { LyricAnchor } from '../sync/lyricClock';

export interface Track {
  trackId: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  /**
   * The track's length in ms when the recognizer knows it, else null. The
   * LRCLIB search fallback picks a candidate by length when this is set and
   * by normalised title / artist when it is not (ShazamKit reports none).
   */
  durationMs?: number | null;
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

/**
 * A confirmed track the stage cannot follow line by line: no synced lyrics
 * (plain text only, an instrumental record, or no record at all). The stage
 * shows its nameplate and answers the music instead (see LyricStage).
 */
export type UnsyncedKind = Extract<LyricResult['kind'], 'plain' | 'instrumental' | 'lyrics_unavailable'>;

export function isUnsyncedKind(kind: LyricResult['kind']): kind is UnsyncedKind {
  return kind === 'plain' || kind === 'instrumental' || kind === 'lyrics_unavailable';
}

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
    // Only when the recognizer reported one: a track without the field is
    // the same track as before this field existed.
    ...(r.durationMs !== undefined ? { durationMs: r.durationMs } : {}),
  };
}
