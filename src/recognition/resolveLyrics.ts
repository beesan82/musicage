import type { LrclibLyricsRecord } from './lrclibClient';
import { parseLrc } from './lrc';
import type { LyricAnchor } from '../sync/lyricClock';
import type { LyricResult, Track } from './types';

export function resolveLyrics(
  track: Track,
  record: LrclibLyricsRecord | null,
  anchor: LyricAnchor,
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
      anchor,
    };
  }

  const plain = record.plainLyrics ?? lines.map((line) => line.text).join('\n');
  const text = plain.trim();

  return text ? { kind: 'plain', track, text } : { kind: 'lyrics_unavailable', track };
}
