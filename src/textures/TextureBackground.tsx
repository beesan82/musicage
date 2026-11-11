import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import type { FrameInfo, SharedValue } from 'react-native-reanimated';

import { lightHexFor } from '../direction/palettes';
import { INK_TINT_MAX, surgeHighHex } from '../direction/surge';
import type { Palette, Texture } from '../direction/types';
import {
  COLOR_TAU_MS,
  FOCUS_TAU_MS,
  followToward,
  IDLE_FOCUS,
  LAMP_TAU_MS,
  lampTarget,
  REDUCED_MOTION_LAMP,
} from './surfaceModel';
import type { Uv } from './surfaceModel';
import { dropDip, getTextureEffect, hexToRgb01, mixRgb } from './textureShader';
import type { Rgb01 } from './textureShader';

/** One frame of a colour's first-order follower; the same array when it has arrived. */
function followRgb(current: Rgb01, target: Rgb01, dtMs: number): Rgb01 {
  'worklet';
  if (
    Math.abs(target[0] - current[0]) < 1e-5 &&
    Math.abs(target[1] - current[1]) < 1e-5 &&
    Math.abs(target[2] - current[2]) < 1e-5
  ) {
    return current;
  }
  return [
    followToward(current[0], target[0], dtMs, COLOR_TAU_MS),
    followToward(current[1], target[1], dtMs, COLOR_TAU_MS),
    followToward(current[2], target[2], dtMs, COLOR_TAU_MS),
  ];
}

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
  /**
   * Where the lamp should centre (uv, 0..1), written by the stage when the
   * line on stage changes. The lamp slides there on the UI thread. Rests at
   * IDLE_FOCUS when not driven.
   */
  focus?: SharedValue<Uv>;
  /** 1 while the room is silent, 0 with sound; silence shuts the lamp. Sound (0) when not driven. */
  silence?: SharedValue<number>;
  width: number;
  height: number;
  reducedMotion?: boolean;
}

/**
 * Full-screen texture shader behind the lyrics.
 *
 * One Reanimated frame callback advances time and the lamp's slow followers
 * on the UI thread (visual overhaul spec §3b.1): its opening (iLamp, towards
 * lampTarget), its centre (iFocus, towards `focus`) and the ground and lamp
 * colours (iBackground, iLight, towards the palette after a change). Pulse
 * and energy are read straight from the parent's shared values. With
 * reducedMotion the frame callback stops, time is held at 0, the lamp is held
 * at REDUCED_MOTION_LAMP and the focus and colours take their targets at once.
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
  focus,
  silence,
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
  const restFocus = useSharedValue<Uv>(IDLE_FOCUS);
  const sound = useSharedValue(0);
  const lowValue = low ?? restLow;
  const midValue = mid ?? restMid;
  const highValue = high ?? restHigh;
  const confidenceValue = confidence ?? ungated;
  const surgeValue = surge ?? restSurge;
  const focusValue = focus ?? restFocus;
  const silenceValue = silence ?? sound;

  // Compiled on first render, never at module scope; null means the shader
  // failed to compile on this device and the stage falls back to a plain
  // fill in the palette's background colour.
  const effect = useMemo(() => getTextureEffect(texture), [texture]);

  const colors = useMemo(
    () => ({
      background: hexToRgb01(palette.background),
      light: hexToRgb01(lightHexFor(palette)),
      ink: hexToRgb01(palette.ink),
      accent: hexToRgb01(palette.accent),
      high: hexToRgb01(surgeHighHex(palette)),
    }),
    [palette],
  );

  // The lamp's slow followers. They start where they are headed (the first
  // palette, the idle focus, the lamp shut), so a mount does not fade in.
  const lamp = useSharedValue(0);
  const focusNow = useSharedValue<[number, number]>([IDLE_FOCUS.x, IDLE_FOCUS.y]);
  const backgroundNow = useSharedValue<Rgb01>(colors.background);
  const lightNow = useSharedValue<Rgb01>(colors.light);
  const backgroundTarget = useSharedValue<Rgb01>(colors.background);
  const lightTarget = useSharedValue<Rgb01>(colors.light);

  // A palette change only moves the targets; the frame callback carries the
  // colours over in COLOR_TAU_MS (spec §3a.5). Under reduced motion there is
  // no frame callback, so the colours are set at once.
  useEffect(() => {
    backgroundTarget.value = colors.background;
    lightTarget.value = colors.light;
    if (reducedMotion) {
      backgroundNow.value = colors.background;
      lightNow.value = colors.light;
    }
  }, [backgroundNow, backgroundTarget, colors, lightNow, lightTarget, reducedMotion]);

  // Stable, so the frame callback is registered once rather than on every render.
  const onFrame = useCallback(
    (info: FrameInfo) => {
      'worklet';
      const deltaMs = info.timeSincePreviousFrame ?? 0;
      // Wrap so float precision inside the shader stays stable over long sessions.
      time.value = (time.value + deltaMs / 1000) % 3600;
      lamp.value = followToward(lamp.value, lampTarget(silenceValue.value, energy.value), deltaMs, LAMP_TAU_MS);
      const target = focusValue.value;
      const current = focusNow.value;
      if (Math.abs(target.x - current[0]) > 1e-5 || Math.abs(target.y - current[1]) > 1e-5) {
        focusNow.value = [
          followToward(current[0], target.x, deltaMs, FOCUS_TAU_MS),
          followToward(current[1], target.y, deltaMs, FOCUS_TAU_MS),
        ];
      }
      const background = backgroundNow.value;
      const nextBackground = followRgb(background, backgroundTarget.value, deltaMs);
      if (nextBackground !== background) backgroundNow.value = nextBackground;
      const light = lightNow.value;
      const nextLight = followRgb(light, lightTarget.value, deltaMs);
      if (nextLight !== light) lightNow.value = nextLight;
    },
    [
      backgroundNow,
      backgroundTarget,
      energy,
      focusNow,
      focusValue,
      lamp,
      lightNow,
      lightTarget,
      silenceValue,
      time,
    ],
  );
  const frame = useFrameCallback(onFrame, !reducedMotion);

  useEffect(() => {
    frame.setActive(!reducedMotion);
    if (reducedMotion) {
      time.value = 0;
      lamp.value = REDUCED_MOTION_LAMP;
    }
  }, [frame, lamp, reducedMotion, time]);

  // The ink and accent move with the surge (spec §6: on a slow follower, by a
  // small amount). The ground and lamp colours, the lamp's opening and its
  // centre come from the followers above; under reduced motion straight from
  // their targets, since nothing advances the followers then.
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
      iBackground: reducedMotion ? colors.background : backgroundNow.value,
      iInk: mixRgb(colors.ink, colors.high, surgeValue.value * INK_TINT_MAX),
      iAccent: mixRgb(colors.accent, colors.high, surgeValue.value),
      iFocus: reducedMotion ? [focusValue.value.x, focusValue.value.y] : focusNow.value,
      iLight: reducedMotion ? colors.light : lightNow.value,
      iLamp: reducedMotion ? REDUCED_MOTION_LAMP : lamp.value,
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
      reducedMotion,
      backgroundNow,
      lightNow,
      focusNow,
      focusValue,
      lamp,
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
