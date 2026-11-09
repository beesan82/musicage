/**
 * The void's lamp (visual overhaul spec §3b.2): sharper than the shared
 * surface's. The pool is raised to POWER, which gathers it towards its
 * centre, and its shut-lamp strength is BASE instead of LAMP_BASE (the gain
 * is the shared LAMP_GAIN). surfaceModel.ts mirrors this as `voidSurface`.
 */
export const VOID_LAMP = { BASE: 0.09, POWER: 1.6 } as const;

/**
 * Void (lacquer): no material at all, only a sharp lamp on the ground, so
 * the field reads as a deep glossy surface lit in one place. No noise.
 *
 * Two faces (stage 6): calm is the bare lacquer (a material of 1); lively
 * leans the field with a faint planar tilt that turns slowly with time,
 * +-0.03 across the frame's half-width. The tilt is zero-mean over the frame,
 * so the crossfade does not move the mean. No noise in either face, so both
 * are always evaluated.
 */
export const VOID_SKSL = `
// The void's sharp lamp: the pool gathered to its centre, a stronger base.
float3 voidSurface(float2 uv) {
  float pool = pow(lampPool(uv), ${VOID_LAMP.POWER.toFixed(1)});
  return iBackground + iLight * (pool * lampStrength(${VOID_LAMP.BASE.toFixed(2)}));
}

// Calm face: bare lacquer.
float3 voidCalm(float2 uv) {
  return float3(1.0);
}

// Lively face: a slow, zero-mean lean of the field.
float3 voidLively(float2 uv) {
  float2 d = uv - 0.5;
  float a = iTime * 0.08;
  float tilt = dot(d, float2(cos(a), sin(a))) * 0.06;
  return float3(1.0 + tilt);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  float3 col = voidSurface(uv) * blendTextures(voidCalm(uv), voidLively(uv), energyBlend());
  col += beatLift(uv);
  col *= frame(uv);
  return half4(half3(clamp(dropDip(col), 0.0, 1.0)), 1.0);
}
`;
