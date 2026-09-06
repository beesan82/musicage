import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import type { VisualState } from '../style/types';
import { clamp01 } from '../utils/clamp';

interface AudioReactiveWaveProps {
  visual: VisualState;
  reducedMotion?: boolean;
}

const BAR_WEIGHTS = [0.46, 0.64, 0.82, 1, 0.82, 0.64, 0.46] as const;

function responseLevel(visual: VisualState): number {
  return clamp01(visual.intensity * 0.62 + visual.motion * 0.38);
}

function barScale(level: number, weight: number): number {
  return 0.16 + level * (0.4 + weight * 0.76);
}

export function AudioReactiveWave({
  visual,
  reducedMotion = false,
}: AudioReactiveWaveProps) {
  const targetLevel = responseLevel(visual);
  const level = useRef(new Animated.Value(targetLevel)).current;

  useEffect(() => {
    if (reducedMotion) {
      level.setValue(targetLevel);
      return;
    }

    const animation = Animated.timing(level, {
      toValue: targetLevel,
      duration: 110,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start();
    return () => animation.stop();
  }, [level, reducedMotion, targetLevel]);

  const rootOpacity = reducedMotion
    ? 0.2 + targetLevel * 0.66
    : level.interpolate({
        inputRange: [0, 1],
        outputRange: [0.2, 0.86],
      });
  const rootScale = reducedMotion
    ? 0.94 + targetLevel * 0.1
    : level.interpolate({
        inputRange: [0, 1],
        outputRange: [0.94, 1.04],
      });
  const hue = Math.round(visual.accent * 58);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { opacity: rootOpacity, transform: [{ scale: rootScale }] }]}
      testID="audio-reactive-wave"
    >
      <View
        style={[
          styles.halo,
          {
            borderColor: `rgba(${197 + hue}, ${217 - hue / 2}, 231, 0.42)`,
          },
        ]}
      />
      <View style={styles.barRow}>
        {BAR_WEIGHTS.map((weight, index) => {
          const scaleY = reducedMotion
            ? barScale(targetLevel, weight)
            : level.interpolate({
                inputRange: [0, 1],
                outputRange: [barScale(0, weight), barScale(1, weight)],
              });
          const opacity = reducedMotion
            ? 0.28 + targetLevel * (0.44 + weight * 0.28)
            : level.interpolate({
                inputRange: [0, 1],
                outputRange: [0.28, 0.72 + weight * 0.28],
              });

          return (
            <Animated.View
              key={`bar-${index}`}
              style={[
                styles.bar,
                {
                  backgroundColor: `rgb(${210 + hue}, ${226 - hue / 2}, 236)`,
                  opacity,
                  transform: [{ scaleY }],
                },
              ]}
              testID={`audio-reactive-bar-${index}`}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: '24%',
  },
  halo: {
    borderRadius: 160,
    borderWidth: 1,
    bottom: '20%',
    height: 184,
    position: 'absolute',
    width: 184,
  },
  barRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    height: 108,
    justifyContent: 'center',
  },
  bar: {
    borderRadius: 6,
    height: 82,
    width: 5,
  },
});
