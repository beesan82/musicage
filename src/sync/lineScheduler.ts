import type { BeatState } from '../beat/types';
import { activeLyricIndex } from '../recognition/lrc';
import type { LyricLine } from '../recognition/types';

export const ALIGN_WINDOW_MS = 80;
export const OUTRO_MS = 15_000;
const MIN_BEAT_CONFIDENCE = 0.5;

export interface ScheduledLine {
  index: number;
  startedAtMs: number;
  isEmpty: boolean;
}

export function scheduleLine(
  lines: readonly LyricLine[],
  positionMs: number,
  beat: BeatState,
  nowMonotonicMs: number,
  previous: ScheduledLine | null,
): ScheduledLine {
  const index = activeLyricIndex(lines as LyricLine[], positionMs);

  if (previous !== null && previous.index === index) {
    return previous;
  }

  // Only forward switches wait for a beat; a rewind must land immediately.
  const isForward = previous !== null && index > previous.index;
  if (isForward && beat.confidence >= MIN_BEAT_CONFIDENCE && beat.nextBeatAtMs !== null) {
    const untilBeat = beat.nextBeatAtMs - nowMonotonicMs;
    if (untilBeat > 0 && untilBeat <= ALIGN_WINDOW_MS) {
      return previous;
    }
  }

  const text = lines[index]?.text ?? '';
  return { index, startedAtMs: nowMonotonicMs, isEmpty: text.trim() === '' };
}

export function isPastOutro(lines: readonly LyricLine[], positionMs: number): boolean {
  const last = lines[lines.length - 1];
  return last !== undefined && positionMs > last.startMs + OUTRO_MS;
}
