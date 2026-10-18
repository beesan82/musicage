import { Skia } from '@shopify/react-native-skia';
import type { SkRuntimeEffect } from '@shopify/react-native-skia';

import type { Texture } from '../direction/types';
import { GRAIN_SKSL } from './grain';
import { PAPER_SKSL } from './paper';
import { SCAN_SKSL } from './scan';
import { VOID_SKSL } from './void';

/**
 * Shared SkSL prelude for every texture shader: the uniform block that
 * TextureBackground feeds, plus the hash / noise helpers the textures build
 * on. Every texture body is appended to this, so it must only declare `main`
 * and its own helpers.
 *
 * iInk and iAccent are declared for completeness but the textures paint from
 * iBackground only; ink and accent belong to the lyrics drawn on top.
 */
export const TEXTURE_SKSL_PRELUDE = `
uniform float2 iResolution;
uniform float  iTime;
uniform float  iPulse;
uniform float  iEnergy;
uniform float3 iBackground;
uniform float3 iInk;
uniform float3 iAccent;

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

// Edge darkening shared by every texture; energy eases it slightly so loud
// passages open the frame up.
float vignette(float2 uv) {
  float d = length(uv - 0.5);
  float strength = max(0.0, 0.18 - clamp(iEnergy, 0.0, 1.0) * 0.03);
  return 1.0 - smoothstep(0.3, 0.85, d) * strength;
}
`;

export function compileTextureEffect(name: Texture, body: string): SkRuntimeEffect {
  const effect = Skia.RuntimeEffect.Make(TEXTURE_SKSL_PRELUDE + body);

  if (!effect) {
    throw new Error(`${name}: the SkSL texture shader failed to compile.`);
  }

  return effect;
}

export const TEXTURE_EFFECTS: Record<Texture, SkRuntimeEffect> = {
  paper: compileTextureEffect('paper', PAPER_SKSL),
  grain: compileTextureEffect('grain', GRAIN_SKSL),
  void: compileTextureEffect('void', VOID_SKSL),
  scan: compileTextureEffect('scan', SCAN_SKSL),
};

const HEX_COLOR = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/;

/** '#RRGGBB' -> [r, g, b] in 0..1, the form SkSL float3 uniforms take. */
export function hexToRgb01(hex: string): [number, number, number] {
  const match = HEX_COLOR.exec(hex);

  if (!match) {
    throw new Error(`hexToRgb01: expected #RRGGBB, got ${hex}`);
  }

  const [, r = '0', g = '0', b = '0'] = match;
  return [parseInt(r, 16) / 255, parseInt(g, 16) / 255, parseInt(b, 16) / 255];
}
