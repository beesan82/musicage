import type { Palette } from './types';

// The palette's continuous change across a surge (design spec §4 and §6,
// 2026-11-07). Only the ink and the accent move; the background keeps its
// black base and mean luminance (it is never mixed).

/**
 * How far the ink moves towards the high accent at full surge. Small on
 * purpose: the ink stays the ink, with a trace of warmth in a chorus.
 */
export const INK_TINT_MAX = 0.15;

/** The colour the accent heads for in a surge: the second accent, or the accent itself. */
export function surgeHighHex(palette: Palette): string {
  'worklet';
  return palette.accentHigh ?? palette.accent;
}
