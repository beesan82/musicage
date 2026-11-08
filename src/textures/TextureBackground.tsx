import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { INK_TINT_MAX, surgeHighHex } from '../direction/surge';
import type { Palette, Texture } from '../direction/types';
import { dropDip, getTextureEffect, hexToRgb01, mixRgb } from './textureShader';

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
  /**
   * Surge strength 0..1 (design spec §4). Moves the ink and accent uniforms
   * towards the palette's high accent; the background colour never moves, so
   * the frame's black base and mean luminance stay put. 0 when not driven.
   */
  surge?: SharedValue<number>;
  /**
   * The stage clock (LyricStage's `time`), on the same basis as `dropAtMs`.
   * Only read for the recognition drop; without it there is no dip.
   */
  time?: SharedValue<number>;
  /**
   * When the recognition drop fired, on the stage clock; null when none has.
   * The background sinks to black and recovers within DROP_DIP_MS of it.
   */
  dropAtMs?: number | null;
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
  surge,
  time: stageTime,
  dropAtMs = null,
  width,
  height,
  reducedMotion = false,
}: TextureBackgroundProps) {
  const time = useSharedValue(0);
  const noStageTime = useSharedValue(0);
  const stageTimeValue = stageTime ?? noStageTime;
  // Under reduced motion the stage clock stands still, so the dip would
  // freeze mid-way; it is skipped instead.
  const dropFireMs = stageTime !== undefined && !reducedMotion && dropAtMs !== null ? dropAtMs : null;
  const restLow = useSharedValue(0);
  const restMid = useSharedValue(0);
  const restHigh = useSharedValue(0);
  const ungated = useSharedValue(1);
  const restSurge = useSharedValue(0);
  const lowValue = low ?? restLow;
  const midValue = mid ?? restMid;
  const highValue = high ?? restHigh;
  const confidenceValue = confidence ?? ungated;
  const surgeValue = surge ?? restSurge;

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

  // Compiled on first render, never at module scope; null means the shader
  // failed to compile on this device and the stage falls back to a plain
  // fill in the palette's background colour.
  const effect = useMemo(() => getTextureEffect(texture), [texture]);

  const colors = useMemo(
    () => ({
      background: hexToRgb01(palette.background),
      ink: hexToRgb01(palette.ink),
      accent: hexToRgb01(palette.accent),
      high: hexToRgb01(surgeHighHex(palette)),
    }),
    [palette],
  );

  // The ink and accent move with the surge (spec §6: on a slow follower, by a
  // small amount); the background is passed through untouched.
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
      iDrop: dropFireMs === null ? 0 : dropDip(stageTimeValue.value - dropFireMs),
      iBackground: colors.background,
      iInk: mixRgb(colors.ink, colors.high, surgeValue.value * INK_TINT_MAX),
      iAccent: mixRgb(colors.accent, colors.high, surgeValue.value),
    }),
    [
      width,
      height,
      colors,
      lowValue,
      midValue,
      highValue,
      confidenceValue,
      surgeValue,
      stageTimeValue,
      dropFireMs,
    ],
  );

  return (
    <View
      style={[styles.root, { width, height, backgroundColor: palette.background }]}
      testID="texture-background"
    >
      <Canvas style={{ width, height }}>
        {effect ? (
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        ) : (
          <Fill color={palette.background} />
        )}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
});
