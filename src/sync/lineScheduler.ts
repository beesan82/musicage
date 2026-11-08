import type { BeatState } from '../beat/types';
import { activeLyricIndex } from '../recognition/lrc';
import type { LyricLine } from '../recognition/types';

export const ALIGN_WINDOW_MS = 80;
/**
 * A forward switch whose next beat head is further than ALIGN_WINDOW_MS but no
 * further than this is confirmed at once and annotated with `landsAtMs`, so the
 * entrance can prepare (anticipation) and land exactly on the beat head.
 */
export const LANDING_WINDOW_MS = 250;
export const OUTRO_MS = 15_000;
const MIN_BEAT_CONFIDENCE = 0.5;

export interface ScheduledLine {
  index: number;
  startedAtMs: number;
  isEmpty: boolean;
  /**
   * Beat head this line's entrance lands on, when the line was confirmed ahead
   * of it (see LANDING_WINDOW_MS). Absent when the line starts on the lyric
   * clock as usual. The lyric timing itself never moves: only the entrance's
   * preparation is anchored here (spec section 5 keeps the ±80 ms alignment
   * idea; lookahead only ever happens at confidence >= 0.5).
   */
  landsAtMs?: number;
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
  let landsAtMs: number | undefined;
  if (isForward && beat.confidence >= MIN_BEAT_CONFIDENCE && beat.nextBeatAtMs !== null) {
    const untilBeat = beat.nextBeatAtMs - nowMonotonicMs;
    if (untilBeat > 0 && untilBeat <= ALIGN_WINDOW_MS) {
      return previous;
    }
    if (untilBeat > ALIGN_WINDOW_MS && untilBeat <= LANDING_WINDOW_MS) {
      landsAtMs = beat.nextBeatAtMs;
    }
  }

  const text = lines[index]?.text ?? '';
  return { index, startedAtMs: nowMonotonicMs, isEmpty: text.trim() === '', landsAtMs };
}

export function isPastOutro(lines: readonly LyricLine[], positionMs: number): boolean {
  const last = lines[lines.length - 1];
  return last !== undefined && positionMs > last.startMs + OUTRO_MS;
}
