import { SURFACE_CONSTANTS } from './textureShader';
import type { Rgb01 } from './textureShader';
import { VOID_LAMP } from './void';

/**
 * The TS twin of the prelude's lit surface (visual overhaul spec §3b.4):
 * lampPool / surface / frame / beatLift, written with the same constants so
 * tests can hold the shader's numbers to the spec's targets without a GPU.
 * Also the UI-thread helpers that drive the lamp's uniforms (lampTarget,
 * followToward), which TextureBackground runs in its frame callback.
 *
 * Coordinates are uv (0..1, y down, as fragCoord / iResolution); colours are
 * 0..1 RGB (hexToRgb01). `aspect` is height / width, the shader's
 * iResolution.y / iResolution.x.
 */

export interface Uv {
  x: number;
  y: number;
}

/** Where the lamp rests with no line on stage: centred, a little high. */
export const IDLE_FOCUS: Readonly<Uv> = { x: 0.5, y: 0.42 };

/** Time constants of the lamp's slow followers (spec §3a.5, §3b.1). */
export const LAMP_TAU_MS = 800;
export const FOCUS_TAU_MS = 600;
export const COLOR_TAU_MS = 400;
/** The lamp's opening under reduced motion: held, as if a quiet song played. */
export const REDUCED_MOTION_LAMP = 0.3;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** The prelude's `lampPool`: 1 at the focus, 0 at LAMP_RADIUS screen widths. */
export function lampPool(uv: Uv, focus: Uv, aspect: number): number {
  const dx = uv.x - focus.x;
  const dy = (uv.y - focus.y) * aspect;
  return 1 - smoothstep(0, SURFACE_CONSTANTS.LAMP_RADIUS, Math.hypot(dx, dy));
}

/** The prelude's `lampStrength`: the pool's centre strength at a lamp opening. */
export function lampStrength(base: number, lamp: number): number {
  return base + SURFACE_CONSTANTS.LAMP_GAIN * clamp01(lamp);
}

const addLight = (background: Rgb01, light: Rgb01, amount: number): Rgb01 => [
  background[0] + light[0] * amount,
  background[1] + light[1] * amount,
  background[2] + light[2] * amount,
];

/** The prelude's `surface`: the ground plus the lamp's colour in its pool. */
export function surface(
  uv: Uv,
  focus: Uv,
  aspect: number,
  background: Rgb01,
  light: Rgb01,
  lamp: number,
): Rgb01 {
  return addLight(background, light, lampPool(uv, focus, aspect) * lampStrength(SURFACE_CONSTANTS.LAMP_BASE, lamp));
}

/** void.ts's `voidSurface`: the pool raised to VOID_LAMP.POWER, base VOID_LAMP.BASE. */
export function voidSurface(
  uv: Uv,
  focus: Uv,
  aspect: number,
  background: Rgb01,
  light: Rgb01,
  lamp: number,
): Rgb01 {
  const pool = lampPool(uv, focus, aspect) ** VOID_LAMP.POWER;
  return addLight(background, light, pool * lampStrength(VOID_LAMP.BASE, lamp));
}

/** The prelude's `frame`: 1 in the middle, 1 - FRAME_DARK towards the corners. */
export function frame(uv: Uv): number {
  const d = Math.hypot(uv.x - 0.5, uv.y - 0.5);
  return 1 - smoothstep(0.35, 0.8, d) * SURFACE_CONSTANTS.FRAME_DARK;
}

/** The prelude's `beatLift`: the lamp's colour, in the pool only, gated by confidence. */
export function beatLift(
  uv: Uv,
  focus: Uv,
  aspect: number,
  light: Rgb01,
  pulse: number,
  confidence: number,
): Rgb01 {
  const amount = lampPool(uv, focus, aspect) * clamp01(pulse * confidence) * SURFACE_CONSTANTS.PULSE_LIFT;
  return [light[0] * amount, light[1] * amount, light[2] * amount];
}

/**
 * A texture's colour before its material (material = 1): surface (or the
 * void's), plus the beat lift, times the frame. What the shaders compute for
 * a flat material, i.e. the frame's mean when the material averages 1.
 */
export function litColor(
  uv: Uv,
  focus: Uv,
  aspect: number,
  background: Rgb01,
  light: Rgb01,
  lamp: number,
  pulse = 0,
  confidence = 0,
  kind: 'surface' | 'void' = 'surface',
): Rgb01 {
  const base = (kind === 'void' ? voidSurface : surface)(uv, focus, aspect, background, light, lamp);
  const lift = beatLift(uv, focus, aspect, light, pulse, confidence);
  const f = frame(uv);
  return [(base[0] + lift[0]) * f, (base[1] + lift[1]) * f, (base[2] + lift[2]) * f];
}

/**
 * Where the lamp's opening heads: shut in silence, otherwise 0.3 opening
 * to 1 with the energy (spec §3b.1). `silence` is 1 for silence, 0 for sound.
 */
export function lampTarget(silence: number, energy: number): number {
  'worklet';
  if (silence >= 0.5) return 0;
  const e = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  return 0.3 + 0.7 * e;
}

/** One step of a first-order follower: `current` moves toward `target` over `dtMs` with time constant `tauMs`. */
export function followToward(current: number, target: number, dtMs: number, tauMs: number): number {
  'worklet';
  if (dtMs <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-dtMs / tauMs));
}
