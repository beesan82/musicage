export const SILENCE_REARM_MS = 4_000;

export interface AutoRecognitionInput {
  nowMs: number;
  silence: boolean;
  pastOutro: boolean;
  hasResult: boolean;
  recognizing: boolean;
  enabled: boolean;
}

export interface AutoRecognitionTrigger {
  push(input: AutoRecognitionInput): boolean;
  reset(): void;
}

export function createAutoRecognitionTrigger(): AutoRecognitionTrigger {
  let previousSilence = true;
  let quietSinceMs: number | null = null;
  let armed = true;
  let previousPastOutro = false;

  return {
    push(input) {
      const { nowMs, silence, pastOutro, hasResult, recognizing, enabled } = input;

      if (silence) {
        if (quietSinceMs === null) quietSinceMs = nowMs;
        if (nowMs - quietSinceMs >= SILENCE_REARM_MS) armed = true;
      } else {
        quietSinceMs = null;
      }
      if (!hasResult) armed = true;

      const soundReturned = armed && previousSilence && !silence;
      const outroEdge = pastOutro && !previousPastOutro && !silence;
      const fire = enabled && !recognizing && (soundReturned || outroEdge);

      if (fire) {
        armed = false;
        quietSinceMs = null;
      }
      previousSilence = silence;
      previousPastOutro = pastOutro;
      return fire;
    },
    reset() {
      previousSilence = true;
      quietSinceMs = null;
      armed = true;
      previousPastOutro = false;
    },
  };
}
