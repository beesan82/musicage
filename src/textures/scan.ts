/**
 * Scan (CRT): 2 px scanlines whose phase slips with the beat pulse. No noise.
 * The lines deepen with the mid band, and the pulse slip is gated by the beat
 * confidence.
 *
 * The lines are a material, a multiplier on the lit surface (visual overhaul
 * spec §3b.2): 18..30% deep, so they read inside the lamp's pool and sink
 * with it towards the corners. Half the rows are dark, so the material
 * averages 0.91..0.85 rather than 1.
 *
 * Two faces (stage 6): calm is the even scanlines; lively breaks the lines
 * into dashes of uneven depth (one hash per 12 x 2 px cell) that crawl
 * sideways slowly, like tape running. The dash weights are 0.5..1.5 and
 * average to 1, so the lines' mean depth, and the frame's mean, match the
 * calm face. One hash per pixel, so both faces are always evaluated. The
 * crawl is 8 px/s: a cell edge passes a pixel every 1.5 s, and the step it
 * makes is at most half the line depth, far under the "blink" definition in
 * the design spec.
 */
export const SCAN_SKSL = `
// 1 px dark, 1 px light; a full pulse shifts the pattern by one line.
float scanDark(float2 fragCoord) {
  return step(1.0, mod(fragCoord.y + clamp(iPulse, 0.0, 1.0) * iConfidence, 2.0));
}

// Calm face: even lines.
float3 scanCalm(float2 fragCoord) {
  return float3(1.0 - scanDark(fragCoord) * (0.18 + 0.12 * iMid));
}

// Lively face: the lines are dashes of uneven depth that crawl sideways.
float3 scanLively(float2 fragCoord) {
  float2 cell = float2(floor((fragCoord.x + iTime * 8.0) / 12.0), floor(fragCoord.y / 2.0));
  float weight = 0.5 + hash21(cell);
  return float3(1.0 - scanDark(fragCoord) * weight * (0.18 + 0.12 * iMid));
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;

  float3 col = surface(uv) * blendTextures(scanCalm(fragCoord), scanLively(fragCoord), energyBlend());
  col += beatLift(uv);
  col *= frame(uv);
  return half4(half3(clamp(dropDip(col), 0.0, 1.0)), 1.0);
}
`;
