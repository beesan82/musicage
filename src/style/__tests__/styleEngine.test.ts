import type { AudioFeatures } from '../../audio/types';
import { createInitialVisualState, selectVisualState } from '../styleEngine';

const feature = (overrides: Partial<AudioFeatures> = {}): AudioFeatures => ({
  timestampMs: 0,
  energy: 0.35,
  low: 0.34,
  mid: 0.34,
  high: 0.32,
  transient: 0.1,
  silence: false,
  ...overrides,
});

it('uses Ambient for silence and slow low-energy input', () => {
  const state = selectVisualState(
    feature({ energy: 0.01, silence: true }),
    createInitialVisualState(0),
    1_000,
  );

  expect(state.style).toBe('ambient');
});

it('uses Jazz for balanced low and mid energy with gentle changes', () => {
  const state = selectVisualState(
    feature({
      energy: 0.7,
      low: 0.4,
      mid: 0.5,
      high: 0.1,
      transient: 0.05,
    }),
    createInitialVisualState(0),
    8_000,
  );

  expect(state.style).toBe('jazz');
});

it('uses Pop for mid-and-high energy with a stable pulse', () => {
  const state = selectVisualState(
    feature({
      energy: 0.8,
      low: 0.08,
      mid: 0.5,
      high: 0.42,
      transient: 0.12,
    }),
    createInitialVisualState(0),
    8_000,
  );

  expect(state.style).toBe('pop');
});

it('uses Dance for energetic, bass-heavy, transient-rich input', () => {
  const state = selectVisualState(
    feature({
      energy: 0.82,
      low: 0.65,
      mid: 0.22,
      high: 0.13,
      transient: 0.8,
    }),
    createInitialVisualState(0),
    8_000,
  );

  expect(state.style).toBe('dance');
});

it('uses Rock for loud high-frequency, transient-rich input', () => {
  const state = selectVisualState(
    feature({
      energy: 0.86,
      low: 0.18,
      mid: 0.28,
      high: 0.54,
      transient: 0.72,
    }),
    createInitialVisualState(0),
    8_000,
  );

  expect(state.style).toBe('rock');
});

it('does not switch personality before the minimum dwell time', () => {
  const jazz = {
    ...createInitialVisualState(0),
    style: 'jazz' as const,
    changedAtMs: 9_000,
  };
  const result = selectVisualState(
    feature({ energy: 0.9, low: 0.65, transient: 0.9 }),
    jazz,
    10_000,
  );

  expect(result.style).toBe('jazz');
});
