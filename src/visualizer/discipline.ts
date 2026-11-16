// The rules every visualizer pattern keeps (design spec §9.1 "反応の強さ" and
// "輝度の規律"): how strongly it answers the bands, and how much light it may
// put on the screen. The patterns draw thin lines and dots in the ink (the
// accent only for a beat's local flash), never a bright surface, so the light
// they add is bounded by their inked area. Each pattern states that area as a
// VisualizerBudget (its worst case: every element at full size and opacity)
// and lightBudgetOf turns it into the screen-average contribution the spec
// caps, so the caps are checked by the tests rather than by eye.

/**
 * The reaction strength (`VIZ_GAIN`) on the scale of the approved mock's
 * "反応" slider. Every pattern multiplies the band readings by it, the clock's
 * `bars` included (decided 2026-11-16).
 */
export const VIZ_GAIN = 1.15;
/**
 * Where the band meter before build 15 sat on the same slider: its mapping
 * (the band envelope straight to the rule's reach) is this gain. At VIZ_GAIN
 * the same band reading reaches VIZ_GAIN / VIZ_GAIN_REFERENCE ≈ 2.6 × as far.
 */
export const VIZ_GAIN_REFERENCE = 0.45;

/** Opacity cap of a foot pattern's elements (the band meter's 0.7). */
export const FOOT_OPACITY_MAX = 0.7;
/** Opacity cap of a back pattern's elements. */
export const BACK_OPACITY_MAX = 0.45;
/** What a pattern may add to the screen's mean level at all times, in 1/255. */
export const STEADY_LIGHT_MAX_255 = 3;
/** What a beat's flash may add on top, in 1/255. */
export const FLASH_LIGHT_MAX_255 = 2;
/** The share of the screen one flash may touch. */
export const FLASH_AREA_MAX_FRACTION = 0.1;

/** The multiplier a gain puts on a band reading; a broken gain answers nothing. */
export function vizGainScale(gain: number): number {
  'worklet';
  if (!Number.isFinite(gain) || gain <= 0) return 0;
  return gain / VIZ_GAIN_REFERENCE;
}

/**
 * A band reading (0..1) as a pattern answers it at `gain`: linear on the
 * mock's scale, clamped to 0..1, so a loud band saturates instead of
 * overshooting. A reading that is not a number answers nothing; +∞ is full.
 */
export function vizReading(band: number, gain: number = VIZ_GAIN): number {
  'worklet';
  const v = band * vizGainScale(gain);
  if (!Number.isFinite(v)) return v === Infinity ? 1 : 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A pattern's worst case on one stage, in px² of ink × opacity: what it
 * always may show (every element at its full reach) and what one beat's flash
 * adds (with the flash's own area, for the 10% rule).
 */
export interface VisualizerBudget {
  /** Σ area × opacity of everything drawn, at full reach. */
  steadyInk: number;
  /** Area a flash lights, px². */
  flashArea: number;
  /** Σ area × opacity a flash adds, at its peak. */
  flashInk: number;
}

export interface LightBudget {
  /** Contribution to the screen's mean level, in 1/255, if the ink were white on black. */
  steady255: number;
  flash255: number;
  /** Share of the screen one flash touches. */
  flashFraction: number;
  /** Within every cap above. */
  ok: boolean;
}

/**
 * A budget against the screen: the contribution assumes white ink on a black
 * ground (an upper bound for any palette, the ink is never brighter).
 */
export function lightBudgetOf(budget: VisualizerBudget, screenWidth: number, screenHeight: number): LightBudget {
  const screen = Math.max(1, screenWidth * screenHeight);
  const steady255 = (255 * budget.steadyInk) / screen;
  const flash255 = (255 * budget.flashInk) / screen;
  const flashFraction = budget.flashArea / screen;
  return {
    steady255,
    flash255,
    flashFraction,
    ok:
      steady255 <= STEADY_LIGHT_MAX_255 &&
      flash255 <= FLASH_LIGHT_MAX_255 &&
      flashFraction <= FLASH_AREA_MAX_FRACTION,
  };
}
