import type { SceneProps } from './SceneProps';
import { compileSceneEffect } from './skia/sceneShader';
import { SkiaShaderScene } from './skia/SkiaShaderScene';

/**
 * Rock: a torn broadcast. Scanlines, heavy grain, horizontal tearing and a
 * jagged signal line across three slabs that stand in for the old
 * STATIC / EDGE / VOLUME fragments.
 *
 * Audio mapping (all 0..1):
 *   intensity -> the signal line swings wider and burns brighter, the
 *                bottom slab becomes opaque.
 *   motion    -> tearing happens more often and displaces further; grain
 *                gets rougher.
 *   accent    -> the signal colour shifts from white-hot toward orange and
 *                the grain gets heavier.
 */
const ROCK_SKSL = `
float box(float2 p, float2 lo, float2 hi) {
  float2 s = step(lo, p) * step(p, hi);
  return s.x * s.y;
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  float aspect = iResolution.x / iResolution.y;
  float t = iTime;

  float depth = clamp(iIntensity, 0.0, 1.0);
  float motion = clamp(iMotion, 0.0, 1.0);
  float accent = clamp(iAccent, 0.0, 1.0);

  // Horizontal tearing: each band may jump sideways on this frame.
  float band = floor(uv.y * 16.0);
  float frame = floor(t * (6.0 + motion * 10.0));
  float bandSeed = hash21(float2(band, frame));
  float tear = step(0.92 - motion * 0.45, bandSeed);
  float shift = (hash21(float2(frame, band + 3.0)) - 0.5) * tear * (0.04 + motion * 0.12);
  float2 q = float2((uv.x + shift) * aspect, uv.y);

  float3 col = float3(0.065);
  col *= 0.86 + 0.14 * sin(fragCoord.y * 1.5708);

  float3 signal = float3(1.0, 0.92 - accent * 0.33, 0.86 - depth * 0.28);

  // Slab 1: top left, solid.
  float slab1 = box(q, float2(-0.05 * aspect, 0.18), float2(0.55 * aspect, 0.30));
  col = mix(col, signal * 0.85, slab1 * (0.75 + depth * 0.25));

  // Slab 2: right, outlined only.
  float outer = box(q, float2(0.45 * aspect, 0.42), float2(1.08 * aspect, 0.56));
  float inner = box(q, float2(0.45 * aspect + 0.004, 0.424), float2(1.08 * aspect - 0.004, 0.556));
  col = mix(col, signal, (outer - inner) * 0.9);
  col = mix(col, float3(0.09), inner * 0.8);

  // Slab 3: bottom left, off-white.
  float slab3 = box(q, float2(-0.02 * aspect, 0.65), float2(0.58 * aspect, 0.77));
  col = mix(col, float3(0.957, 0.941, 0.902), slab3 * (0.68 + depth * 0.32));

  // Signal line: a jagged trace across the middle, swinging with intensity.
  float wave = (vnoise(float2(q.x * 7.0 + t * 4.0, 1.7)) - 0.5) * (0.06 + depth * 0.16);
  wave += (vnoise(float2(q.x * 40.0 + t * 9.0, 4.2)) - 0.5) * 0.03 * motion;
  float ly = abs(uv.y - 0.5 - wave);
  float line = exp(-ly * ly * 60000.0);
  col += signal * line * (0.6 + depth * 0.6);
  col += signal * exp(-ly * ly * 3000.0) * 0.15;

  // Grain and a frame flicker.
  col += (hash21(fragCoord * 0.7 + fract(t) * 31.0) - 0.5) * (0.12 + accent * 0.2 + motion * 0.1);
  col *= 0.95 + 0.05 * step(0.6, hash21(float2(frame, 1.0)));

  // Strong vignette.
  float2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.9;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

const rockEffect = compileSceneEffect('RockSceneSkia', ROCK_SKSL);

export function RockSceneSkia(props: SceneProps) {
  return (
    <SkiaShaderScene backgroundColor="#111111" effect={rockEffect} testID="scene-rock" {...props} />
  );
}
