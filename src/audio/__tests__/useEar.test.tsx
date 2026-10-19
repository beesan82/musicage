import { renderHook } from '@testing-library/react-native';

import { createEarEmitter } from '../earStream';
import type { EarFeatures } from '../types';
import { useEar } from '../useEar';
import { useMicrophoneAnalysis } from '../useMicrophoneAnalysis';

jest.mock('../useMicrophoneAnalysis', () => ({
  useMicrophoneAnalysis: jest.fn(),
}));

const meter = (earStream = createEarEmitter()) => ({
  status: 'idle' as const,
  features: {},
  ear: {},
  errorMessage: null,
  earStream,
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  retry: jest.fn().mockResolvedValue(undefined),
});

test('selects the meter ear with no recognizer when the native module is null', async () => {
  (useMicrophoneAnalysis as jest.Mock).mockReturnValue(meter());

  const { result } = await renderHook(() => useEar());

  expect(result.current.kind).toBe('meter');
  expect(result.current.recognizer).toBeNull();
});

test('the meter ear exposes an earStream fed from the meter', async () => {
  const emitter = createEarEmitter();
  (useMicrophoneAnalysis as jest.Mock).mockReturnValue(meter(emitter));
  const { result } = await renderHook(() => useEar());
  const frames: EarFeatures[] = [];
  result.current.earStream.subscribe((f) => frames.push(f));

  emitter.emit({ timestampMs: 5, rms: 0.1, low: 0.1, mid: 0.1, high: 0.1 });

  expect(frames.map((f) => f.timestampMs)).toEqual([5]);
});
