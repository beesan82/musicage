import { Animated, StyleSheet, View } from 'react-native';
import { useEffect, useMemo, useRef } from 'react';

import { SAMPLE_VISUAL_COPY } from '../app/sampleCopy';
import type { VisualState, VisualStyle } from '../style/types';

const COPY_INDEX_BY_STYLE: Record<VisualStyle, number> = {
  ambient: 0,
  jazz: 1,
  pop: 2,
  dance: 1,
  rock: 2,
};

export function LyricTypography({
  visual,
  reducedMotion = false,
}: {
  visual: VisualState;
  reducedMotion?: boolean;
}) {
  const expression = useRef(new Animated.Value(visual.intensity)).current;
  const copyLine = useMemo(
    () => SAMPLE_VISUAL_COPY[COPY_INDEX_BY_STYLE[visual.style]],
    [visual.style],
  );

  useEffect(() => {
    if (reducedMotion) {
      expression.setValue(visual.intensity);
      return;
    }

    const animation = Animated.timing(expression, {
      toValue: visual.intensity,
      duration: 720,
      useNativeDriver: false,
    });

    animation.start();
    return () => animation.stop();
  }, [expression, reducedMotion, visual.intensity]);

  const opacity = expression.interpolate({
    inputRange: [0, 1],
    outputRange: [0.58, 1],
  });
  const letterSpacing = expression.interpolate({
    inputRange: [0, 1],
    outputRange: [2.6, 0.8],
  });
  const scale = expression.interpolate({
    inputRange: [0, 1],
    outputRange: [visual.textScale * 0.94, visual.textScale],
  });

  return (
    <View pointerEvents="none" style={styles.root} testID="visual-copy">
      <Animated.Text style={[styles.label, { opacity }]}>VISUAL COPY</Animated.Text>
      <Animated.Text
        style={[
          styles.primary,
          {
            fontSize: Math.max(32, 44 * visual.textScale),
            letterSpacing,
            opacity,
            transform: [{ scale }],
          },
        ]}
        testID="visual-copy-primary"
      >
        {copyLine}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
    gap: 12,
  },
  label: {
    color: '#F2EBDD',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.8,
  },
  primary: {
    color: '#FCF5E8',
    fontWeight: '800',
    lineHeight: 52,
    maxWidth: '100%',
  },
});
