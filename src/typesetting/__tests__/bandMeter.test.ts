import {
  METER_BASE_HEIGHT,
  METER_MAX_HEIGHT,
  METER_OPACITY,
  METER_RULE_COUNT,
  METER_RULE_WIDTH,
  METER_SHAPE_MIN,
  METER_TAU_MS,
  meterBandAt,
  meterRuleHeight,
  meterRuleX,
  meterShape,
} from '../bandMeter';

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
