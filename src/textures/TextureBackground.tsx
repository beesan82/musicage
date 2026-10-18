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
  width,
  height,
  reducedMotion = false,
}: TextureBackgroundProps) {
  const time = useSharedValue(0);

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
      iBackground: colors.background,
      iInk: colors.ink,
      iAccent: colors.accent,
    }),
    [width, height, colors],
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
