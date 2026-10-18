import type { VisualState, VisualStyle } from '../style/types';

/**
 * Development-only scene lock. Cycles through every scene and then back to
 * automatic selection so the five Skia scenes can be compared on a device
 * without having to coax the style engine with real sound.
 */
export type SceneLock = VisualStyle | null;

export const SCENE_LOCK_SEQUENCE: readonly SceneLock[] = [
  'ambient',
  'jazz',
  'pop',
  'dance',
  'rock',
  null,
];

export function nextSceneLock(current: SceneLock): SceneLock {
  const index = SCENE_LOCK_SEQUENCE.indexOf(current);
  const next = SCENE_LOCK_SEQUENCE[(index + 1) % SCENE_LOCK_SEQUENCE.length];

  return next ?? null;
}

/**
 * Overrides only `style`; intensity / motion / accent keep following the
 * microphone so a locked scene still reacts to the room.
 */
export function applySceneLock(visual: VisualState, lock: SceneLock): VisualState {
  if (lock === null || visual.style === lock) {
    return visual;
  }

  return { ...visual, style: lock };
}

/**
 * Pill text: the lock state, followed by the UI-thread frame rate once one
 * has been measured (e.g. "JAZZ · 58").
 */
export function sceneLockLabel(lock: SceneLock, fps: number | null = null): string {
  const state = lock === null ? 'AUTO' : lock.toUpperCase();

  return fps === null ? state : `${state} · ${fps}`;
}
