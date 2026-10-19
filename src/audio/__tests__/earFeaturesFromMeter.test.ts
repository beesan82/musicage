import { createMeterEarAdapter } from '../earFeaturesFromMeter';

describe('createMeterEarAdapter', () => {
  it('maps -12 dB to rms 1 and -72 dB or below to 0', () => {
    const adapter = createMeterEarAdapter();

    expect(adapter.process(-12, 0).rms).toBeCloseTo(1, 5);
    expect(adapter.process(-72, 60).rms).toBe(0);
    expect(adapter.process(-100, 120).rms).toBe(0);
    expect(adapter.process(undefined, 180).rms).toBe(0);
  });

  it('low follows rms, and high is larger on a rising sample than on a steady one', () => {
    const a = createMeterEarAdapter();
    a.process(-60, 0);
    const rising = a.process(-20, 60);
    const steady = a.process(-20, 120);

    expect(rising.low).toBeCloseTo(rising.rms, 5);
    expect(rising.high).toBeGreaterThan(steady.high);
    expect(rising.mid).toBeGreaterThan(steady.mid);
    expect(rising.timestampMs).toBe(60);
  });

  it('reset clears the previous energy', () => {
    const a = createMeterEarAdapter();
    a.process(-20, 0);
    a.reset();
    const afterReset = a.process(-20, 60);
    const fresh = createMeterEarAdapter().process(-20, 60);

    expect(afterReset).toEqual(fresh);
  });
});
