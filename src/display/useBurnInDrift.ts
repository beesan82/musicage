import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import type { ViewStyle } from 'react-native';

export type BurnInDrift = Animated.WithAnimatedObject<ViewStyle>;

export const DRIFT_RADIUS_PX = 8;
const PERIOD_X_MS = 73_000;
const PERIOD_Y_MS = 113_000;

function sway(value: Animated.Value, periodMs: number): Animated.CompositeAnimation {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration: periodMs / 2,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: -1,
        duration: periodMs / 2,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]),
  );
}

/**
 * A very slow Lissajous-style wander, ±8 px over a minute or two, for the
 * static text layer. An always-on OLED object that never moves its wordmark
 * and lyrics burns them in; this drift is far below what the eye notices
 * but enough to spread the wear. The two periods are chosen so the path
 * does not repeat for a long time. Still under reducedMotion.
 */
export function useBurnInDrift(reducedMotion: boolean): BurnInDrift {
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      x.setValue(0);
      y.setValue(0);
      return;
    }

    const swayX = sway(x, PERIOD_X_MS);
    const swayY = sway(y, PERIOD_Y_MS);
    swayX.start();
    swayY.start();

    return () => {
      swayX.stop();
      swayY.stop();
    };
  }, [reducedMotion, x, y]);

  return useMemo(() => {
    const toPixels = { inputRange: [-1, 1], outputRange: [-DRIFT_RADIUS_PX, DRIFT_RADIUS_PX] };

    return {
      transform: [
        { translateX: x.interpolate(toPixels) },
        { translateY: y.interpolate(toPixels) },
      ],
    };
  }, [x, y]);
}
