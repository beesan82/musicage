import type { FontKey } from '../typesetting/fonts';
import { fnv1a } from './hash';
import { paletteFamilyFor } from './palettes';
import {
  DEFAULT_IDLE_GLYPHS,
  type Entrance,
  type Hold,
  type LineDirection,
  type Ornament,
  type Placement,
  type Size,
  type SongDirection,
} from './types';

// The rules (design spec §4 "ルールベース", 2026-11-11 evening): everything
// follows from the lines' text, their order and the song's seed; nothing is
// random and nothing listens to the room, so the same song with the same
// lyrics always gets the same directions. Volume never sets a size.

export const ENTRANCE_POOL: readonly Entrance[] = [
  'cut',
  'drop',
  'rise',
  'scatter',
  'trace',
  'fade',
  'print',
  'gather',
  'slide',
];
const HOLD_POOL: readonly Hold[] = ['still', 'pulse', 'drift', 'shake', 'breathe'];
const PLACEMENT_POOL: readonly Placement[] = ['top-right', 'bottom-left', 'center', 'top-left', 'bottom-right'];
/** The entrances that make a 決め: offered first to a returning line. */
const PEAK_ENTRANCES: readonly Entrance[] = ['drop', 'gather', 'print'];
/** A returning line's mark; the same text always draws the same one. */
const SIGNATURE_ORNAMENTS: readonly Ornament[] = ['frame', 'circle'];
const SIZE_ORDER: readonly Size[] = ['xs', 's', 'm', 'l', 'xl'];

const MAX_FONTS = 2;
const MAX_XL_LINES = 3;
/** How many times a line must recur to count as chorus-like (`accent`). */
export const MIN_ACCENT_REPEATS = 2;
/** A line this short may take xl as a short line, budget permitting. */
const XL_SHORT_LENGTH = 4;
/** A returning line this short may take xl (one xl column holds about eight). */
const XL_PEAK_LENGTH = 8;
/** Lines longer than this lie horizontal and never scatter or gather. */
const LONG_LENGTH = 20;
/** The longest line whose orientation is flipped to break a run of three. */
const FLIP_LENGTH = 14;
/** How many shown lines back an entrance is not repeated. */
export const ENTRANCE_MEMORY = 2;
/** For contrast, an ordinary line may step up to a size only if it is no longer than this. */
const CONTRAST_UP_LIMIT: Partial<Record<Size, number>> = { s: 32, m: 22, l: 14 };
// The brief says 0.5, but its own example line (4 kanji in 10 chars) must come out mincho.
const KANJI_MINCHO_RATIO = 0.4;
const HAN = /\p{Script=Han}/u;
const ASCII_ALNUM = /[A-Za-z0-9]/;
const EXCLAIM = /[！!]/;

/** `pool` rotated to start at a hash of `key`: a deterministic order per line. */
function rotated<T>(pool: readonly T[], key: string): T[] {
  if (pool.length === 0) return [];
  const start = fnv1a(key) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

function ratio(chars: readonly string[], test: RegExp): number {
  if (chars.length === 0) return 0;
  return chars.filter((c) => test.test(c)).length / chars.length;
}

/** The size by length alone, before xl, returns and contrast. */
function baseSize(length: number): Size {
  if (length <= 12) return 'l';
  if (length <= 20) return 'm';
  if (length <= 30) return 's';
  return 'xs';
}

/** One step up for a returning line; xl only comes from the budget. */
function stepUp(size: Size): Size {
  return SIZE_ORDER[Math.min(SIZE_ORDER.indexOf(size) + 1, SIZE_ORDER.indexOf('l'))]!;
}

/** An ordinary line the same size as the line before: one step up if it is short enough, else one down (not below s). */
function contrast(size: Size, length: number): Size {
  const at = SIZE_ORDER.indexOf(size);
  const up = SIZE_ORDER[at + 1];
  const upLimit = up === undefined ? undefined : CONTRAST_UP_LIMIT[up];
  if (up !== undefined && up !== 'xl' && upLimit !== undefined && length <= upLimit) return up;
  if (at - 1 >= SIZE_ORDER.indexOf('s')) return SIZE_ORDER[at - 1]!;
  return size;
}

function limitFonts(wanted: FontKey, used: Set<FontKey>): FontKey {
  if (used.has(wanted) || used.size < MAX_FONTS) return wanted;
  // A third face is not allowed: pull it toward gothic, or a face already in use.
  return used.has('gothic') ? 'gothic' : [...used][0] ?? 'gothic';
}

/** The entrances a line's character asks for first. */
function characterEntrances(chars: readonly string[], text: string): readonly Entrance[] {
  if (EXCLAIM.test(text)) return ['drop', 'cut', 'slide'];
  if (chars.length > LONG_LENGTH) return ['slide', 'print', 'fade'];
  if (ratio(chars, ASCII_ALNUM) >= 0.5) return ['slide', 'cut', 'rise'];
  if (ratio(chars, HAN) >= KANJI_MINCHO_RATIO) return ['print', 'trace', 'fade'];
  return [];
}

/** A returning line's emphasis: its first, middle and last kanji, or its first and last glyph. */
function peakEmphasis(chars: readonly string[]): number[] {
  const han = chars.flatMap((c, i) => (HAN.test(c) ? [i] : []));
  const visible = chars.flatMap((c, i) => (/\s/.test(c) ? [] : [i]));
  const picks =
    han.length > 0
      ? [han[0], han[Math.floor((han.length - 1) / 2)], han[han.length - 1]]
      : [visible[0], visible[visible.length - 1]];
  return [...new Set(picks.filter((i): i is number => i !== undefined))].sort((a, b) => a - b);
}

/** What the rules read off one non-empty line before choosing anything. */
interface Shape {
  text: string;
  chars: string[];
  /** Sung MIN_ACCENT_REPEATS times or more: chorus-like, accented on every appearance. */
  repeated: boolean;
  /** A repeated line's second or later appearance: it is promoted. */
  returning: boolean;
  /** A repeated line that opens a run of repeated lines (a structural peak). */
  chorusHead: boolean;
}

/** What the recent shown lines were, for the no-repeat rules. */
interface Shown {
  entrance: Entrance;
  hold: Hold;
  size: Size;
  orientation: LineDirection['orientation'];
  placement: Placement;
}

function shapesOf(lines: readonly string[]): (Shape | null)[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const t = line.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  let previousRepeated = false;
  return lines.map((line) => {
    const text = line.trim();
    if (!text) {
      // A blank line ends a section: what follows may open a new peak.
      previousRepeated = false;
      return null;
    }
    const appearance = (seen.get(text) ?? 0) + 1;
    seen.set(text, appearance);
    const repeated = (counts.get(text) ?? 0) >= MIN_ACCENT_REPEATS;
    const chorusHead = repeated && !previousRepeated;
    previousRepeated = repeated;
    return { text, chars: [...text], repeated, returning: repeated && appearance >= 2, chorusHead };
  });
}

/**
 * Which lines are set xl (at most MAX_XL_LINES): returning lines short enough
 * first, the ones opening a chorus before the rest, then in song order; what
 * is left goes to the short lines in song order.
 */
function xlLines(shapes: readonly (Shape | null)[]): Set<number> {
  const xl = new Set<number>();
  const peaks = shapes
    .flatMap((shape, i) => (shape?.returning && shape.chars.length <= XL_PEAK_LENGTH ? [{ i, head: shape.chorusHead }] : []))
    .sort((a, b) => Number(b.head) - Number(a.head) || a.i - b.i);
  for (const { i } of peaks) if (xl.size < MAX_XL_LINES) xl.add(i);
  shapes.forEach((shape, i) => {
    if (shape && !shape.returning && shape.chars.length <= XL_SHORT_LENGTH && xl.size < MAX_XL_LINES) xl.add(i);
  });
  return xl;
}

/** Deterministic fallback direction used when no authored/AI direction exists. */
export function directSongByRules(lines: readonly string[], seed: string): SongDirection {
  const shapes = shapesOf(lines);
  const xl = xlLines(shapes);
  const usedFonts = new Set<FontKey>();
  const shown: Shown[] = [];

  const result: LineDirection[] = shapes.map((shape, i) => {
    if (shape === null) {
      const emptyFont = limitFonts('gothic', usedFonts);
      usedFonts.add(emptyFont);
      return {
        font: emptyFont,
        weight: 'regular',
        size: 'xs',
        orientation: 'vertical',
        entrance: 'fade',
        hold: 'still',
        emphasis: [],
        accent: false,
        ornament: 'none',
      };
    }

    const { text, chars, repeated, returning } = shape;
    const length = chars.length;
    const previous = shown[shown.length - 1];

    let wanted: FontKey;
    if (ratio(chars, HAN) >= KANJI_MINCHO_RATIO) wanted = 'mincho';
    else if (EXCLAIM.test(text) || repeated) wanted = 'gothic-heavy';
    else wanted = 'gothic';
    const font = limitFonts(wanted, usedFonts);
    usedFonts.add(font);

    // Size: the xl budget, a returning line one step up, an ordinary line
    // stepped away from the size of the line before it.
    let size: Size;
    if (xl.has(i)) size = 'xl';
    else if (returning) size = stepUp(baseSize(length));
    else {
      size = baseSize(length);
      if (!repeated && previous?.size === size) size = contrast(size, length);
    }

    // Orientation: Latin and long lines lie down; the rest stand, except that
    // a third standing line in a row (short enough) lies down for a change.
    let orientation: LineDirection['orientation'];
    if (ratio(chars, ASCII_ALNUM) >= 0.5 || length > LONG_LENGTH) orientation = 'horizontal';
    else {
      const lastTwo = shown.slice(-2);
      const run = lastTwo.length === 2 && lastTwo.every((s) => s.orientation === 'vertical');
      orientation = run && length <= FLIP_LENGTH ? 'horizontal' : 'vertical';
    }

    // Entrance: a returning line's 決め first, then what the line's character
    // asks for, then the whole vocabulary; never one of the last two shown.
    const recent = shown.slice(-ENTRANCE_MEMORY).map((s) => s.entrance);
    const calm = length > LONG_LENGTH;
    const candidates = [
      ...(returning ? rotated(PEAK_ENTRANCES, `${text}:peak`) : []),
      ...rotated(characterEntrances(chars, text), `${seed}:${i}:prefer`),
      ...rotated(ENTRANCE_POOL, `${seed}:${i}:entrance`),
    ];
    const entrance =
      candidates.find((e) => !recent.includes(e) && !(calm && (e === 'scatter' || e === 'gather'))) ?? 'fade';

    const hold: Hold = returning
      ? 'pulse'
      : (rotated(HOLD_POOL, `${seed}:${i}:hold`).find((h) => h !== previous?.hold) ?? 'still');

    const placement: Placement = returning
      ? 'center'
      : (rotated(PLACEMENT_POOL, `${seed}:${i}:placement`).find((p) => p !== previous?.placement) ?? 'center');

    shown.push({ entrance, hold, size, orientation, placement });

    const firstHan = chars.findIndex((c) => HAN.test(c));
    const ornament: Ornament = returning
      ? SIGNATURE_ORNAMENTS[fnv1a(text) % SIGNATURE_ORNAMENTS.length]!
      : size === 'xl'
        ? 'rule'
        : 'none';

    return {
      font,
      weight: font === 'gothic-heavy' || (returning && font === 'gothic') ? 'bold' : 'regular',
      size,
      orientation,
      entrance,
      hold,
      emphasis: returning ? peakEmphasis(chars) : firstHan >= 0 ? [firstHan] : [],
      // A line sung twice or more is "chorus-like" (design spec §4, 2026-11-07):
      // it takes the accent and joins the surge passages, every time.
      accent: repeated,
      ornament,
      placement,
    };
  });

  // Colour and material come from the family the lyrics point to (visual overhaul spec §3a.3).
  const family = paletteFamilyFor(lines, seed);

  return {
    palette: { ...family.palette },
    texture: family.texture,
    tempoFeel: 'sway',
    idleGlyphs: DEFAULT_IDLE_GLYPHS,
    lines: result,
  };
}
