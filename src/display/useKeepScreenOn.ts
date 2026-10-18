import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const TAG = 'musicage-listening';

/**
 * Keeps the display on while `active` is true.
 *
 * MUSICAGE is meant to stand beside a record for a whole side, so the
 * screen must not sleep while the microphone is listening. The lock is
 * released as soon as listening stops (permission denied, error, the user
 * stopping the mic) and on unmount, so a backgrounded app never holds it.
 */
export function useKeepScreenOn(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    let released = false;
    void activateKeepAwakeAsync(TAG).catch(() => {
      // Keep-awake is best effort: a device that refuses it still gets the visuals.
    });

    return () => {
      if (!released) {
        released = true;
        void deactivateKeepAwake(TAG).catch(() => {});
      }
    };
  }, [active]);
}
