import { Animated, StyleSheet, View } from 'react-native';
import { useEffect, useRef } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import type { SceneProps } from './SceneProps';

export function DanceScene({ visual, reducedMotion = false }: SceneProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 760,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 760,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  const scale = reducedMotion
    ? 0.88 + visual.intensity * 0.24
    : pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.84 + visual.intensity * 0.16, 0.98 + visual.motion * 0.22],
      });
  const opacity = reducedMotion
    ? 0.5 + visual.motion * 0.4
    : pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.42 + visual.intensity * 0.24, 0.68 + visual.motion * 0.3],
      });
  const ringColor = `rgb(${111 + Math.round(visual.accent * 112)}, ${217 - Math.round(
    visual.intensity * 64,
  )}, 255)`;
  const gridColor = `rgba(222, 226, 255, ${0.1 + visual.accent * 0.22})`;

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: `rgb(${9 + Math.round(visual.intensity * 10)}, 12, ${31 + Math.round(visual.accent * 34)})` },
      ]}
      testID="scene-dance"
    >
      <Svg height="100%" preserveAspectRatio="none" style={styles.grid} viewBox="0 0 100 180" width="100%">
        {[18, 34, 50, 66, 82].map((position) => (
          <Path d={`M${position} 0V180`} key={`vertical-${position}`} stroke={gridColor} strokeWidth="0.35" />
        ))}
        {[44, 68, 92, 116, 140, 164].map((position) => (
          <Path d={`M0 ${position}H100`} key={`horizontal-${position}`} stroke={gridColor} strokeWidth="0.35" />
        ))}
      </Svg>
      <Animated.View style={[styles.rings, { opacity, transform: [{ scale }] }]}>
        <Svg height="100%" viewBox="0 0 200 200" width="100%">
          <Circle cx="100" cy="100" fill="none" r="77" stroke={ringColor} strokeOpacity="0.42" strokeWidth="1.5" />
          <Circle cx="100" cy="100" fill="none" r="53" stroke={ringColor} strokeOpacity="0.62" strokeWidth="2.4" />
          <Circle cx="100" cy="100" fill="none" r="28" stroke={ringColor} strokeOpacity="0.9" strokeWidth="3.2" />
          <Circle cx="100" cy="100" fill={ringColor} fillOpacity={0.12 + visual.intensity * 0.18} r="8" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
  },
  rings: {
    height: 310,
    left: '50%',
    marginLeft: -155,
    marginTop: -155,
    position: 'absolute',
    top: '50%',
    width: 310,
  },
});
