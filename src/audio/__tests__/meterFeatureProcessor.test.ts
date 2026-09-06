import { createMeterFeatureProcessor } from '../meterFeatureProcessor';

it('maps missing and floor-level dB readings to silence', () => {
  const processor = createMeterFeatureProcessor();

  expect(processor.process(undefined, 0)).toMatchObject({
    energy: 0,
    low: 0,
    mid: 0,
    high: 0,
    transient: 0,
    silence: true,
  });
  expect(processor.process(-160, 100)).toMatchObject({
    energy: 0,
    silence: true,
  });
});

it('keeps room-level music reactive instead of treating it as silence', () => {
  const processor = createMeterFeatureProcessor();

  const result = processor.process(-66, 0);

  expect(result.energy).toBeGreaterThan(0.05);
  expect(result.silence).toBe(false);
});

it('raises energy and a transient after a quiet-to-loud change', () => {
  const processor = createMeterFeatureProcessor();
  processor.process(-55, 0);
  const result = processor.process(-8, 100);

  expect(result.energy).toBeGreaterThan(0.2);
  expect(result.transient).toBeGreaterThan(0.4);
  expect(result.high).toBeGreaterThan(result.mid * 0.25);
  expect(result.timestampMs).toBe(100);
});

it('clears smoothing state on reset', () => {
  const processor = createMeterFeatureProcessor();
  processor.process(-6, 0);
  processor.reset();

  expect(processor.process(-160, 100)).toMatchObject({
    energy: 0,
    transient: 0,
    silence: true,
  });
});
