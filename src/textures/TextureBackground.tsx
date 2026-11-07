import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { Palette, Texture } from '../direction/types';
import { hexToRgb01, TEXTURE_EFFECTS } from './textureShader';

export interface TextureBackgroundProps {
  texture: Texture;
  palette: Palette;
  /** Beat pulse 0..1, owned and animated by the parent. */
  pulse: SharedValue<number>;
  /** Audio energy 0..1, owned and animated by the parent. */
  energy: SharedValue<number>;
  /** Smoothed low-band envelope 0..1; rests at 0 when the stage does not drive it. */
  low?: SharedValue<number>;
  /** Smoothed mid-band envelope 0..1; rests at 0 when not driven. */
  mid?: SharedValue<number>;
  /** Smoothed high-band envelope 0..1; rests at 0 when not driven. */
  high?: SharedValue<number>;
  /** Beat confidence 0..1; gates the pulse response. Ungated (1) when not driven. */
  confidence?: SharedValue<number>;
  width: number;
  height: number;
  reducedMotion?: boolean;
}

/**
 * Full-screen texture shader behind the lyrics.
 *
 * Time is advanced on the UI thread by a Reanimated frame callback; pulse and
 * energy are read straight from the parent's shared values. With
 * reducedMotion the frame callback stops and time is held at 0.
 */
export function TextureBackground({
  texture,
  palette,
  pulse,
  energy,
  low,
  mid,
  high,
  confidence,
  width,
  height,
  reducedMotion = false,
}: TextureBackgroundProps) {
  const time = useSharedValue(0);
  const restLow = useSharedValue(0);
  const restMid = useSharedValue(0);
  const restHigh = useSharedValue(0);
  const ungated = useSharedValue(1);
  const lowValue = low ?? restLow;
  const midValue = mid ?? restMid;
  const highValue = high ?? restHigh;
  const confidenceValue = confidence ?? ungated;

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

  const colors = useMemo(
    () => ({
      background: hexToRgb01(palette.background),
      ink: hexToRgb01(palette.ink),
      accent: hexToRgb01(palette.accent),
    }),
    [palette.background, palette.ink, palette.accent],
  );

  const uniforms = useDerivedValue(
    () => ({
      iResolution: [width, height],
      iTime: time.value,
      iPulse: pulse.value,
      iEnergy: energy.value,
      iLow: lowValue.value,
      iMid: midValue.value,
      iHigh: highValue.value,
      iConfidence: confidenceValue.value,
      iBackground: colors.background,
      iInk: colors.ink,
      iAccent: colors.accent,
    }),
    [width, height, colors, lowValue, midValue, highValue, confidenceValue],
  );

  return (
    <View
      style={[styles.root, { width, height, backgroundColor: palette.background }]}
      testID="texture-background"
    >
      <Canvas style={{ width, height }}>
        <Fill>
          <Shader source={TEXTURE_EFFECTS[texture]} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
});
