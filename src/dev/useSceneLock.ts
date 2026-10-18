import { useCallback, useState } from 'react';

import { nextSceneLock } from './sceneLock';
import type { SceneLock } from './sceneLock';

export interface SceneLockController {
  /** False outside development builds: no lock is ever applied. */
  enabled: boolean;
  locked: SceneLock;
  cycle(): void;
}

const noop = () => {};

export function useSceneLock(enabled: boolean = __DEV__): SceneLockController {
  const [locked, setLocked] = useState<SceneLock>(null);
  const cycle = useCallback(() => {
    setLocked((current) => nextSceneLock(current));
  }, []);

  if (!enabled) {
    return { enabled: false, locked: null, cycle: noop };
  }

  return { enabled: true, locked, cycle };
}
