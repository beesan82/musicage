import { applySceneLock, nextSceneLock, sceneLockLabel } from '../sceneLock';
import type { SceneLock } from '../sceneLock';
import { createInitialVisualState } from '../../style/styleEngine';

it('cycles ambient → jazz → pop → dance → rock → auto and wraps', () => {
  const seen: SceneLock[] = [];
  let lock = nextSceneLock(null);

  for (let step = 0; step < 6; step += 1) {
    seen.push(lock);
    lock = nextSceneLock(lock);
  }

  expect(seen).toEqual(['ambient', 'jazz', 'pop', 'dance', 'rock', null]);
  expect(lock).toBe('ambient');
});

it('overrides only the style and leaves the audio-driven values untouched', () => {
  const visual = {
    ...createInitialVisualState(1_000),
    style: 'dance' as const,
    intensity: 0.71,
    motion: 0.63,
    accent: 0.4,
    textScale: 1.05,
  };

  const locked = applySceneLock(visual, 'jazz');

  expect(locked).toEqual({ ...visual, style: 'jazz' });
  expect(applySceneLock(visual, null)).toBe(visual);
  expect(applySceneLock(visual, 'dance')).toBe(visual);
});

it('labels the lock state for the overlay', () => {
  expect(sceneLockLabel(null)).toBe('AUTO');
  expect(sceneLockLabel('rock')).toBe('ROCK');
});
