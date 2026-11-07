/**
 * Paper: long low-frequency fibres on the background colour with a faint
 * broad mottle. One fbm3 (fibres) plus one vnoise (mottle) per pixel. The
 * low band slowly tightens the fibres' stretch, as if the paper tensed.
 */
export const PAPER_SKSL = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  // Stretched horizontally so the noise reads as fibres rather than clouds.
  float fibre = fbm3(fragCoord * float2(0.006, mix(0.045, 0.03, iLow)));
  float mottle = vnoise(fragCoord * 0.004 + float2(31.0, 7.0));

  float3 col = iBackground * (0.95 + fibre * 0.08 + mottle * 0.03);
  col += iPulse * iConfidence * 0.06;
  col *= vignette(uv);
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;
