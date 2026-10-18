import { Skia } from '@shopify/react-native-skia';
import type { SkRuntimeEffect } from '@shopify/react-native-skia';

/**
 * Shared SkSL prelude for every scene shader: the uniform block that
 * SkiaShaderScene feeds, plus the hash / noise helpers the scenes build on.
 * Every scene body is appended to this, so it must only declare `main` and
 * its own helpers.
 */
export const SCENE_SKSL_PRELUDE = `
uniform float2 iResolution;
uniform float  iTime;
uniform float  iIntensity;
uniform float  iMotion;
uniform float  iAccent;

// pow(x, 2.0) is undefined for negative x in GLSL/SkSL and yields NaN on
// some GPUs, so squared distances always go through this instead.
float sq(float x) {
  return x * x;
}

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

float fbm3(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + float2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

export function compileSceneEffect(sceneName: string, body: string): SkRuntimeEffect {
  const effect = Skia.RuntimeEffect.Make(SCENE_SKSL_PRELUDE + body);

  if (!effect) {
    throw new Error(`${sceneName}: the SkSL shader failed to compile.`);
  }

  return effect;
}
