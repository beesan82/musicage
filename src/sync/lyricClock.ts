export interface LyricAnchor {
  offsetMs: number;
  anchoredAtMonotonicMs: number;
}

export function songPositionMs(anchor: LyricAnchor, nowMonotonicMs: number): number {
  return anchor.offsetMs + (nowMonotonicMs - anchor.anchoredAtMonotonicMs);
}
