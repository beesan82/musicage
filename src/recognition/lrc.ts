import type { LyricLine } from './types';

const TIMESTAMP_PATTERN = /\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/g;
const METADATA_PATTERN = /\[[a-zA-Z][^\]]*\]/g;

interface IndexedLyricLine extends LyricLine {
  index: number;
}

function parseTimestamp(match: RegExpMatchArray): number | null {
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] ? Number(match[3].padEnd(3, '0')) : 0;

  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds >= 60) {
    return null;
  }

  return minutes * 60_000 + seconds * 1_000 + fraction;
}

export function parseLrc(source: string): LyricLine[] {
  const indexedLines: IndexedLyricLine[] = [];
  let index = 0;

  for (const rawLine of source.split(/\r?\n/)) {
    const timestamps = Array.from(rawLine.matchAll(TIMESTAMP_PATTERN));
    const text = rawLine.replace(TIMESTAMP_PATTERN, '').replace(METADATA_PATTERN, '').trim();

    for (const timestamp of timestamps) {
      const startMs = parseTimestamp(timestamp);

      if (startMs !== null) {
        indexedLines.push({ startMs, text, index });
        index += 1;
      }
    }
  }

  return indexedLines
    .sort((left, right) => left.startMs - right.startMs || left.index - right.index)
    .map(({ startMs, text }) => ({ startMs, text }));
}

export function activeLyricIndex(lines: LyricLine[], positionMs: number): number {
  let activeIndex = -1;

  for (const [index, line] of lines.entries()) {
    if (line.startMs > positionMs) {
      break;
    }

    activeIndex = index;
  }

  return activeIndex;
}
