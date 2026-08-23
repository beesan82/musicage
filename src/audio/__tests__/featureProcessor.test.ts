import { createFeatureProcessor } from '../featureProcessor';

function sine(
  hz: number,
  sampleRate = 48_000,
  frames = 2_048,
  amplitude = 0.7,
) {
  return Float32Array.from(
    { length: frames },
    (_, index) => amplitude * Math.sin((2 * Math.PI * hz * index) / sampleRate),
  );
}

it('marks a zero PCM buffer as silence', () => {
  const result = createFeatureProcessor().process(
    new Float32Array(2_048),
    48_000,
    0,
  );

  expect(result.silence).toBe(true);
  expect(result.energy).toBe(0);
});

it('gives a 100 Hz signal more low energy than high energy', () => {
  const result = createFeatureProcessor().process(sine(100), 48_000, 0);

  expect(result.low).toBeGreaterThan(result.high);
});

it('gives a 5 kHz signal more high energy than low energy', () => {
  const result = createFeatureProcessor().process(sine(5_000), 48_000, 0);

  expect(result.high).toBeGreaterThan(result.low);
});

it('reports a stronger transient after a quiet buffer becomes loud', () => {
  const processor = createFeatureProcessor();

  processor.process(sine(220, 48_000, 2_048, 0.02), 48_000, 0);
  const result = processor.process(sine(220, 48_000, 2_048, 0.9), 48_000, 100);

  expect(result.transient).toBeGreaterThan(0.4);
});

it('clears smoothed energy and transient history when reset', () => {
  const processor = createFeatureProcessor();

  processor.process(sine(220, 48_000, 2_048, 0.9), 48_000, 0);
  processor.reset();
  const result = processor.process(new Float32Array(2_048), 48_000, 100);

  expect(result.energy).toBe(0);
  expect(result.transient).toBe(0);
  expect(result.silence).toBe(true);
});
