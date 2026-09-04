import type { LrclibLyricsRecord } from './lrclibClient';
import { parseLrc } from './lrc';
import type { LyricResult, Track } from './types';

export function resolveLyrics(
  track: Track,
  record: LrclibLyricsRecord | null,
  captureStartedMonotonicMs: number,
): LyricResult {
  if (!record) {
    return { kind: 'lyrics_unavailable', track };
  }

  if (record.instrumental) {
    return { kind: 'instrumental', track };
  }

  const lines = parseLrc(record.syncedLyrics ?? '');

  if (track.timecodeSeconds !== null && lines.length > 0) {
    return {
      kind: 'synced',
      track,
      lines,
      positionAtCaptureMs: Math.round(track.timecodeSeconds * 1_000),
      captureStartedMonotonicMs,
    };
  }

  const plain = record.plainLyrics ?? lines.map((line) => line.text).join('\n');
  const text = plain.trim();

  return text ? { kind: 'plain', track, text } : { kind: 'lyrics_unavailable', track };
}
