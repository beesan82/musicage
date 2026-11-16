// The band meter: the stage's answer to the music when it has no lyrics to
// follow (a recognised song without synced lyrics). A row of thin printed
// rules at the foot of the print area, each standing a little taller as the
// band it listens to rises: bass at the left edge, mids in the middle, treble
// at the right, blended across the row so it reads as one spectrum, not three
// blocks. It is a mark on the print, not a flashing light: the rules are a few
// pixels wide, the row a few dozen high, and the reading follows the already
// smoothed band envelopes through a first-order follower with the beat
// pulse's own time constant, so nothing jumps. The brightness never moves at
// all (one ink, one opacity); the height is capped, and so is how far a rule
// can travel in one frame (METER_FRAME_STEP_PX). In silence the row lies at
// its base.
//
// Build 15 (design spec §9.1): the row is the `bars` pattern, and the band
// readings are scaled by the visualizer gain (VIZ_GAIN, about 2.6 × the old
// mapping) before the follower. `bars-bold`, the lyric sheet's pattern, is the
// same row with METER_BOLD_RULE_COUNT rules, a peak tick over each rule that
// falls back over METER_PEAK_FALL_MS, and on a kick the low third's ticks lit
// in the accent for the beat pulse's decay: the only flash, local to a few
// two-pixel ticks.

import { FOOT_OPACITY_MAX, vizReading, VIZ_GAIN } from '../visualizer/discipline';
import type { VisualizerBudget } from '../visualizer/discipline';

/** Rules across the row. */
export const METER_RULE_COUNT = 24;
/** Width of one rule, px. */
export const METER_RULE_WIDTH = 2;
/** A rule's height with no sound: the row stays a printed scale in silence. */
export const METER_BASE_HEIGHT = 3;
/** A rule's height at full band energy and full shape. */
export const METER_MAX_HEIGHT = 36;
/** Ink opacity of the rules (the `rule` ornament's 0.7, the foot patterns' cap). */
export const METER_OPACITY = FOOT_OPACITY_MAX;
/** Rules across the `bars-bold` row. */
export const METER_BOLD_RULE_COUNT = 48;
/** Height of a `bars-bold` peak tick, px. */
export const METER_PEAK_HEIGHT = 2;
/** Gap between a rule's top and its peak tick, px. */
export const METER_PEAK_GAP = 1;
/** A peak tick falls the rule's full reach in this long, ms. */
export const METER_PEAK_FALL_MS = 600;
/** The share of the row from the left (the low end) whose ticks a kick lights. */
export const METER_KICK_SIDE = 1 / 3;
/** The low reading (after the gain) at which a kick lights the ticks fully. */
export const METER_KICK_LOW_FULL = 0.5;
/**
 * Time constant of the UI-thread follower from the band envelope to the
 * drawn height: the beat engine's pulse decay (motion.ts PULSE_DECAY_MS).
 */
export const METER_TAU_MS = 120;
/** The least a rule's shape scales its band reading, so the row is not a flat block. */
export const METER_SHAPE_MIN = 0.72;
/**
 * The longest step the follower takes in one frame, ms. A frame that comes
 * late (a hitch, the app returning from the background) counts as this long,
 * so the rules never jump to a new height in one frame.
 */
export const METER_MAX_DT_MS = 50;
/**
 * The most a rule can move in one frame at 60 fps, px: the follower's step
 * over a full-travel change. A strobing band reading (full, nothing, full …
 * every frame) moves a rule far less, about a fifth of this (see the tests).
 */
export const METER_FRAME_STEP_PX =
  (METER_MAX_HEIGHT - METER_BASE_HEIGHT) * (1 - Math.exp(-(1000 / 60) / METER_TAU_MS));

function clamp01(v: number): number {
  'worklet';
  // NaN and ±Infinity included: a broken reading is no reading, never a stuck rule.
  if (!Number.isFinite(v)) return v === Infinity ? 1 : 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * What the follower heads for: the band envelope at the visualizer gain
 * (vizReading: 0..1, saturating), and 0 while the room is silent (`silence`
 * is the stage's 0 / 1 flag), so in a quiet room the row falls back to its
 * printed base whatever noise floor the bands read.
 */
export function meterTarget(band: number, silence: number, gain: number = VIZ_GAIN): number {
  'worklet';
  if (silence >= 0.5) return 0;
  return vizReading(band, gain);
}

/**
 * One frame of the follower from `current` toward `target` (both 0..1): a
 * first-order step with METER_TAU_MS, the frame's time capped at
 * METER_MAX_DT_MS. A reading that is not a number restarts from 0.
 */
export function meterFollow(current: number, target: number, dtMs: number): number {
  'worklet';
  const from = clamp01(current);
  const dt = dtMs > METER_MAX_DT_MS ? METER_MAX_DT_MS : dtMs > 0 ? dtMs : 0;
  if (dt <= 0) return from;
  return from + (clamp01(target) - from) * (1 - Math.exp(-dt / METER_TAU_MS));
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

/**
 * One frame of a `bars-bold` peak (in the rule's reach, value × shape, 0..1):
 * it jumps up to the rule and otherwise falls the full reach per
 * METER_PEAK_FALL_MS, never below the rule. The frame is capped like the
 * follower's.
 */
export function meterPeakFollow(peak: number, value: number, dtMs: number): number {
  'worklet';
  const v = clamp01(value);
  const p = clamp01(peak);
  const dt = dtMs > METER_MAX_DT_MS ? METER_MAX_DT_MS : dtMs > 0 ? dtMs : 0;
  const fallen = p - dt / METER_PEAK_FALL_MS;
  return v > fallen ? v : fallen;
}

/**
 * The top of a peak tick for a peak 0..1: just over the reach it marks, never
 * above the band (baseline − METER_MAX_HEIGHT).
 */
export function meterPeakTop(peak: number, baseline: number): number {
  'worklet';
  const reach = METER_BASE_HEIGHT + (METER_MAX_HEIGHT - METER_BASE_HEIGHT) * clamp01(peak);
  const top = baseline - reach - METER_PEAK_GAP - METER_PEAK_HEIGHT;
  const highest = baseline - METER_MAX_HEIGHT;
  return top < highest ? highest : top;
}

/** Whether rule `index` of `count` is on the low side a kick lights. */
export function meterKickSide(index: number, count: number): boolean {
  'worklet';
  const p = count <= 1 ? 0 : index / (count - 1);
  return p <= METER_KICK_SIDE;
}

/**
 * How brightly a kick lights the low side's ticks, 0..1: the beat pulse (its
 * own ~250 ms decay) weighted by the low reading, nothing in silence.
 */
export function meterKickFlash(pulse: number, low: number, silence: number): number {
  'worklet';
  if (silence >= 0.5) return 0;
  return clamp01(pulse) * clamp01(clamp01(low) / METER_KICK_LOW_FULL);
}

export type MeterVariant = 'bars' | 'bars-bold';

/** Rules in a row of `variant`. */
export function meterRuleCount(variant: MeterVariant): number {
  return variant === 'bars-bold' ? METER_BOLD_RULE_COUNT : METER_RULE_COUNT;
}

/**
 * The row's worst case (discipline.ts): every rule at full reach, every tick
 * drawn; a kick lights the low side's ticks, accent at the rules' opacity.
 * `bars` never flashes.
 */
export function meterBudget(variant: MeterVariant): VisualizerBudget {
  const count = meterRuleCount(variant);
  const rules = count * METER_RULE_WIDTH * METER_MAX_HEIGHT * METER_OPACITY;
  if (variant === 'bars') return { steadyInk: rules, flashArea: 0, flashInk: 0 };
  const tick = METER_RULE_WIDTH * METER_PEAK_HEIGHT;
  let lit = 0;
  for (let i = 0; i < count; i += 1) if (meterKickSide(i, count)) lit += 1;
  return {
    steadyInk: rules + count * tick * METER_OPACITY,
    flashArea: lit * tick,
    flashInk: lit * tick * METER_OPACITY,
  };
}
