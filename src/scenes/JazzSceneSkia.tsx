import type { SceneProps } from './SceneProps';
import { compileSceneEffect } from './skia/sceneShader';
import { SkiaShaderScene } from './skia/SkiaShaderScene';

/**
 * Jazz: a dark club with one smoky spotlight from the upper right.
 *
 * Audio mapping (all 0..1):
 *   intensity -> the beam and the pool of light on the floor brighten and widen
 *                (the bass "breathing" of the old scene).
 *   motion    -> smoke drifts faster and dust in the beam flickers more
 *                (the percussion).
 *   accent    -> a gold horn line sweeping across the beam gets brighter.
 */
const JAZZ_SKSL = `
float sdSegment(float2 p, float2 a, float2 b) {
  float2 pa = p - a;
  float2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  float aspect = iResolution.x / iResolution.y;
  float2 p = float2(uv.x * aspect, uv.y);
  float t = iTime;

  float depth = clamp(iIntensity, 0.0, 1.0);
  float motion = clamp(iMotion, 0.0, 1.0);
  float accent = clamp(iAccent, 0.0, 1.0);

  // Room: near-black violet above, warm umber toward the floor.
  float3 col = mix(float3(0.06, 0.055, 0.075), float3(0.16, 0.12, 0.10), smoothstep(0.2, 0.95, uv.y));

  // Spotlight cone from the upper right, breathing slowly with the bass.
  float breathe = 0.86 + 0.14 * sin(t * (1.6 + motion * 1.2));
  float2 src = float2(aspect * 1.02, -0.12);
  float2 dir = normalize(float2(-0.58, 1.0));
  float2 rel = p - src;
  float along = dot(rel, dir);
  float side = length(rel - dir * along);
  float coneWidth = 0.05 + along * 0.30;
  float cone = smoothstep(coneWidth, coneWidth * 0.3, side) * smoothstep(0.0, 0.25, along);
  cone *= 0.3 + 0.7 * exp(-along * 1.1);
  float smoke = fbm3(float2(p.x * 2.4 + t * 0.06, p.y * 2.4 - t * (0.05 + motion * 0.12)));
  float beam = cone * (0.35 + smoke * 0.9) * (0.4 + depth * 0.8) * breathe;
  col += float3(0.88, 0.66, 0.36) * beam;

  // Dust in the beam that flickers faster when the room is moving.
  float2 dustSpace = p * 70.0 + float2(0.0, t * (2.0 + motion * 8.0));
  float2 dustCell = floor(dustSpace);
  float dustSeed = hash21(dustCell);
  float2 dustPos = float2(hash21(dustCell + 3.7), hash21(dustCell + 9.1));
  float dust = step(0.94, dustSeed) * smoothstep(0.18, 0.0, length(fract(dustSpace) - dustPos));
  dust *= 0.5 + 0.5 * sin(t * (6.0 + motion * 14.0) + dustSeed * 50.0);
  col += float3(1.0, 0.85, 0.6) * dust * cone * (0.3 + motion * 0.9);

  // Stage floor with a warm pool of light under the beam.
  float floorEdge = 0.78 + sin(p.x * 3.0) * 0.012;
  float floorMask = smoothstep(floorEdge - 0.004, floorEdge + 0.004, uv.y);
  float pool = exp(-sq((p.x - aspect * 0.40) / (0.22 + depth * 0.14)) * 2.5);
  pool *= smoothstep(floorEdge, floorEdge + 0.12, uv.y) * (0.25 + depth * 0.55) * breathe;
  float3 floorCol = float3(0.045, 0.04, 0.045) + float3(0.62, 0.46, 0.26) * pool;
  floorCol += float3(0.35, 0.3, 0.26) * exp(-sq((uv.y - floorEdge - 0.03) * 120.0)) * 0.3;
  col = mix(col, floorCol, floorMask);

  // Horn: a gold streak sweeping slowly across the beam.
  float sweep = sin(t * 0.35) * 0.05;
  float2 hornA = float2(aspect * 0.22, 0.60 + sweep);
  float2 hornB = float2(aspect * 0.86, 0.30 + sweep);
  float d = sdSegment(p, hornA, hornB);
  float horn = exp(-d * d * 9000.0) * (0.3 + accent * 0.9);
  float hornGlow = exp(-d * d * 300.0) * accent * 0.25;
  col += float3(0.95, 0.82, 0.55) * (horn + hornGlow);

  // Vignette and grain.
  float2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.8;
  col += (hash21(fragCoord + fract(t) * 17.0) - 0.5) * 0.03;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

const jazzEffect = compileSceneEffect('JazzSceneSkia', JAZZ_SKSL);

export function JazzSceneSkia(props: SceneProps) {
  return (
    <SkiaShaderScene backgroundColor="#131217" effect={jazzEffect} testID="scene-jazz" {...props} />
  );
}
