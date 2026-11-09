import type { Entrance, Hold, TempoFeel } from '../direction/types';

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
  /** Stage clock "now", on the same basis as `lastOnsetAtMs` / `nextBeatAtMs`. */
  timeMs: number;
  /** When the beat last jumped (an onset the engine locked onto); <= 0 if none yet. */
  lastOnsetAtMs: number;
  /** Predicted next beat head on the stage clock; <= 0 while the engine has no grid. */
  nextBeatAtMs: number;
  /** Beat period in ms; <= 0 while there is no grid. */
  periodMs: number;
  /** Smoothed low-band envelope, 0..1. Flavours the beat's lift; never the driver. */
  low: number;
  /** Amplitude coefficient for the song's tempo feel (TEMPO_FEEL_FACTOR). */
  feel: number;
  bar: number;
  confidence: number;
  reducedMotion: boolean;
  seed: number;
  /** Extra breathe phase for this glyph (the idle grid wave); 0 for line glyphs. */
  phaseOffset: number;
  /**
   * How long before its landing the entrance was confirmed (the scheduler's
   * landsAtMs minus its startedAtMs); 0 when the entrance is not anchored to a
   * beat head. With a positive value, `elapsedMs` is measured from the landing
   * (the beat head), so it is negative during the anticipation window.
   */
  anticipationMs: number;
  /**
   * True while this glyph's line is leaving: `elapsedMs` is then the time since
   * the exit began and the transform is the exit derived from `entrance`.
   */
  exiting: boolean;
  /**
   * True while the beat calls the room silent (the stage's `silence` flag).
   * There is no beat to ride then, so the beat-driven holds (pulse, shake,
   * breathe) stand still: the grid the engine keeps through silence would
   * otherwise go on pulling the glyphs back before each predicted head.
   * Unset reads as false. `drift` is not beat-driven and is unaffected.
   */
  silent?: boolean;
}

/** Per-song amplitude coefficient for `tempoFeel` (groove analysis 3.4). */
export const TEMPO_FEEL_FACTOR: Record<TempoFeel, number> = {
  still: 0.5,
  sway: 1.0,
  march: 1.3,
  drive: 1.6,
};

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
/** Lines with more glyphs than this spread their scatter over two beats. */
const SCATTER_WIDE_GLYPH_COUNT = 8;

/** The engine's own pulse decay constant (beatEngine PULSE_DECAY). */
const PULSE_DECAY_MS = 120;
/** The anticipation pull-back lives in the last 15% of the beat phase. */
const ANTICIPATION_START = 0.85;
const ANTICIPATION_DEPTH = 0.02;
/**
 * The spring's argument at which it first reaches 1 (cos(9t) crosses zero):
 * an entrance anchored to a beat head is exactly home at the landing.
 */
const LANDING_SPRING_U = Math.PI / 18;
/** How far the glyph crouches (scale dip) at the middle of the anticipation window. */
const LANDING_CROUCH = 0.08;

/**
 * How long glyph `glyphIndex` waits before its entrance starts. Scatter rides
 * the beat grid when there is one: delays are sixteenth notes spread over one
 * beat (two for wide lines), so the glyphs arrive on subdivisions of the beat.
 * Without a grid the historical fixed staggers remain.
 */
function staggerMs(
  entrance: Entrance,
  glyphIndex: number,
  glyphCount: number,
  periodMs: number,
): number {
  'worklet';
  if (entrance === 'scatter') {
    if (periodMs > 0 && glyphCount > 0) {
      const beats = glyphCount > SCATTER_WIDE_GLYPH_COUNT ? 2 : 1;
      const raw = (glyphIndex / glyphCount) * beats * periodMs;
      const sixteenth = periodMs / 4;
      return Math.round(raw / sixteenth) * sixteenth;
    }
    return SCATTER_STAGGER_MS * glyphIndex;
  }
  if (entrance === 'trace') return TRACE_STAGGER_MS * glyphIndex;
  return 0;
}

/** How long an entrance runs for the whole line: the duration plus the last glyph's stagger. */
export function entranceDurationMs(entrance: Entrance, glyphCount: number, periodMs = 0): number {
  'worklet';
  const last = glyphCount > 0 ? glyphCount - 1 : 0;
  return ENTRANCE_DURATION_MS[entrance] + staggerMs(entrance, last, glyphCount, periodMs);
}

export function entranceDone(
  entrance: Entrance,
  glyphCount: number,
  elapsedMs: number,
  periodMs = 0,
): boolean {
  'worklet';
  return elapsedMs >= entranceDurationMs(entrance, glyphCount, periodMs);
}

/**
 * The beat pulse as a continuous quantity: 1 at the onset, decaying with the
 * engine's 120 ms time constant. 0 before the onset (or when there was none),
 * so a stale prediction never invents a pulse.
 */
export function derivePulse(timeMs: number, lastOnsetAtMs: number): number {
  'worklet';
  if (lastOnsetAtMs <= 0 || timeMs < lastOnsetAtMs) return 0;
  return Math.exp(-(timeMs - lastOnsetAtMs) / PULSE_DECAY_MS);
}

/**
 * The position inside the current beat, 0 at a beat head and approaching 1 at
 * the next, extrapolated from the predicted next beat. Wraps over whole
 * periods, so a prediction one beat stale still reads correctly. 0 without a
 * grid.
 */
export function derivePhase(timeMs: number, nextBeatAtMs: number, periodMs: number): number {
  'worklet';
  if (nextBeatAtMs <= 0 || periodMs <= 0) return 0;
  const remaining = (nextBeatAtMs - timeMs) / periodMs;
  const frac = remaining - Math.floor(remaining);
  return frac === 0 ? 0 : 1 - frac;
}

/** Pull-back before the beat lands: 0 until 85% of the phase, a half-sine to 1 and back. */
function anticipation(phase: number): number {
  'worklet';
  if (phase <= ANTICIPATION_START) return 0;
  return Math.sin(((phase - ANTICIPATION_START) / (1 - ANTICIPATION_START)) * Math.PI);
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

export type ExitKind = 'fall' | 'rise' | 'scatter' | 'trace' | 'fade' | 'cut';

/**
 * The exit is derived deterministically from how the line entered (the
 * direction vocabulary does not grow): a line that dropped in falls away, one
 * that rose leaves upward, scatter disperses, trace erases from the tail,
 * fade just fades, and cut was never really there.
 */
export function exitForEntrance(entrance: Entrance): ExitKind {
  'worklet';
  switch (entrance) {
    case 'drop':
      return 'fall';
    case 'rise':
      return 'rise';
    case 'scatter':
      return 'scatter';
    case 'trace':
      return 'trace';
    case 'fade':
      return 'fade';
    case 'cut':
      return 'cut';
  }
}

const EXIT_TRACE_STAGGER_MS = 45;
const EXIT_TRACE_RAMP_MS = 110;

/**
 * How long an exit runs. Exits always converge within one beat when a beat
 * grid exists (the natural duration is capped at the period), so a leaving
 * line never lingers into the next line's space.
 */
export function exitDurationMs(entrance: Entrance, glyphCount: number, periodMs: number): number {
  'worklet';
  const kind = exitForEntrance(entrance);
  let natural: number;
  switch (kind) {
    case 'cut':
      return 0;
    case 'fall':
    case 'rise':
      natural = 320;
      break;
    case 'scatter':
      natural = 420;
      break;
    case 'fade':
      natural = 300;
      break;
    case 'trace': {
      const last = glyphCount > 0 ? glyphCount - 1 : 0;
      natural = EXIT_TRACE_RAMP_MS + EXIT_TRACE_STAGGER_MS * last;
      break;
    }
  }
  return periodMs > 0 ? Math.min(natural, periodMs) : natural;
}

/**
 * The longest the recognition drop waits for a beat head. With the scatter
 * (at most one beat, capped at 420 ms) and the first line's settle this keeps
 * the whole transition inside the spec's two seconds even at 60 BPM.
 */
export const DROP_MAX_WAIT_MS = 1000;

/**
 * When the recognition drop lands: the first beat head at or after the fire
 * time, so the idle glyphs scatter and the first line drops on the beat. A
 * stale prediction is carried forward by whole periods. Without a grid, with
 * low confidence (never look synced on a guess), or when the head is further
 * than DROP_MAX_WAIT_MS away, the drop lands at once.
 */
export function dropHeadMs(
  fireAtMs: number,
  nextBeatAtMs: number,
  periodMs: number,
  confidence: number,
): number {
  'worklet';
  if (nextBeatAtMs <= 0 || periodMs <= 0 || confidence < 0.5) return fireAtMs;
  let head = nextBeatAtMs;
  if (head < fireAtMs) head += Math.ceil((fireAtMs - head) / periodMs) * periodMs;
  return head - fireAtMs > DROP_MAX_WAIT_MS ? fireAtMs : head;
}

/**
 * The transform of a leaving glyph; `input.elapsedMs` is the time since the
 * exit began. A negative elapsed (the exit clock is anchored ahead, as the
 * recognition drop anchors the idle glyphs' scatter at the next beat head)
 * holds the glyph exactly in place until then.
 */
function exitTransform(input: MotionInput): GlyphTransform {
  'worklet';
  const zero: GlyphTransform = { dx: 0, dy: 0, scale: 1, opacity: 0, rotateDeg: 0 };
  if (input.elapsedMs < 0) return { dx: 0, dy: 0, scale: 1, opacity: 1, rotateDeg: 0 };
  const duration = exitDurationMs(input.entrance, input.glyphCount, input.periodMs);
  if (duration <= 0) return zero;
  const p = clamp01(input.elapsedMs / duration);
  const kind = exitForEntrance(input.entrance);
  if (kind === 'fall') {
    return { ...zero, dy: 60 * p * p, opacity: 1 - p };
  }
  if (kind === 'rise') {
    return { ...zero, dy: -48 * p, opacity: 1 - p };
  }
  if (kind === 'scatter') {
    return {
      dx: 44 * hashSigned(input.seed, input.glyphIndex * 3 + 1) * p,
      dy: 44 * hashSigned(input.seed, input.glyphIndex * 3 + 2) * p,
      scale: 1,
      opacity: 1 - p,
      rotateDeg: 14 * hashSigned(input.seed, input.glyphIndex * 3 + 3) * p,
    };
  }
  if (kind === 'trace') {
    // Erased from the tail: the last glyph starts first.
    const delay = EXIT_TRACE_STAGGER_MS * (input.glyphCount - 1 - input.glyphIndex);
    const local = clamp01((input.elapsedMs - delay) / EXIT_TRACE_RAMP_MS);
    return { ...zero, opacity: 1 - local };
  }
  // fade (and cut, already handled by the zero duration)
  return { ...zero, opacity: 1 - p };
}

export function glyphTransform(input: MotionInput): GlyphTransform {
  'worklet';
  let dx = 0;
  let dy = 0;
  let scale = 1;
  let opacity = 1;
  let rotateDeg = 0;
  if (input.reducedMotion) {
    // A leaving glyph under reduced motion is simply gone.
    return { dx, dy, scale, opacity: input.exiting ? 0 : 1, rotateDeg };
  }
  if (input.exiting) {
    return exitTransform(input);
  }

  const { entrance, elapsedMs, glyphIndex } = input;
  if (entrance === 'drop' || entrance === 'rise') {
    const duration = ENTRANCE_DURATION_MS[entrance];
    let s: number;
    if (input.anticipationMs > 0) {
      // Anchored to a beat head: the spring is re-parameterised so the glyph
      // crosses home exactly at the landing (elapsed 0). Before that it creeps
      // in while crouching (scale dips below 1); after it, the same spring
      // settles over the usual duration.
      if (elapsedMs < 0) {
        const a = clamp01(1 + elapsedMs / input.anticipationMs);
        s = spring(LANDING_SPRING_U * a);
        scale = 1 - LANDING_CROUCH * Math.sin(Math.PI * a);
      } else {
        s = spring(LANDING_SPRING_U + (1 - LANDING_SPRING_U) * (elapsedMs / duration));
      }
    } else {
      s = spring(elapsedMs / duration);
    }
    dy = (entrance === 'drop' ? -40 : 24) * (1 - s);
    opacity = clamp01(s);
  } else if (entrance === 'scatter') {
    const delay = staggerMs(entrance, glyphIndex, input.glyphCount, input.periodMs);
    const s = spring((elapsedMs - delay) / ENTRANCE_DURATION_MS.scatter);
    const r = 1 - s;
    dx = 30 * hashSigned(input.seed, glyphIndex * 3 + 1) * r;
    dy = 30 * hashSigned(input.seed, glyphIndex * 3 + 2) * r;
    rotateDeg = 12 * hashSigned(input.seed, glyphIndex * 3 + 3) * r;
    opacity = clamp01(s);
  } else if (entrance === 'trace') {
    const delay = staggerMs(entrance, glyphIndex, input.glyphCount, input.periodMs);
    opacity = clamp01((elapsedMs - delay) / TRACE_RAMP_MS);
  } else if (entrance === 'fade') {
    opacity = clamp01(elapsedMs / ENTRANCE_DURATION_MS.fade);
  }

  if (input.hold !== 'still' && entranceDone(entrance, input.glyphCount, elapsedMs, input.periodMs)) {
    // Anti-goal: never look synced on a guess. Everything the beat drives is
    // quartered while the engine's confidence is low.
    const damp = input.confidence < 0.5 ? 0.25 : 1;
    const phase = derivePhase(input.timeMs, input.nextBeatAtMs, input.periodMs);
    const hold = input.hold;
    if (input.silent === true && hold !== 'drift') {
      // A silent room: the beat-driven holds rest at identity.
    } else if (hold === 'pulse') {
      // The character wave: the pulse reaches each glyph a fraction of a beat
      // after the previous one, travelling across the line over one beat. It
      // is decoration on the beat, never a claim about which word is sung.
      const waveDelay =
        input.periodMs > 0 && input.glyphCount > 0
          ? (glyphIndex / input.glyphCount) * input.periodMs
          : 0;
      const pulse = derivePulse(input.timeMs - waveDelay, input.lastOnsetAtMs);
      const amplitude =
        (0.06 + 0.06 * input.low) * input.feel * (input.emphasized ? 1.6 : 1);
      scale = 1 + amplitude * pulse * damp - ANTICIPATION_DEPTH * anticipation(phase) * damp;
    } else if (hold === 'shake') {
      const pulse = derivePulse(input.timeMs, input.lastOnsetAtMs);
      if (pulse > 0.5) {
        // Steps of a sixteenth of the beat phase; without a grid, fall back to
        // the old 60 ms stepping so the shake still ticks.
        const step =
          input.periodMs > 0
            ? Math.floor(input.timeMs / input.periodMs) * 16 + Math.floor(phase * 16)
            : Math.floor(elapsedMs / 60);
        const k = input.seed + glyphIndex * 7.31;
        dx = 1.5 * hashSigned(k, step) * damp;
        dy = 1.5 * hashSigned(k + 0.5, step + 101) * damp;
      }
    } else if (hold === 'breathe') {
      const cycle = ((input.bar % 2) + phase) / 2 + input.phaseOffset;
      scale = 1 + (0.02 + 0.02 * input.low) * damp * Math.sin(2 * Math.PI * cycle);
    } else if (hold === 'drift') {
      const amplitude = 2 + 4 * input.low;
      dx = amplitude * Math.sin(elapsedMs / 1300 + glyphIndex * 1.7 + input.seed);
      dy = amplitude * Math.sin(elapsedMs / 1700 + glyphIndex * 2.3 + input.seed * 0.5 + 1);
    }
  }

  // `+ 0` normalises -0 to 0.
  return { dx: dx + 0, dy: dy + 0, scale, opacity, rotateDeg: rotateDeg + 0 };
}
