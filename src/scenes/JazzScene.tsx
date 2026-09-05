import { Animated, StyleSheet, View } from 'react-native';
import { useEffect, useRef } from 'react';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import type { SceneProps } from './SceneProps';

export function JazzScene({ visual, reducedMotion = false }: SceneProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const percussion = useRef(new Animated.Value(0)).current;
  const horn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0);
      percussion.setValue(0);
      horn.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 680,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 680,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(percussion, {
            toValue: 1,
            duration: 340,
            useNativeDriver: true,
          }),
          Animated.timing(percussion, {
            toValue: 0,
            duration: 420,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(horn, {
            toValue: 1,
            duration: 1_100,
            useNativeDriver: true,
          }),
          Animated.timing(horn, {
            toValue: 0,
            duration: 1_100,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [horn, percussion, pulse, reducedMotion]);

  const bassScale = reducedMotion
    ? 0.9 + visual.intensity * 0.22
    : pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.9 + visual.intensity * 0.1, 0.98 + visual.intensity * 0.26],
      });
  const percussionLift = reducedMotion
    ? -visual.motion * 13
    : percussion.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -8 - visual.motion * 22],
      });
  const hornShift = reducedMotion
    ? visual.accent * 11
    : horn.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 9 + visual.accent * 16],
      });

  return (
    <View style={styles.root} testID="scene-jazz">
      <Svg height="100%" preserveAspectRatio="none" style={styles.stage} viewBox="0 0 100 180" width="100%">
        <Defs>
          <LinearGradient id="jazzStage" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#131217" />
            <Stop offset="0.62" stopColor="#1B1A20" />
            <Stop offset="1" stopColor="#342923" />
          </LinearGradient>
          <LinearGradient id="jazzLight" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="#D8A65B" stopOpacity="0" />
            <Stop offset="0.66" stopColor="#D8A65B" stopOpacity="0.23" />
            <Stop offset="1" stopColor="#D8A65B" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d="M0 0H100V180H0Z" fill="url(#jazzStage)" />
        <Path d="M0 55 L100 18 L100 75 L0 112 Z" fill="url(#jazzLight)" />
        <Path d="M0 144 C20 132 42 139 61 131 C75 125 87 133 100 125 V180 H0 Z" fill="#0D0D10" />
        <Path d="M0 149 C25 143 48 151 72 140 C84 135 92 141 100 137" fill="none" stroke="#5F5C5A" strokeOpacity="0.4" strokeWidth="0.6" />
      </Svg>

      <Animated.View
        style={[styles.bass, { transform: [{ scale: bassScale }] }]}
        testID="jazz-bass"
      >
        <View style={styles.bassBody} />
        <View style={styles.bassNeck} />
        <View style={styles.bassHead} />
      </Animated.View>

      <Animated.View
        style={[
          styles.percussion,
          { transform: [{ translateY: percussionLift }] },
        ]}
        testID="jazz-percussion"
      >
        <View style={[styles.stick, styles.stickTall]} />
        <View style={[styles.stick, styles.stickShort]} />
        <View style={[styles.stick, styles.stickMedium]} />
        <View style={[styles.stick, styles.stickTall]} />
      </Animated.View>

      <Animated.View
        style={[
          styles.horn,
          {
            opacity: 0.48 + visual.accent * 0.52,
            transform: [{ translateX: hornShift }],
          },
        ]}
        testID="jazz-horn"
      >
        <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
          <Path
            d="M18 67 L69 23 L87 32 L35 71 Z"
            fill="#E5B05E"
            opacity="0.16"
          />
          <Path d="M23 66 L78 25" fill="none" stroke="#E9D7AA" strokeWidth={1.2 + visual.accent * 2.2} />
          <Path d="M74 22 L89 28 L79 39 Z" fill="#F2C978" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#131217',
    flex: 1,
    overflow: 'hidden',
  },
  stage: {
    ...StyleSheet.absoluteFill,
  },
  bass: {
    bottom: '17%',
    height: 188,
    left: '13%',
    position: 'absolute',
    width: 92,
  },
  bassBody: {
    backgroundColor: '#594337',
    borderColor: '#D0A469',
    borderRadius: 44,
    borderWidth: 1,
    bottom: 0,
    height: 94,
    position: 'absolute',
    width: 76,
  },
  bassNeck: {
    backgroundColor: '#B48858',
    bottom: 78,
    height: 106,
    left: 52,
    position: 'absolute',
    transform: [{ rotate: '-18deg' }],
    width: 5,
  },
  bassHead: {
    backgroundColor: '#D6BC8E',
    borderRadius: 5,
    height: 18,
    left: 75,
    position: 'absolute',
    top: 4,
    transform: [{ rotate: '-18deg' }],
    width: 12,
  },
  percussion: {
    alignItems: 'flex-end',
    bottom: '20%',
    flexDirection: 'row',
    gap: 7,
    left: '43%',
    position: 'absolute',
  },
  stick: {
    backgroundColor: '#DCC692',
    borderRadius: 3,
    opacity: 0.84,
    width: 5,
  },
  stickShort: {
    height: 31,
  },
  stickMedium: {
    height: 49,
  },
  stickTall: {
    height: 68,
  },
  horn: {
    height: 182,
    position: 'absolute',
    right: '-6%',
    top: '19%',
    width: '86%',
  },
});
