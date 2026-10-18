import type { SceneProps } from './SceneProps';
import { compileSceneEffect } from './skia/sceneShader';
import { SkiaShaderScene } from './skia/SkiaShaderScene';

/**
 * Dance: a perspective floor grid streaming toward the viewer under
 * concentric rings that pulse on a steady beat.
 *
 * Audio mapping (all 0..1):
 *   intensity -> the rings grow, the core fills, the horizon glows.
 *   motion    -> the floor streams faster and the beat pulse is faster and
 *                deeper.
 *   accent    -> the rings and grid shift from cyan toward violet-white and
 *                the grid gets brighter.
 */
const DANCE_SKSL = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  float aspect = iResolution.x / iResolution.y;
  float2 p = float2(uv.x * aspect, uv.y);
  float t = iTime;

  float depth = clamp(iIntensity, 0.0, 1.0);
  float motion = clamp(iMotion, 0.0, 1.0);
  float accent = clamp(iAccent, 0.0, 1.0);

  float3 col = float3(0.035 + depth * 0.04, 0.047, 0.12 + accent * 0.13);
  float3 lineCol = float3(0.87, 0.886, 1.0);
  float gridAlpha = 0.08 + accent * 0.2;
  float horizon = 0.56;

  // Above the horizon: faint columns, fading out toward the horizon line.
  float vline = smoothstep(0.004, 0.0, abs(fract(p.x * 6.25) - 0.5) / 6.25);
  col += lineCol * vline * gridAlpha * (1.0 - smoothstep(horizon - 0.08, horizon, uv.y)) * 0.6;

  // Below the horizon: a perspective floor streaming toward the viewer.
  float floorMask = step(horizon, uv.y);
  float z = 1.0 / max(uv.y - horizon, 0.001) ;
  float fx = (p.x - aspect * 0.5) * z * 0.9;
  float fz = z * 0.35 + t * (0.25 + motion * 1.6);
  float lx = exp(-sq((fract(fx) - 0.5) * 12.0));
  float lz = exp(-sq((fract(fz) - 0.5) * 12.0));
  float floorFade = smoothstep(0.0, 0.22, uv.y - horizon);
  col += lineCol * max(lx, lz) * gridAlpha * floorFade * floorMask * 1.4;

  // Horizon glow.
  float3 ringCol = float3(0.435 + accent * 0.44, 0.85 - depth * 0.25, 1.0);
  col += ringCol * exp(-sq((uv.y - horizon) * 40.0)) * (0.08 + depth * 0.15);

  // Rings pulsing on the beat.
  float2 c = float2(aspect * 0.5, 0.44);
  float d = length(p - c);
  float phase = t * (4.2 + motion * 5.0);
  float pulse = 0.5 + 0.5 * sin(phase);
  float scale = 0.84 + depth * 0.16 + pulse * (0.08 + motion * 0.18);
  float alpha = 0.45 + depth * 0.24 + pulse * (0.1 + motion * 0.2);
  float rings = 0.0;
  rings += exp(-sq((d - 0.235 * scale) * 400.0)) * 0.42;
  rings += exp(-sq((d - 0.162 * scale) * 260.0)) * 0.62;
  rings += exp(-sq((d - 0.086 * scale) * 180.0)) * 0.9;
  float glow = exp(-d * d * 30.0) * (0.12 + depth * 0.18 + pulse * 0.06);
  float core = smoothstep(0.03 * scale, 0.02 * scale, d) * (0.3 + depth * 0.4);
  col += ringCol * (rings * alpha + glow + core);

  // A soft flash on the beat peak.
  col += ringCol * pow(pulse, 8.0) * 0.03 * motion;

  // Vignette and grain.
  float2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.7;
  col += (hash21(fragCoord + fract(t) * 19.0) - 0.5) * 0.02;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

const danceEffect = compileSceneEffect('DanceSceneSkia', DANCE_SKSL);

export function DanceSceneSkia(props: SceneProps) {
  return (
    <SkiaShaderScene backgroundColor="#090C1F" effect={danceEffect} testID="scene-dance" {...props} />
  );
}
