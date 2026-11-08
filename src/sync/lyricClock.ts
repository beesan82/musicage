import type { EarRecognition } from '../../modules/expo-musicage-ear/src/types';

export interface LyricAnchor {
  offsetMs: number;
  anchoredAtMonotonicMs: number;
}

export function songPositionMs(anchor: LyricAnchor, nowMonotonicMs: number): number {
  return anchor.offsetMs + (nowMonotonicMs - anchor.anchoredAtMonotonicMs);
}

export function anchorFromRecognition(
  r: Pick<EarRecognition, 'currentOffsetMs' | 'matchedAtMonotonicMs'>,
): LyricAnchor {
  return { offsetMs: r.currentOffsetMs, anchoredAtMonotonicMs: r.matchedAtMonotonicMs };
}
