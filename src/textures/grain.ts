/**
 * Grain: fine film grain that changes every frame (one hash21 per pixel).
 * With reduced motion iTime is held at 0, so the grain freezes.
 */
export const GRAIN_SKSL = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  float g = hash21(fragCoord + fract(iTime) * 13.0) - 0.5;

  float3 col = iBackground + g * 0.06;
  col += iPulse * 0.04;
  col *= vignette(uv);
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;
