import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import type { SkRuntimeEffect } from '@shopify/react-native-skia';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { VisualState } from '../../style/types';

interface SkiaShaderSceneProps {
  /** Compiled scene shader; see compileSceneEffect. */
  effect: SkRuntimeEffect;
  /** Root testID; the canvas gets `${testID}-canvas` once laid out. */
  testID: string;
  /** Shown before the first layout and behind the canvas. */
  backgroundColor: string;
  visual: VisualState;
  reducedMotion?: boolean;
}

const SMOOTHING = { duration: 120, easing: Easing.out(Easing.cubic) };

/**
 * Full-screen runtime-shader scene.
 *
 * Everything that moves lives on the UI thread: time is advanced by a
 * Reanimated frame callback, the audio-driven uniforms are smoothed shared
 * values, and the Skia canvas reads them through a derived value. The JS
 * thread only re-renders when the view size changes.
 *
 * With reducedMotion the frame callback stops and a still frame at t = 0
 * is drawn with the current audio values applied directly.
 */
export function SkiaShaderScene({
  effect,
  testID,
  backgroundColor,
  visual,
  reducedMotion = false,
}: SkiaShaderSceneProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const time = useSharedValue(0);
  const intensity = useSharedValue(visual.intensity);
  const motion = useSharedValue(visual.motion);
  const accent = useSharedValue(visual.accent);

  const frame = useFrameCallback((info) => {
    'worklet';
    const deltaMs = info.timeSincePreviousFrame ?? 0;
    // Wrap so float precision inside the shader stays stable over long sessions.
    time.value = (time.value + deltaMs / 1000) % 3600;
  }, !reducedMotion);

  useEffect(() => {
    frame.setActive(!reducedMotion);
    if (reducedMotion) {
      time.value = 0;
    }
  }, [frame, reducedMotion, time]);

  useEffect(() => {
    if (reducedMotion) {
      intensity.value = visual.intensity;
      motion.value = visual.motion;
      accent.value = visual.accent;
      return;
    }

    intensity.value = withTiming(visual.intensity, SMOOTHING);
    motion.value = withTiming(visual.motion, SMOOTHING);
    accent.value = withTiming(visual.accent, SMOOTHING);
  }, [accent, intensity, motion, reducedMotion, visual.accent, visual.intensity, visual.motion]);

  const uniforms = useDerivedValue(
    () => ({
      iResolution: [size.width, size.height],
      iTime: time.value,
      iIntensity: intensity.value,
      iMotion: motion.value,
      iAccent: accent.value,
    }),
    [size.width, size.height],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height },
    );
  }, []);

  return (
    <View onLayout={onLayout} style={[styles.root, { backgroundColor }]} testID={testID}>
      {size.width > 0 && size.height > 0 ? (
        <Canvas style={styles.canvas} testID={`${testID}-canvas`}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  canvas: {
    ...StyleSheet.absoluteFill,
  },
});
