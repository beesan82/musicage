/**
 * Grain: fine film grain that changes every frame (one hash21 per pixel).
 * With reduced motion iTime is held at 0, so the grain freezes. The grain
 * roughens with the high band (cymbals, hats), and the beat lift is gated by
 * the beat confidence so an uncertain beat leaves the field quiet.
 *
 * Two faces (stage 6): calm is the fine grain as before; lively pulls the
 * grain into short horizontal streaks, as if it were drifting towards
 * scanlines. Both are zero-mean noise on iBackground, so the crossfade does
 * not move the mean luminance. Both faces cost one or two hashes per pixel,
 * so they are always evaluated together.
 */
export const GRAIN_SKSL = `
// Calm face: per-pixel film grain.
float3 grainCalm(float2 fragCoord) {
  float g = hash21(fragCoord + fract(iTime) * 13.0) - 0.5;
  return iBackground + g * (0.04 + 0.06 * iHigh);
}

// Lively face: the grain gathers into 24 x 1 px streaks (one hash per cell),
// still refreshed every frame and still zero-mean.
float3 grainLively(float2 fragCoord) {
  float g = hash21(fragCoord + fract(iTime) * 13.0) - 0.5;
  float2 cell = float2(floor(fragCoord.x / 24.0), fragCoord.y);
  float streak = hash21(cell + fract(iTime) * 13.0) - 0.5;
  return iBackground + mix(g, streak, 0.65) * (0.04 + 0.06 * iHigh);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  float3 col = blendTextures(grainCalm(fragCoord), grainLively(fragCoord), energyBlend());
  col += iPulse * iConfidence * 0.06;
  col *= vignette(uv);
  return half4(half3(clamp(dropDip(col), 0.0, 1.0)), 1.0);
}
`;
