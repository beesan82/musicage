/**
 * Void: an almost flat field of the background colour with a very faint lift
 * toward the centre. No noise. The lift breathes with the low band (gated by
 * the beat confidence) and widens slightly with the energy.
 *
 * Two faces (stage 6): calm is the broad lift as before; lively gathers the
 * lift into a tighter, brighter pool and leans the field with a faint planar
 * tilt that turns slowly with time. The tilt is zero-mean over the frame, and
 * the pool's smaller area is paid back by its higher peak (about 2.4x: the
 * calm lift covers roughly half the frame at a 0.7 radius, the pool a
 * fifth at 0.45), so the mean luminance stays close to the calm face's. No
 * noise in either face, so both are always evaluated.
 */
export const VOID_SKSL = `
// Calm face: a broad lift towards the centre.
float3 voidCalm(float2 uv) {
  float lift = (1.0 - smoothstep(0.0, 0.7 + 0.25 * iEnergy, length(uv - 0.5)))
    * (0.02 + 0.05 * iLow * iConfidence);
  return iBackground + lift;
}

// Lively face: a tighter pool plus a slow, zero-mean lean of the field.
float3 voidLively(float2 uv) {
  float2 d = uv - 0.5;
  float lift = (1.0 - smoothstep(0.0, 0.45, length(d)))
    * (0.048 + 0.12 * iLow * iConfidence);
  float a = iTime * 0.08;
  float tilt = dot(d, float2(cos(a), sin(a))) * 0.03;
  return iBackground + lift + tilt;
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  float3 col = blendTextures(voidCalm(uv), voidLively(uv), energyBlend());
  col += iPulse * iConfidence * 0.06;
  col *= vignette(uv);
  return half4(half3(clamp(dropDip(col), 0.0, 1.0)), 1.0);
}
`;
