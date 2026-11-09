// The band meter: the stage's answer to the music when it has no lyrics to
// follow (a recognised song without synced lyrics). A row of thin printed
// rules at the foot of the print area, each standing a little taller as the
// band it listens to rises: bass at the left edge, mids in the middle, treble
// at the right, blended across the row so it reads as one spectrum, not three
// blocks. It is a mark on the print, not a flashing light: the rules are a few
// pixels wide, the row a few dozen high, and the reading follows the already
// smoothed band envelopes through a first-order follower with the beat
// pulse's own time constant, so nothing jumps.

/** Rules across the row. */
export const METER_RULE_COUNT = 24;
/** Width of one rule, px. */
export const METER_RULE_WIDTH = 2;
/** A rule's height with no sound: the row stays a printed scale in silence. */
export const METER_BASE_HEIGHT = 3;
/** A rule's height at full band energy and full shape. */
export const METER_MAX_HEIGHT = 36;
/** Ink opacity of the rules (the `rule` ornament's 0.7). */
export const METER_OPACITY = 0.7;
/**
 * Time constant of the UI-thread follower from the band envelope to the
 * drawn height: the beat engine's pulse decay (motion.ts PULSE_DECAY_MS).
 */
export const METER_TAU_MS = 120;
/** The least a rule's shape scales its band reading, so the row is not a flat block. */
export const METER_SHAPE_MIN = 0.72;

function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The band reading at position `p` across the row (0 = left, 1 = right):
 * the low band at the left edge, the mid band at the centre, the high band at
 * the right edge, linear in between.
 */
export function meterBandAt(p: number, low: number, mid: number, high: number): number {
  'worklet';
  const x = clamp01(p);
  if (x <= 0.5) {
    const t = x / 0.5;
    return low + (mid - low) * t;
  }
  const t = (x - 0.5) / 0.5;
  return mid + (high - mid) * t;
}

/**
 * A rule's fixed shape factor, METER_SHAPE_MIN..1, from its index: a
 * deterministic hash, so the row has the uneven profile of a printed scale
 * and the same rule is always the same height for the same reading.
 */
export function meterShape(index: number, count: number): number {
  'worklet';
  const x = Math.sin((index + 1) * 12.9898 + count * 78.233) * 43758.5453;
  const frac = x - Math.floor(x);
  return METER_SHAPE_MIN + (1 - METER_SHAPE_MIN) * frac;
}

/** A rule's height for a band reading 0..1 and its shape factor. */
export function meterRuleHeight(value: number, shape: number): number {
  'worklet';
  return METER_BASE_HEIGHT + (METER_MAX_HEIGHT - METER_BASE_HEIGHT) * clamp01(value) * shape;
}

/** Left edge of rule `index` in a row starting at `x` and `width` wide, rules evenly spaced edge to edge. */
export function meterRuleX(index: number, count: number, x: number, width: number): number {
  'worklet';
  if (count <= 1) return x;
  return x + ((width - METER_RULE_WIDTH) * index) / (count - 1);
}
