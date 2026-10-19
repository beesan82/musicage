import type { Entrance, Hold } from '../direction/types';

export interface GlyphTransform {
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  rotateDeg: number;
}

export interface MotionInput {
  entrance: Entrance;
  hold: Hold;
  elapsedMs: number;
  glyphIndex: number;
  glyphCount: number;
  emphasized: boolean;
  pulse: number;
  phase: number;
  bar: number;
  confidence: number;
  reducedMotion: boolean;
  seed: number;
}

export const ENTRANCE_DURATION_MS: Record<Entrance, number> = {
  cut: 0,
  drop: 420,
  rise: 420,
  scatter: 600,
  trace: 500,
  fade: 300,
};

const SCATTER_STAGGER_MS = 40;
const TRACE_STAGGER_MS = 60;
const TRACE_RAMP_MS = 120;

function stagger(entrance: Entrance): number {
  'worklet';
  if (entrance === 'scatter') return SCATTER_STAGGER_MS;
  if (entrance === 'trace') return TRACE_STAGGER_MS;
  return 0;
}

export function entranceDone(entrance: Entrance, glyphCount: number, elapsedMs: number): boolean {
  'worklet';
  const last = glyphCount > 0 ? glyphCount - 1 : 0;
  return elapsedMs >= ENTRANCE_DURATION_MS[entrance] + stagger(entrance) * last;
}

/** Deterministic hash to [-1, 1]. */
function hashSigned(a: number, b: number): number {
  'worklet';
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Damped spring 1 - e^(-6t)cos(9t); exactly 1 once t >= 1 so the glyph settles on identity. */
function spring(t: number): number {
  'worklet';
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.exp(-6 * t) * Math.cos(9 * t);
}

export function glyphTransform(input: MotionInput): GlyphTransform {
  'worklet';
  let dx = 0;
  let dy = 0;
  let scale = 1;
  let opacity = 1;
  let rotateDeg = 0;
  if (input.reducedMotion) {
    return { dx, dy, scale, opacity, rotateDeg };
  }

  const { entrance, elapsedMs, glyphIndex } = input;
  if (entrance === 'drop' || entrance === 'rise') {
    const s = spring(elapsedMs / ENTRANCE_DURATION_MS[entrance]);
    dy = (entrance === 'drop' ? -40 : 24) * (1 - s);
    opacity = clamp01(s);
  } else if (entrance === 'scatter') {
    const s = spring((elapsedMs - SCATTER_STAGGER_MS * glyphIndex) / ENTRANCE_DURATION_MS.scatter);
    const r = 1 - s;
    dx = 30 * hashSigned(input.seed, glyphIndex * 3 + 1) * r;
    dy = 30 * hashSigned(input.seed, glyphIndex * 3 + 2) * r;
    rotateDeg = 12 * hashSigned(input.seed, glyphIndex * 3 + 3) * r;
    opacity = clamp01(s);
  } else if (entrance === 'trace') {
    opacity = clamp01((elapsedMs - TRACE_STAGGER_MS * glyphIndex) / TRACE_RAMP_MS);
  } else if (entrance === 'fade') {
    opacity = clamp01(elapsedMs / ENTRANCE_DURATION_MS.fade);
  }

  if (input.hold !== 'still' && entranceDone(entrance, input.glyphCount, elapsedMs)) {
    const damp = input.confidence < 0.5 ? 0.25 : 1;
    const hold = input.hold;
    if (hold === 'pulse') {
      scale = 1 + (input.emphasized ? 0.08 : 0.04) * input.pulse * damp;
    } else if (hold === 'shake') {
      if (input.pulse > 0.5) {
        const step = Math.floor(elapsedMs / 60);
        const k = input.seed + glyphIndex * 7.31;
        dx = 1.5 * hashSigned(k, step) * damp;
        dy = 1.5 * hashSigned(k + 0.5, step + 101) * damp;
      }
    } else if (hold === 'breathe') {
      const cycle = ((input.bar % 2) + input.phase) / 2;
      scale = 1 + 0.02 * Math.sin(2 * Math.PI * cycle);
    } else if (hold === 'drift') {
      dx = 2 * Math.sin(elapsedMs / 1300 + glyphIndex * 1.7 + input.seed);
      dy = 2 * Math.sin(elapsedMs / 1700 + glyphIndex * 2.3 + input.seed * 0.5 + 1);
    }
  }

  // `+ 0` normalises -0 to 0.
  return { dx: dx + 0, dy: dy + 0, scale, opacity, rotateDeg: rotateDeg + 0 };
}
