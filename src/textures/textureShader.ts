import { Skia } from '@shopify/react-native-skia';
import type { SkRuntimeEffect } from '@shopify/react-native-skia';

import type { Texture } from '../direction/types';
import { GRAIN_SKSL } from './grain';
import { PAPER_SKSL } from './paper';
import { SCAN_SKSL } from './scan';
import { VOID_SKSL } from './void';

/**
 * Where the texture crossfade sits on iEnergy (design spec §6, 2026-11-07):
 * below `low` a texture shows its calm face unchanged (a quiet song looks
 * exactly as it did before stage 6), above `high` its lively face, and in
 * between the two are mixed with a smoothstep. iEnergy is the beat engine's
 * 400 ms follower of the ear's RMS (dBFS -72..-12 linearised, then square
 * rooted), so playing music tends to sit in the upper half of 0..1; the
 * range is a first guess to be read against the device.
 */
export const TEXTURE_BLEND_RANGE = { low: 0.35, high: 0.85 } as const;

/** The TS twin of the prelude's `energyBlend()`, for tests and tuning. */
export function energyBlend(energy: number): number {
  const { low, high } = TEXTURE_BLEND_RANGE;
  const e = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  const x = (e - low) / (high - low);
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

/**
 * Shared SkSL prelude for every texture shader: the uniform block that
 * TextureBackground feeds, plus the hash / noise helpers the textures build
 * on. Every texture body is appended to this, so it must only declare `main`
 * and its own helpers.
 *
 * iInk and iAccent are declared for completeness but the textures paint from
 * iBackground only; ink and accent belong to the lyrics drawn on top.
 *
 * iDrop is the recognition drop's dip (0..1, see dropDip below): a one-off
 * darkening that every texture applies to its final colour.
 *
 * energyBlend / blendTextures are the stage 6 crossfade: every texture is
 * written as two faces (calm, lively) of the same kind, built to share one
 * mean luminance, and mixes them by the energy. The texture kinds stay four.
 */
export const TEXTURE_SKSL_PRELUDE = `
uniform float2 iResolution;
uniform float  iTime;
uniform float  iPulse;
uniform float  iEnergy;
uniform float  iLow;
uniform float  iMid;
uniform float  iHigh;
uniform float  iConfidence;
uniform float  iDrop;
uniform float3 iBackground;
uniform float3 iInk;
uniform float3 iAccent;

// The recognition drop: the frame sinks towards black by iDrop and comes
// back (iDrop is 0 at every other time).
float3 dropDip(float3 col) {
  return col * (1.0 - clamp(iDrop, 0.0, 1.0));
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

// The crossfade weight between a texture's calm face (0) and its lively face
// (1). iEnergy is a slow follower, so this never reads as a switch; below the
// low end the calm face shows unchanged, above the high end the lively one.
float energyBlend() {
  return smoothstep(${TEXTURE_BLEND_RANGE.low.toFixed(2)}, ${TEXTURE_BLEND_RANGE.high.toFixed(2)}, clamp(iEnergy, 0.0, 1.0));
}

// Linear crossfade of the two faces. Each texture builds both faces around
// the same mean luminance, so mixing them leaves the frame's mean, and its
// black base, where they were.
float3 blendTextures(float3 calm, float3 lively, float t) {
  return mix(calm, lively, clamp(t, 0.0, 1.0));
}
`;

/**
 * Compiles one texture body against the shared prelude. Returns null when
 * Skia rejects the shader instead of throwing: a texture is decoration, and
 * a device that cannot compile it must still get a stage (TextureBackground
 * falls back to a plain fill).
 */
export function compileTextureEffect(body: string): SkRuntimeEffect | null {
  return Skia.RuntimeEffect.Make(TEXTURE_SKSL_PRELUDE + body);
}

const TEXTURE_BODIES: Record<Texture, string> = {
  paper: PAPER_SKSL,
  grain: GRAIN_SKSL,
  void: VOID_SKSL,
  scan: SCAN_SKSL,
};

const effectCache = new Map<Texture, SkRuntimeEffect | null>();

/**
 * The compiled effect for a texture, or null when it failed to compile.
 *
 * Compilation is lazy on purpose: this module sits on the app bundle's
 * import chain (App -> MusicageApp -> LyricStage -> TextureBackground), so
 * compiling at module scope would run Skia before the first frame and take
 * the whole app down with it if a shader failed. Each texture compiles on
 * first use and the result (including failure) is cached.
 */
export function getTextureEffect(texture: Texture): SkRuntimeEffect | null {
  if (!effectCache.has(texture)) {
    effectCache.set(texture, compileTextureEffect(TEXTURE_BODIES[texture]));
  }

  return effectCache.get(texture) ?? null;
}

/** How long the recognition drop's dip lasts, from the fire time. */
export const DROP_DIP_MS = 500;
const DROP_DIP_ATTACK_MS = 80;

/**
 * The recognition drop's dip, 0..1, `sinceMs` after the drop fired: the frame
 * sinks to black within 80 ms and recovers linearly by DROP_DIP_MS. 0 before
 * the fire and after the recovery, so it is a single, one-off transition
 * (design spec §7), never a repeating flash.
 */
export function dropDip(sinceMs: number): number {
  'worklet';
  if (sinceMs <= 0 || sinceMs >= DROP_DIP_MS) return 0;
  if (sinceMs < DROP_DIP_ATTACK_MS) return sinceMs / DROP_DIP_ATTACK_MS;
  return 1 - (sinceMs - DROP_DIP_ATTACK_MS) / (DROP_DIP_MS - DROP_DIP_ATTACK_MS);
}

const HEX_COLOR = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/;

export type Rgb01 = [number, number, number];

/** Linear mix of two float3 colours, `t` clamped to 0..1 (the surge's palette change, on the UI thread). */
export function mixRgb(a: Rgb01, b: Rgb01, t: number): Rgb01 {
  'worklet';
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** '#RRGGBB' -> [r, g, b] in 0..1, the form SkSL float3 uniforms take. */
export function hexToRgb01(hex: string): Rgb01 {
  const match = HEX_COLOR.exec(hex);

  if (!match) {
    throw new Error(`hexToRgb01: expected #RRGGBB, got ${hex}`);
  }

  const [, r = '0', g = '0', b = '0'] = match;
  return [parseInt(r, 16) / 255, parseInt(g, 16) / 255, parseInt(b, 16) / 255];
}
