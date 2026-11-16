import { METER_RULE_COUNT, meterBudget, meterTarget } from '../../typesetting/bandMeter';
import {
  BACK_OPACITY_MAX,
  FLASH_AREA_MAX_FRACTION,
  FLASH_LIGHT_MAX_255,
  FOOT_OPACITY_MAX,
  lightBudgetOf,
  STEADY_LIGHT_MAX_255,
  VIZ_GAIN,
  VIZ_GAIN_REFERENCE,
  vizGainScale,
  vizReading,
} from '../discipline';
import { PATTERN_RENDERERS } from '../registry';

// The smallest and a common current iPhone screen, in points.
const SCREENS = [
  { name: 'iPhone SE (375 × 667)', width: 375, height: 667 },
  { name: 'iPhone (390 × 844)', width: 390, height: 844 },
];

describe('VIZ_GAIN: the reaction strength (design spec §9.1, decided 2026-11-16)', () => {
  test('1.15 on the mock’s slider, where the old meter sat at 0.45: about 2.6 × the reach', () => {
    expect(VIZ_GAIN).toBe(1.15);
    expect(VIZ_GAIN_REFERENCE).toBe(0.45);
    expect(vizGainScale(VIZ_GAIN)).toBeCloseTo(2.56, 2);
    expect(vizReading(0.1)).toBeCloseTo(0.1 * (1.15 / 0.45), 9);
  });

  test('the old mapping is the reference gain: the reading as it was', () => {
    for (const band of [0, 0.1, 0.25, 0.5, 1]) expect(vizReading(band, VIZ_GAIN_REFERENCE)).toBeCloseTo(band, 9);
  });

  test('saturates at 1, never below 0; a broken reading or gain answers nothing (+∞ is full)', () => {
    expect(vizReading(0.5)).toBe(1);
    expect(vizReading(-0.2)).toBe(0);
    expect(vizReading(Number.NaN)).toBe(0);
    expect(vizReading(Infinity)).toBe(1);
    expect(vizReading(-Infinity)).toBe(0);
    expect(vizReading(0.2, Number.NaN)).toBe(0);
    expect(vizReading(0.2, 0)).toBe(0);
    expect(vizReading(0.2, -1)).toBe(0);
  });

  test('the band meter (the clock’s `bars` too) heads for the reading at VIZ_GAIN by default', () => {
    for (const band of [0, 0.05, 0.1, 0.2, 0.39]) expect(meterTarget(band, 0)).toBeCloseTo(vizReading(band, VIZ_GAIN), 9);
    expect(meterTarget(0.1, 0)).toBeGreaterThan(0.1 * 2.5);
    // Silence still wins over any gain.
    expect(meterTarget(0.3, 1)).toBe(0);
  });
});

describe('the brightness discipline, checked from each renderer’s worst case', () => {
  test('the caps are the spec’s numbers', () => {
    expect(FOOT_OPACITY_MAX).toBe(0.7);
    expect(BACK_OPACITY_MAX).toBe(0.45);
    expect(STEADY_LIGHT_MAX_255).toBe(3);
    expect(FLASH_LIGHT_MAX_255).toBe(2);
    expect(FLASH_AREA_MAX_FRACTION).toBe(0.1);
  });

  test.each(SCREENS)('every registered pattern keeps within the caps on $name', ({ width, height }) => {
    const entries = Object.entries(PATTERN_RENDERERS);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const [, renderer] of entries) {
      const light = lightBudgetOf(renderer!.budget, width, height);
      expect(light.steady255).toBeLessThanOrEqual(STEADY_LIGHT_MAX_255);
      expect(light.flash255).toBeLessThanOrEqual(FLASH_LIGHT_MAX_255);
      expect(light.flashFraction).toBeLessThanOrEqual(FLASH_AREA_MAX_FRACTION);
      expect(light.ok).toBe(true);
    }
  });

  test('`bars` never flashes; `bars-bold` flashes only its low-side ticks, a sliver of the screen', () => {
    expect(meterBudget('bars')).toMatchObject({ flashArea: 0, flashInk: 0 });
    const bold = meterBudget('bars-bold');
    expect(bold.flashArea).toBeGreaterThan(0);
    expect(bold.flashArea / (375 * 667)).toBeLessThan(0.001);
  });

  test('the budget catches a pattern that would light the screen (a full-screen flash fails)', () => {
    const screen = 390 * 844;
    expect(lightBudgetOf({ steadyInk: 0, flashArea: screen, flashInk: screen * 0.1 }, 390, 844).ok).toBe(false);
    expect(lightBudgetOf({ steadyInk: screen * 0.05, flashArea: 0, flashInk: 0 }, 390, 844).ok).toBe(false);
    // A flash over 10% of the screen fails even when it is faint.
    expect(lightBudgetOf({ steadyInk: 0, flashArea: screen * 0.11, flashInk: 1 }, 390, 844).ok).toBe(false);
  });

  test('the `bars` budget is the old meter’s: METER_RULE_COUNT rules at full reach and 0.7', () => {
    expect(meterBudget('bars').steadyInk).toBeCloseTo(METER_RULE_COUNT * 2 * 36 * 0.7, 6);
  });
});
