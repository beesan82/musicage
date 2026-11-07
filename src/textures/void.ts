/**
 * Void: an almost flat field of the background colour with a very faint lift
 * toward the centre. No noise. The lift breathes with the low band (gated by
 * the beat confidence) and widens slightly with the energy.
 */
export const VOID_SKSL = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  float lift = (1.0 - smoothstep(0.0, 0.7 + 0.25 * iEnergy, length(uv - 0.5)))
    * (0.02 + 0.05 * iLow * iConfidence);

  float3 col = iBackground + lift;
  col += iPulse * iConfidence * 0.06;
  col *= vignette(uv);
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;
