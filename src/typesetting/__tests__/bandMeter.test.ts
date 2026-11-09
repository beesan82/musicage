import {
  METER_BASE_HEIGHT,
  METER_FRAME_STEP_PX,
  METER_MAX_DT_MS,
  METER_MAX_HEIGHT,
  METER_OPACITY,
  METER_RULE_COUNT,
  METER_RULE_WIDTH,
  METER_SHAPE_MIN,
  METER_TAU_MS,
  meterBandAt,
  meterFollow,
  meterRuleHeight,
  meterRuleX,
  meterShape,
  meterTarget,
} from '../bandMeter';

const FRAME_MS = 1000 / 60;
const TRAVEL = METER_MAX_HEIGHT - METER_BASE_HEIGHT;

/** Runs the follower over `targets`, one per frame of `dtMs`, from `start`; returns the reading after each frame. */
function run(targets: number[], dtMs = FRAME_MS, start = 0): number[] {
  const out: number[] = [];
  let value = start;
  for (const target of targets) {
    value = meterFollow(value, target, dtMs);
    out.push(value);
  }
  return out;
}

/** The largest frame-to-frame change of a full-shape rule, px. */
function largestStepPx(readings: number[], from = 0): number {
  let largest = 0;
  let previous = meterRuleHeight(from, 1);
  for (const r of readings) {
    const h = meterRuleHeight(r, 1);
    largest = Math.max(largest, Math.abs(h - previous));
    previous = h;
  }
  return largest;
}

describe('the band meter is a printed mark, not a light', () => {
  test('a few dozen thin rules, a few dozen pixels tall at most, in the rule ornament’s ink opacity', () => {
    expect(METER_RULE_COUNT).toBe(24);
    expect(METER_RULE_WIDTH).toBe(2);
    expect(METER_BASE_HEIGHT).toBe(3);
    expect(METER_MAX_HEIGHT).toBe(36);
    expect(METER_OPACITY).toBe(0.7);
  });

  test('the follower’s time constant is the beat pulse’s decay, so nothing jumps', () => {
    expect(METER_TAU_MS).toBe(120);
  });
});

describe('meterBandAt', () => {
  test('bass at the left edge, mids in the middle, treble at the right, linear between', () => {
    expect(meterBandAt(0, 0.2, 0.5, 0.9)).toBeCloseTo(0.2);
    expect(meterBandAt(0.5, 0.2, 0.5, 0.9)).toBeCloseTo(0.5);
    expect(meterBandAt(1, 0.2, 0.5, 0.9)).toBeCloseTo(0.9);
    expect(meterBandAt(0.25, 0.2, 0.5, 0.9)).toBeCloseTo(0.35);
    expect(meterBandAt(0.75, 0.2, 0.5, 0.9)).toBeCloseTo(0.7);
  });

  test('a position outside the row reads as its nearest edge', () => {
    expect(meterBandAt(-1, 0.2, 0.5, 0.9)).toBeCloseTo(0.2);
    expect(meterBandAt(2, 0.2, 0.5, 0.9)).toBeCloseTo(0.9);
  });
});

describe('meterShape', () => {
  test('is deterministic, within METER_SHAPE_MIN..1, and uneven across the row', () => {
    const shapes = Array.from({ length: METER_RULE_COUNT }, (_, i) => meterShape(i, METER_RULE_COUNT));
    for (const shape of shapes) {
      expect(shape).toBeGreaterThanOrEqual(METER_SHAPE_MIN);
      expect(shape).toBeLessThanOrEqual(1);
      expect(Number.isFinite(shape)).toBe(true);
    }
    expect(new Set(shapes.map((s) => s.toFixed(6))).size).toBeGreaterThan(METER_RULE_COUNT / 2);
    expect(meterShape(3, METER_RULE_COUNT)).toBe(meterShape(3, METER_RULE_COUNT));
  });
});

describe('meterRuleHeight', () => {
  test('silence is the printed base scale; full energy and full shape reach the maximum', () => {
    expect(meterRuleHeight(0, 1)).toBe(METER_BASE_HEIGHT);
    expect(meterRuleHeight(0, METER_SHAPE_MIN)).toBe(METER_BASE_HEIGHT);
    expect(meterRuleHeight(1, 1)).toBe(METER_MAX_HEIGHT);
  });

  test('the shape scales the band reading, and the reading is clamped to 0..1', () => {
    const half = meterRuleHeight(1, 0.5);
    expect(half).toBeCloseTo(METER_BASE_HEIGHT + (METER_MAX_HEIGHT - METER_BASE_HEIGHT) * 0.5);
    expect(meterRuleHeight(2, 1)).toBe(METER_MAX_HEIGHT);
    expect(meterRuleHeight(-1, 1)).toBe(METER_BASE_HEIGHT);
  });

  test('an extreme or broken reading never takes a rule past its cap or below its base', () => {
    for (const value of [1e9, Infinity, -Infinity, Number.NaN, -1e9]) {
      const h = meterRuleHeight(value, 1);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(METER_BASE_HEIGHT);
      expect(h).toBeLessThanOrEqual(METER_MAX_HEIGHT);
    }
  });
});

describe('meterTarget: what the follower heads for', () => {
  test('the band clamped to 0..1, a broken reading as 0', () => {
    expect(meterTarget(0.4, 0)).toBeCloseTo(0.4);
    expect(meterTarget(7, 0)).toBe(1);
    expect(meterTarget(-3, 0)).toBe(0);
    expect(meterTarget(Number.NaN, 0)).toBe(0);
    expect(meterTarget(Infinity, 0)).toBe(1);
  });

  test('0 while the room is silent, whatever the bands read (a noise floor never holds the rules up)', () => {
    expect(meterTarget(0.6, 1)).toBe(0);
    expect(meterTarget(1, 1)).toBe(0);
  });
});

describe('meterFollow: the meter does not flash (brightness and rate of change)', () => {
  test('the brightness is fixed: one ink at a fixed opacity no brighter than the rule ornament', () => {
    // BandMeter passes METER_OPACITY as a plain number (not a shared value),
    // so nothing the music does can change a rule's opacity.
    expect(METER_OPACITY).toBeLessThanOrEqual(0.7);
  });

  test('one 60 fps frame moves a rule at most METER_FRAME_STEP_PX, about an eighth of its travel', () => {
    expect(METER_FRAME_STEP_PX).toBeCloseTo(TRAVEL * (1 - Math.exp(-FRAME_MS / METER_TAU_MS)), 9);
    expect(METER_FRAME_STEP_PX).toBeLessThan(TRAVEL * 0.15);
    // A step from nothing to full: the largest frame is the first one.
    const rise = run(Array(60).fill(1));
    expect(largestStepPx(rise)).toBeCloseTo(METER_FRAME_STEP_PX, 6);
    // And back down from full.
    const fall = run(Array(60).fill(0), FRAME_MS, 1);
    expect(largestStepPx(fall, 1)).toBeCloseTo(METER_FRAME_STEP_PX, 6);
  });

  test('a strobing reading (full, nothing, full … each frame) only shimmers a rule by about 2 px', () => {
    const strobe = run(Array.from({ length: 240 }, (_, i) => (i % 2 === 0 ? 1 : 0)));
    const settled = strobe.slice(120);
    expect(largestStepPx(settled.slice(1), settled[0])).toBeLessThan(3);
    // It hovers around the middle instead of flashing between the ends.
    for (const r of settled) {
      expect(r).toBeGreaterThan(0.4);
      expect(r).toBeLessThan(0.6);
    }
  });

  test('a late frame counts as METER_MAX_DT_MS: a one-second hitch is not a jump to the target', () => {
    const late = meterFollow(0, 1, 1000);
    expect(late).toBeCloseTo(1 - Math.exp(-METER_MAX_DT_MS / METER_TAU_MS), 9);
    expect(meterRuleHeight(late, 1) - METER_BASE_HEIGHT).toBeLessThan(TRAVEL * 0.35);
  });

  test('a broken current or target value restarts from a finite reading instead of sticking', () => {
    expect(meterFollow(Number.NaN, 0.5, FRAME_MS)).toBeGreaterThan(0);
    expect(Number.isFinite(meterFollow(Infinity, 0, FRAME_MS))).toBe(true);
    expect(Number.isFinite(meterFollow(0.2, Number.NaN, FRAME_MS))).toBe(true);
    expect(meterFollow(0.3, 1, 0)).toBe(0.3);
    expect(meterFollow(0.3, 1, -5)).toBe(0.3);
  });

  test('in silence a full row falls to its base: within half a pixel in about half a second', () => {
    const quiet = Array(36).fill(meterTarget(1, 1)); // 36 frames = 600 ms
    const fall = run(quiet, FRAME_MS, 1);
    expect(meterRuleHeight(fall.at(-1)!, 1) - METER_BASE_HEIGHT).toBeLessThan(0.5);
    // …and stays there, still.
    const after = run(Array(60).fill(meterTarget(0.8, 1)), FRAME_MS, fall.at(-1)!);
    expect(largestStepPx(after, fall.at(-1)!)).toBeLessThan(0.5);
  });
});

describe('meterRuleX', () => {
  test('spreads the rules evenly from the row’s left edge to its right edge, rule width included', () => {
    expect(meterRuleX(0, 24, 24, 342)).toBe(24);
    expect(meterRuleX(23, 24, 24, 342)).toBeCloseTo(24 + 342 - METER_RULE_WIDTH);
    const pitch = meterRuleX(1, 24, 24, 342) - meterRuleX(0, 24, 24, 342);
    expect(meterRuleX(2, 24, 24, 342) - meterRuleX(1, 24, 24, 342)).toBeCloseTo(pitch);
  });

  test('a single rule stands at the left edge', () => {
    expect(meterRuleX(0, 1, 24, 342)).toBe(24);
  });
});
