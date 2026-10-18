import type { SceneProps } from './SceneProps';
import { compileSceneEffect } from './skia/sceneShader';
import { SkiaShaderScene } from './skia/SkiaShaderScene';

/**
 * Pop: a poster of three bouncing colour cards over a halftone ground.
 *
 * Audio mapping (all 0..1):
 *   intensity -> the ground warms and the pink card becomes opaque.
 *   motion    -> the cards bounce higher and faster and squash more.
 *   accent    -> the ground goes violet, the blue card becomes opaque and
 *                the headline ring warms.
 */
const POP_SKSL = `
float sdRoundBox(float2 p, float2 b, float r) {
  float2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

float2 rotate(float2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return float2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float cardShape(float2 p, float2 center, float2 halfSize, float angle, float edge) {
  float d = sdRoundBox(rotate(p - center, -angle), halfSize, 0.018);
  return 1.0 - smoothstep(-edge, edge, d);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  float aspect = iResolution.x / iResolution.y;
  float2 p = float2(uv.x * aspect, uv.y);
  float t = iTime;
  float edge = 1.2 / iResolution.y;

  float depth = clamp(iIntensity, 0.0, 1.0);
  float motion = clamp(iMotion, 0.0, 1.0);
  float accent = clamp(iAccent, 0.0, 1.0);

  // Ground: deep plum, warming with intensity and going violet with accent.
  float3 col = float3(0.09 + depth * 0.09, 0.08, 0.15 + accent * 0.14);

  // Halftone dots that grow toward the bottom of the poster.
  float2 ht = p * 48.0;
  float htDot = length(fract(ht) - 0.5);
  float htRadius = 0.12 + uv.y * 0.22;
  col += smoothstep(htRadius, htRadius - 0.08, htDot) * 0.05;

  // Headline: a bold ring and a dot where the old scene had its wordmark.
  float3 headline = float3(0.91 + accent * 0.08, 0.90 - depth * 0.12, 0.85 - motion * 0.13);
  float2 ringCenter = float2(aspect * 0.22, 0.165);
  float ringD = abs(length(p - ringCenter) - 0.10);
  col = mix(col, headline, 1.0 - smoothstep(0.016, 0.016 + edge * 2.0, ringD));
  col = mix(col, headline, 1.0 - smoothstep(0.022, 0.022 + edge * 2.0, length(p - float2(aspect * 0.22 + 0.155, 0.165))));

  // Bounce shared by the cards; the blue one moves against the others.
  float phase = t * (2.6 + motion * 3.4);
  float bounce = sin(phase);
  float lift = bounce * (0.012 + motion * 0.03);
  float squash = 1.0 + bounce * (0.01 + motion * 0.025);

  float2 pinkC = float2(aspect * 0.74, 0.40 - lift);
  float2 pinkH = float2(aspect * 0.37 * squash, 0.104 / squash);
  float2 blueC = float2(aspect * 0.24, 0.69 + lift * 0.6);
  float2 blueH = float2(aspect * 0.335, 0.084);
  float2 yellowC = float2(aspect * 0.66, 0.84 - lift);
  float2 yellowH = float2(aspect * 0.26 * squash, 0.071 / squash);
  float2 shadowOffset = float2(0.012, 0.022);

  // Pink (8 degrees).
  col *= 1.0 - cardShape(p, pinkC + shadowOffset, pinkH, 0.1396, 0.025) * 0.45;
  col = mix(col, float3(0.925, 0.373, 0.565), cardShape(p, pinkC, pinkH, 0.1396, edge) * (0.72 + depth * 0.28));
  // Blue (-12 degrees).
  col *= 1.0 - cardShape(p, blueC + shadowOffset, blueH, -0.2094, 0.025) * 0.45;
  col = mix(col, float3(0.353, 0.451, 0.925), cardShape(p, blueC, blueH, -0.2094, edge) * (0.66 + accent * 0.34));
  // Yellow (5 degrees).
  col *= 1.0 - cardShape(p, yellowC + shadowOffset, yellowH, 0.0873, 0.025) * 0.45;
  col = mix(col, float3(0.945, 0.784, 0.325), cardShape(p, yellowC, yellowH, 0.0873, edge) * (0.65 + motion * 0.35));

  // Light grain.
  col += (hash21(fragCoord + fract(t) * 11.0) - 0.5) * 0.02;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

const popEffect = compileSceneEffect('PopSceneSkia', POP_SKSL);

export function PopSceneSkia(props: SceneProps) {
  return (
    <SkiaShaderScene backgroundColor="#171425" effect={popEffect} testID="scene-pop" {...props} />
  );
}
