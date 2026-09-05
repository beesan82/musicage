import { Animated, StyleSheet, View } from 'react-native';
import { useEffect, useRef } from 'react';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import type { SceneProps } from './SceneProps';

export function AmbientScene({ visual, reducedMotion = false }: SceneProps) {
  const travel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      travel.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(travel, {
          toValue: 1,
          duration: 9_000,
          useNativeDriver: true,
        }),
        Animated.timing(travel, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [reducedMotion, travel]);

  const farOffset = travel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 18 + visual.motion * 22],
  });
  const mistOffset = travel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -28 - visual.motion * 40],
  });
  const nearRise = travel.interpolate({
    inputRange: [0, 1],
    outputRange: [12, -42 - visual.motion * 36],
  });

  const farTransform = reducedMotion
    ? [{ translateX: visual.motion * 8 }]
    : [{ translateX: farOffset }];
  const mistTransform = reducedMotion
    ? [{ translateX: -visual.motion * 16 }]
    : [{ translateX: mistOffset }];
  const nearTransform = reducedMotion
    ? [{ translateY: -visual.motion * 14 }]
    : [{ translateY: nearRise }];

  return (
    <View style={styles.root} testID="scene-ambient">
      <View style={styles.sky}>
        <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 180" width="100%">
          <Defs>
            <LinearGradient id="ambientSky" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#0A1521" />
              <Stop offset="0.54" stopColor="#193348" />
              <Stop offset="1" stopColor="#6C7C78" />
            </LinearGradient>
          </Defs>
          <Path d="M0 0H100V180H0Z" fill="url(#ambientSky)" />
        </Svg>
      </View>

      <Animated.View
        style={[
          styles.farLayer,
          {
            opacity: 0.3 + (1 - visual.intensity) * 0.52,
            transform: farTransform,
          },
        ]}
        testID="ambient-horizon-far"
      >
        <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 120 180" width="120%">
          <Path
            d="M0 85 C15 78 25 82 40 72 C54 62 66 74 80 67 C93 61 105 71 120 58 V180 H0 Z"
            fill="#152B37"
          />
          <Path
            d="M0 103 C22 90 38 98 58 87 C76 77 99 91 120 79 V180 H0 Z"
            fill="#254353"
            opacity="0.82"
          />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[
          styles.mistLayer,
          {
            opacity: 0.22 + visual.motion * 0.36,
            transform: mistTransform,
          },
        ]}
        testID="ambient-horizon-mid"
      >
        <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 150 180" width="150%">
          <Path
            d="M0 104 C22 84 46 116 72 96 C93 80 119 104 150 90 L150 180 L0 180 Z"
            fill="#A9C0B5"
            opacity="0.28"
          />
          <Path
            d="M0 119 C34 100 58 132 86 111 C112 92 130 114 150 106 L150 180 L0 180 Z"
            fill="#D8DED2"
            opacity="0.2"
          />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[styles.nearLayer, { transform: nearTransform }]}
        testID="ambient-horizon-near"
      >
        <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 180" width="100%">
          <Defs>
            <LinearGradient id="ambientGround" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#253C3C" />
              <Stop offset="1" stopColor="#091415" />
            </LinearGradient>
          </Defs>
          <Path
            d="M-8 133 C18 119 33 119 50 127 C68 135 85 129 108 113 L108 180 L-8 180 Z"
            fill="url(#ambientGround)"
          />
          <Path
            d="M6 146 C32 130 53 139 81 124"
            fill="none"
            opacity={0.36 + visual.accent * 0.5}
            stroke="#C9D6B1"
            strokeWidth="0.8"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A1521',
    flex: 1,
    overflow: 'hidden',
  },
  sky: {
    ...StyleSheet.absoluteFill,
  },
  farLayer: {
    ...StyleSheet.absoluteFill,
    left: '-10%',
    width: '120%',
  },
  mistLayer: {
    ...StyleSheet.absoluteFill,
    left: '-24%',
    width: '150%',
  },
  nearLayer: {
    ...StyleSheet.absoluteFill,
  },
});
