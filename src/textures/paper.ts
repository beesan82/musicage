/**
 * Paper (washi): long low-frequency fibres with a faint broad mottle and
 * laid lines (a 6 px horizontal chain, the mould's mark). One fbm3 (fibres)
 * plus one vnoise (mottle) per pixel. The low band slowly tightens the
 * fibres' stretch, as if the paper tensed.
 *
 * The paper is a material, a multiplier on the lit surface (visual overhaul
 * spec §3b.2): fibres and lines show inside the lamp's pool and sink with it
 * towards the corners.
 *
 * Two faces (stage 6): calm is the soft sheet; lively is the sheet pulled
 * taut: thinner fibres with more contrast around the same mean, and the
 * mottle flattened to its mean. fbm3 is the dearest thing any texture
 * evaluates (three vnoise, twelve hashes per pixel), so outside the
 * crossfade only the face that shows is computed: the branch is on a
 * uniform-derived value, so it is coherent across the whole frame and costs
 * no divergence. Inside the crossfade both faces run.
 *
 * fbm3's mean is 0.5 * (0.5 + 0.25 + 0.125) = 0.4375 (vnoise averages 0.5),
 * and vnoise's is 0.5; both faces are centred on those means so the material
 * averages 1 and the crossfade does not move the mean. The laid lines darken
 * every other 3 px band by 3%, so the sheet as a whole averages 0.985.
 */
export const PAPER_SKSL = `
// Calm face: soft fibres, stretched horizontally so the noise reads as fibres
// rather than clouds, plus the broad mottle (+-0.04).
float3 paperCalm(float2 fragCoord) {
  float fibre = fbm3(fragCoord * float2(0.006, mix(0.045, 0.03, iLow)));
  float mottle = vnoise(fragCoord * 0.004 + float2(31.0, 7.0));
  return float3((1.0 + (fibre - 0.4375) * 0.45) * (1.0 + (mottle - 0.5) * 0.08));
}

// Lively face: the fibres tense (tighter vertical scale, 1.6x contrast about
// fbm3's mean of 0.4375) and the mottle sits at its mean (a factor of 1).
float3 paperLively(float2 fragCoord) {
  float fibre = fbm3(fragCoord * float2(0.006, mix(0.07, 0.055, iLow)));
  float tense = 0.4375 + (fibre - 0.4375) * 1.6;
  return float3(1.0 + (tense - 0.4375) * 0.45);
}

// Outside the crossfade only the face that shows is computed; t comes from a
// uniform, so the branch is the same for every pixel of the frame.
float3 paperFaces(float2 fragCoord, float t) {
  if (t <= 0.0) return paperCalm(fragCoord);
  if (t >= 1.0) return paperLively(fragCoord);
  return blendTextures(paperCalm(fragCoord), paperLively(fragCoord), t);
}

// Laid lines: a 6 px period, the lower half 3% darker. Both faces share them.
float paperLaid(float2 fragCoord) {
  return 1.0 - 0.03 * step(0.5, fract(fragCoord.y / 6.0));
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  float3 col = surface(uv) * paperFaces(fragCoord, energyBlend()) * paperLaid(fragCoord);
  col += beatLift(uv);
  col *= frame(uv);
  return half4(half3(clamp(dropDip(col), 0.0, 1.0)), 1.0);
}
`;
