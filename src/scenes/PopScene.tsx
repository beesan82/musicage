import { Animated, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';

import type { SceneProps } from './SceneProps';

export function PopScene({ visual, reducedMotion = false }: SceneProps) {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      bounce.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 720,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 720,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [bounce, reducedMotion]);

  const primaryLift = reducedMotion
    ? -visual.motion * 16
    : bounce.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -8 - visual.motion * 22],
      });
  const secondaryLift = reducedMotion
    ? visual.motion * 9
    : bounce.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 5 + visual.motion * 16],
      });
  const headlineColor = `rgb(${232 + Math.round(visual.accent * 20)}, ${230 - Math.round(
    visual.intensity * 30,
  )}, ${217 - Math.round(visual.motion * 34)})`;

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: `rgb(${22 + Math.round(visual.intensity * 24)}, 20, ${37 + Math.round(visual.accent * 35)})` },
      ]}
      testID="scene-pop"
    >
      <View style={styles.wordColumn}>
        <Text style={[styles.kicker, { color: headlineColor }]}>POP / FORM</Text>
        <Text style={[styles.headline, { color: headlineColor }]}>PULSE</Text>
      </View>

      <Animated.View
        style={[
          styles.card,
          styles.cardPink,
          {
            opacity: 0.72 + visual.intensity * 0.28,
            transform: [{ rotate: '8deg' }, { translateY: primaryLift }],
          },
        ]}
        testID="pop-card-pink"
      >
        <Text style={styles.cardText}>NOW</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.card,
          styles.cardBlue,
          {
            opacity: 0.66 + visual.accent * 0.34,
            transform: [{ rotate: '-12deg' }, { translateY: secondaryLift }],
          },
        ]}
      >
        <Text style={styles.cardText}>UP</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.card,
          styles.cardYellow,
          {
            opacity: 0.65 + visual.motion * 0.35,
            transform: [{ rotate: '5deg' }, { translateY: primaryLift }],
          },
        ]}
      >
        <Text style={styles.cardText}>GO</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingTop: 84,
  },
  wordColumn: {
    zIndex: 2,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
  },
  headline: {
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: -3,
    lineHeight: 70,
    marginTop: 4,
  },
  card: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    position: 'absolute',
  },
  cardPink: {
    backgroundColor: '#EC5F90',
    height: 176,
    right: '-8%',
    top: '31%',
    width: '74%',
  },
  cardBlue: {
    backgroundColor: '#5A73EC',
    bottom: '23%',
    height: 142,
    left: '-11%',
    width: '67%',
  },
  cardYellow: {
    backgroundColor: '#F1C853',
    bottom: '9%',
    height: 120,
    right: '8%',
    width: '52%',
  },
  cardText: {
    color: '#17151D',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 3,
  },
});
