import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
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

import type { SceneProps } from './SceneProps';

/**
 * Ambient, rebuilt as a single full-screen SkSL shader.
 *
 * Everything that moves lives on the UI thread: time is advanced by a
 * Reanimated frame callback, the audio-driven uniforms are smoothed shared
 * values, and the Skia canvas reads them through a derived value. The JS
 * thread never re-renders for animation; it only re-renders when the view
 * size changes.
 *
 * Audio mapping (all 0..1):
 *   intensity -> depth: nearer ridges lift, the horizon light widens and
 *                       brightens, the high sky loses its stars to the glow.
 *   motion    -> flow:  parallax scroll speed and mist density.
 *   accent    -> a faint warm tint along the near ground.
 */
const AMBIENT_SKSL = `
uniform float2 iResolution;
uniform float  iTime;
uniform float  iIntensity;
uniform float  iMotion;
uniform float  iAccent;

float hash21(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + float2(1.0, 0.0));
  float c = hash21(i + float2(0.0, 1.0));
  float d = hash21(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + float2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}

float ridgeHeight(float x, float seed, float freq) {
  float broad = fbm(float2(x * freq, seed));
  float detail = vnoise(float2(x * freq * 4.0 + seed, seed * 3.0)) * 0.22;
  return broad + detail - 0.6;
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  float aspect = iResolution.x / iResolution.y;
  float x = uv.x * aspect;
  float y = uv.y;
  float t = iTime;

  float depth = clamp(iIntensity, 0.0, 1.0);
  float motion = clamp(iMotion, 0.0, 1.0);
  float flow = t * (0.012 + motion * 0.09);

  // Sky: deep blue at the top warming toward a hazy horizon.
  float3 skyTop = float3(0.035, 0.07, 0.115);
  float3 skyMid = float3(0.10, 0.20, 0.28);
  float3 horizonHaze = float3(0.62, 0.60, 0.50);
  float3 col = mix(skyTop, skyMid, smoothstep(0.05, 0.55, y));
  col = mix(col, horizonHaze, smoothstep(0.42, 0.70, y) * (0.32 + depth * 0.22));

  // Thin high veil of cloud drifting slowly.
  float veil = fbm(float2(x * 1.6 + flow * 0.4, y * 3.0 + 2.0));
  col += float3(0.10, 0.12, 0.13) * veil * smoothstep(0.5, 0.15, y);

  // Distant light sitting just below the horizon.
  float2 lightPos = float2(aspect * (0.55 + sin(t * 0.07) * 0.04), 0.66 - depth * 0.05);
  float ld = length(float2(x, y) - lightPos);
  float glow = exp(-ld * ld * (10.0 - depth * 3.5)) * (0.22 + depth * 0.40);
  col += float3(0.98, 0.80, 0.56) * glow;

  // Sparse point stars near the top, fading as the scene brightens.
  float2 starSpace = float2(x, y) * 60.0;
  float2 starCell = floor(starSpace);
  float2 starFrac = fract(starSpace);
  float starSeed = hash21(starCell);
  float2 starPos = float2(hash21(starCell + 7.3), hash21(starCell + 2.1));
  float starDist = length(starFrac - starPos);
  float star = step(0.93, starSeed) * smoothstep(0.14, 0.0, starDist) * smoothstep(0.45, 0.0, y);
  float twinkle = 0.55 + 0.45 * sin(t * (0.8 + starSeed * 2.5) + starSeed * 40.0);
  col += float3(0.82, 0.86, 0.95) * star * twinkle * 0.8 * (1.0 - depth * 0.55);

  // Four ridge layers, far to near, each with its own parallax and fog.
  float3 fogColor = float3(0.66, 0.74, 0.72);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float parallax = 0.25 + fi * 0.35;
    float base = 0.60 + fi * 0.085 - depth * (0.02 + fi * 0.035);
    float amp = 0.05 + fi * 0.03;
    float freq = 1.2 - fi * 0.15;
    float h = base - ridgeHeight(x + flow * parallax + fi * 7.0, 3.1 + fi * 5.7, freq) * amp * 2.2;

    float3 ridgeCol = mix(float3(0.11, 0.19, 0.23), float3(0.025, 0.05, 0.06), fi / 3.0);
    float fogAmt = pow(1.0 - fi / 3.0, 1.6) * (0.42 + motion * 0.18);
    ridgeCol = mix(ridgeCol, fogColor, fogAmt);
    // Light on the crest just below the edge. The distance is clamped so the
    // exponent never overflows above the ridge (inf * 0 would be NaN).
    float below = max(y - h, 0.0);
    float crest = exp(-below * 70.0) * 0.10;
    float rim = exp(-below * 160.0) * glow * 1.4;

    float edge = smoothstep(h - 0.003, h + 0.003, y);
    col = mix(col, ridgeCol + crest + rim * float3(0.95, 0.75, 0.52), edge);
  }

  // Ground mist drifting between the ridges; thicker with motion.
  float mist = fbm(float2(x * 2.2 - flow * 1.8, y * 6.0 + t * 0.03));
  float mistBand = smoothstep(0.55, 0.72, y) * smoothstep(0.95, 0.72, y);
  col = mix(col, fogColor, mistBand * mist * (0.14 + motion * 0.30));

  // Accent: a faint warm tint on the near ground.
  col += float3(0.55, 0.62, 0.45) * iAccent * 0.08 * smoothstep(0.8, 0.95, y);

  // Vignette and a little grain so gradients do not band.
  float2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.65;
  col += (hash21(fragCoord + fract(t) * 13.0) - 0.5) * 0.025;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

function compileAmbientEffect() {
  const effect = Skia.RuntimeEffect.Make(AMBIENT_SKSL);
  if (!effect) {
    throw new Error('AmbientSceneSkia: the ambient SkSL shader failed to compile.');
  }
  return effect;
}

const ambientEffect = compileAmbientEffect();

const SMOOTHING = { duration: 120, easing: Easing.out(Easing.cubic) };

export function AmbientSceneSkia({ visual, reducedMotion = false }: SceneProps) {
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
    <View onLayout={onLayout} style={styles.root} testID="scene-ambient">
      {size.width > 0 && size.height > 0 ? (
        <Canvas style={styles.canvas} testID="ambient-skia-canvas">
          <Fill>
            <Shader source={ambientEffect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A1521',
    flex: 1,
    overflow: 'hidden',
  },
  canvas: {
    ...StyleSheet.absoluteFill,
  },
});
