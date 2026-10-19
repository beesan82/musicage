/**
 * Void: an almost flat field of the background colour with a very faint lift
 * toward the centre. No noise.
 */
export const VOID_SKSL = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  float lift = (1.0 - smoothstep(0.0, 0.7, length(uv - 0.5))) * 0.025;

  float3 col = iBackground + lift;
  col += iPulse * 0.04;
  col *= vignette(uv);
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;
