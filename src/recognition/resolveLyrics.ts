import type { LrclibLyricsRecord } from './lrclibClient';
import { parseLrc } from './lrc';
import type {
  LyricResult,
  TimestampedLyricTimingEvidence,
  Track,
} from './types';

export function resolveLyrics(
  track: Track,
  record: LrclibLyricsRecord | null,
  timingEvidence: TimestampedLyricTimingEvidence,
): LyricResult {
  if (!record) {
    return { kind: 'lyrics_unavailable', track };
  }

  if (record.instrumental) {
    return { kind: 'instrumental', track };
  }

  const lines = parseLrc(record.syncedLyrics ?? '');

  if (lines.length > 0) {
    return {
      kind: 'timestamped',
      track,
      lines,
      timingEvidence,
    };
  }

  const plain = record.plainLyrics ?? lines.map((line) => line.text).join('\n');
  const text = plain.trim();

  return text ? { kind: 'plain', track, text } : { kind: 'lyrics_unavailable', track };
}
