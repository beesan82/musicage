import type { SceneProps } from './SceneProps';
import { compileSceneEffect } from './skia/sceneShader';
import { SkiaShaderScene } from './skia/SkiaShaderScene';

/**
 * Ambient: layered horizon, drifting mist and a distant light.
 *
 * Audio mapping (all 0..1):
 *   intensity -> depth: nearer ridges lift, the horizon light widens and
 *                       brightens, the high sky loses its stars to the glow.
 *   motion    -> flow:  parallax scroll speed and mist density.
 *   accent    -> a faint warm tint along the near ground.
 */
const AMBIENT_SKSL = `
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

  // Thin high veil of cloud drifting slowly. It fades out by y = 0.5, so the
  // noise is only evaluated above that, and three octaves are enough for a
  // layer this faint.
  if (y < 0.5) {
    float veil = fbm3(float2(x * 1.6 + flow * 0.4, y * 3.0 + 2.0));
    col += float3(0.10, 0.12, 0.13) * veil * smoothstep(0.5, 0.15, y);
  }

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
  // Every ridge crest sits below y = 0.51 for any audio value (base minus
  // the largest possible ridgeHeight * amp * 2.2), so the upper half of the
  // screen skips the loop and its 24 noise lookups entirely.
  float3 fogColor = float3(0.66, 0.74, 0.72);
  if (y > 0.5) for (int i = 0; i < 4; i++) {
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

  // Ground mist drifting between the ridges; thicker with motion. Only the
  // band between y = 0.55 and 0.95 shows it, and three octaves read the same
  // at this opacity.
  float mistBand = smoothstep(0.55, 0.72, y) * smoothstep(0.95, 0.72, y);
  if (mistBand > 0.0) {
    float mist = fbm3(float2(x * 2.2 - flow * 1.8, y * 6.0 + t * 0.03));
    col = mix(col, fogColor, mistBand * mist * (0.14 + motion * 0.30));
  }

  // Accent: a faint warm tint on the near ground.
  col += float3(0.55, 0.62, 0.45) * iAccent * 0.08 * smoothstep(0.8, 0.95, y);

  // Vignette and a little grain so gradients do not band.
  float2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.65;
  col += (hash21(fragCoord + fract(t) * 13.0) - 0.5) * 0.025;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

const ambientEffect = compileSceneEffect('AmbientSceneSkia', AMBIENT_SKSL);

export function AmbientSceneSkia(props: SceneProps) {
  return (
    <SkiaShaderScene
      backgroundColor="#0A1521"
      effect={ambientEffect}
      testID="scene-ambient"
      {...props}
    />
  );
}
