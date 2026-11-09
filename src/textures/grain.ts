/**
 * Grain (film): fine grain that changes every frame (one hash21 per pixel).
 * With reduced motion iTime is held at 0, so the grain freezes. The grain
 * roughens with the high band (cymbals, hats).
 *
 * The grain is a material, a multiplier on the lit surface (visual overhaul
 * spec §3b.2): it shows inside the lamp's pool and fades with it towards the
 * corners, and it never clips against a dark ground the way added noise did.
 *
 * Two faces (stage 6): calm is the fine grain; lively pulls the grain into
 * short horizontal streaks, as if it were drifting towards scanlines. Both
 * are 1 + zero-mean noise, so the crossfade does not move the mean. Both
 * faces cost one or two hashes per pixel, so they are always evaluated
 * together.
 */
export const GRAIN_SKSL = `
// Calm face: per-pixel film grain.
float3 grainCalm(float2 fragCoord) {
  float g = hash21(fragCoord + fract(iTime) * 13.0) - 0.5;
  return float3(1.0 + g * (0.14 + 0.10 * iHigh));
}

// Lively face: the grain gathers into 24 x 1 px streaks (one hash per cell),
// still refreshed every frame and still zero-mean.
float3 grainLively(float2 fragCoord) {
  float g = hash21(fragCoord + fract(iTime) * 13.0) - 0.5;
  float2 cell = float2(floor(fragCoord.x / 24.0), fragCoord.y);
  float streak = hash21(cell + fract(iTime) * 13.0) - 0.5;
  return float3(1.0 + mix(g, streak, 0.65) * (0.14 + 0.10 * iHigh));
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  float3 col = surface(uv) * blendTextures(grainCalm(fragCoord), grainLively(fragCoord), energyBlend());
  col += beatLift(uv);
  col *= frame(uv);
  return half4(half3(clamp(dropDip(col), 0.0, 1.0)), 1.0);
}
`;
