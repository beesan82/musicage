/**
 * Scan: 2 px scanlines whose phase slips with the beat pulse. No noise. The
 * lines deepen with the mid band, and the pulse slip is gated by the beat
 * confidence.
 */
export const SCAN_SKSL = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  // 1 px dark, 1 px light; a full pulse shifts the pattern by one line.
  float dark = step(1.0, mod(fragCoord.y + clamp(iPulse, 0.0, 1.0) * iConfidence, 2.0));

  float3 col = iBackground * (1.0 - dark * (0.05 + 0.08 * iMid));
  col += iPulse * iConfidence * 0.06;
  col *= vignette(uv);
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;
