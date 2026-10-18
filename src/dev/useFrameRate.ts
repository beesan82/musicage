import { useEffect, useState } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const SAMPLE_WINDOW_MS = 1_000;

/**
 * Development-only frame-rate probe.
 *
 * Counts UI-thread frames with a Reanimated frame callback and reports the
 * average once per second. Because the Skia scenes draw on the UI thread,
 * a drop here is the first sign that a shader is too heavy for the device.
 * Returns null until the first full sample window has elapsed or while
 * disabled.
 */
export function useFrameRate(enabled: boolean): number | null {
  const [fps, setFps] = useState<number | null>(null);
  const frames = useSharedValue(0);
  const elapsedMs = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    'worklet';
    const deltaMs = info.timeSincePreviousFrame;
    if (deltaMs === null) {
      return;
    }

    frames.value += 1;
    elapsedMs.value += deltaMs;

    if (elapsedMs.value >= SAMPLE_WINDOW_MS) {
      const average = Math.round((frames.value * 1_000) / elapsedMs.value);
      frames.value = 0;
      elapsedMs.value = 0;
      scheduleOnRN(setFps, average);
    }
  }, enabled);

  useEffect(() => {
    frame.setActive(enabled);
    if (!enabled) {
      frames.value = 0;
      elapsedMs.value = 0;
      setFps(null);
    }
  }, [elapsedMs, enabled, frame, frames]);

  return enabled ? fps : null;
}
