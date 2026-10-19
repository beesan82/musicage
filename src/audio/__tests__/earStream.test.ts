import { createEarEmitter } from '../earStream';
import type { EarFeatures } from '../types';

const frame = (timestampMs: number): EarFeatures => ({
  timestampMs,
  rms: 0.5,
  low: 0.5,
  mid: 0.5,
  high: 0.5,
});

test('delivers every frame to every subscriber, and unsubscribe stops delivery', () => {
  const emitter = createEarEmitter();
  const a: number[] = [];
  const b: number[] = [];
  const unsubscribeA = emitter.subscribe((f) => a.push(f.timestampMs));
  emitter.subscribe((f) => b.push(f.timestampMs));

  emitter.emit(frame(0));
  emitter.emit(frame(20));
  unsubscribeA();
  emitter.emit(frame(40));

  expect(a).toEqual([0, 20]);
  expect(b).toEqual([0, 20, 40]);
});
