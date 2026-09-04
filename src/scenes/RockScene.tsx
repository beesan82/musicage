import { Animated, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';

import type { SceneProps } from './SceneProps';

interface GrainPoint {
  id: number;
  opacity: number;
  size: number;
  x: number;
  y: number;
}

function createDeterministicGrain(): GrainPoint[] {
  let seed = 37;

  return Array.from({ length: 56 }, (_unused, id) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_647;
    const x = seed % 100;
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_647;
    const y = seed % 100;
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_647;

    return {
      id,
      opacity: 0.12 + (seed % 46) / 100,
      size: 1 + (seed % 3),
      x,
      y,
    };
  });
}

const GRAIN_POINTS = createDeterministicGrain();

export function RockScene({ visual, reducedMotion = false }: SceneProps) {
  const distortion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      distortion.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(distortion, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(distortion, {
          toValue: 0,
          duration: 190,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [distortion, reducedMotion]);

  const maximumOffset = Math.min(8, 2 + visual.motion * 6);
  const offset = reducedMotion
    ? maximumOffset * 0.35
    : distortion.interpolate({
        inputRange: [0, 1],
        outputRange: [-maximumOffset, maximumOffset],
      });
  const signalColor = `rgb(255, ${235 - Math.round(visual.accent * 85)}, ${220 - Math.round(
    visual.intensity * 72,
  )})`;
  const grainColor = `rgba(255, 255, 255, ${0.22 + visual.accent * 0.34})`;

  return (
    <View style={styles.root} testID="scene-rock">
      <View pointerEvents="none" style={styles.grain}>
        {GRAIN_POINTS.map((point) => (
          <View
            key={point.id}
            style={[
              styles.grainPoint,
              {
                backgroundColor: grainColor,
                height: point.size,
                left: `${point.x}%` as `${number}%`,
                opacity: point.opacity + visual.motion * 0.24,
                top: `${point.y}%` as `${number}%`,
                width: point.size,
              },
            ]}
          />
        ))}
      </View>
      <Animated.View style={[styles.fragmentTop, { transform: [{ translateX: offset }] }]}>
        <Text style={[styles.fragment, { color: signalColor }]}>STATIC</Text>
      </Animated.View>
      <Animated.View style={[styles.fragmentMiddle, { transform: [{ translateX: offset }] }]}>
        <Text style={[styles.fragmentOutline, { borderColor: signalColor, color: '#111111' }]}>EDGE</Text>
      </Animated.View>
      <Animated.View style={[styles.fragmentBottom, { transform: [{ translateX: offset }] }]}>
        <Text style={[styles.fragment, { color: '#F4F0E6', opacity: 0.68 + visual.intensity * 0.32 }]}>VOLUME</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#111111',
    flex: 1,
    overflow: 'hidden',
  },
  grain: {
    ...StyleSheet.absoluteFillObject,
  },
  grainPoint: {
    position: 'absolute',
  },
  fragmentTop: {
    left: '-5%',
    position: 'absolute',
    top: '18%',
  },
  fragmentMiddle: {
    alignItems: 'flex-end',
    position: 'absolute',
    right: '-8%',
    top: '42%',
  },
  fragmentBottom: {
    left: '-3%',
    position: 'absolute',
    top: '65%',
  },
  fragment: {
    fontSize: 58,
    fontWeight: '900',
    letterSpacing: -3,
    lineHeight: 62,
  },
  fragmentOutline: {
    borderWidth: 1,
    fontSize: 76,
    fontWeight: '900',
    letterSpacing: -5,
    lineHeight: 82,
    paddingHorizontal: 8,
  },
});
