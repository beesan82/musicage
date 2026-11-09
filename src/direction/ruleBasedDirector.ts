import type { FontKey } from '../typesetting/fonts';
import { fnv1a } from './hash';
import { paletteFamilyFor } from './palettes';
import {
  DEFAULT_IDLE_GLYPHS,
  type Entrance,
  type Hold,
  type LineDirection,
  type Size,
  type SongDirection,
} from './types';

const ENTRANCE_POOL: readonly Entrance[] = ['cut', 'drop', 'rise', 'scatter', 'trace', 'fade'];
const HOLD_POOL: readonly Hold[] = ['still', 'pulse', 'drift', 'shake', 'breathe'];

const MAX_FONTS = 2;
const MAX_XL_LINES = 3;
/** How many times a line must recur to count as chorus-like (`accent`). */
export const MIN_ACCENT_REPEATS = 2;
// The brief says 0.5, but its own example line (4 kanji in 10 chars) must come out mincho.
const KANJI_MINCHO_RATIO = 0.4;
const HAN = /\p{Script=Han}/u;
const ASCII_ALNUM = /[A-Za-z0-9]/;

function pick<T>(pool: readonly T[], seed: string, banned: T | null): T {
  let index = fnv1a(seed) % pool.length;
  if (banned !== null && pool[index] === banned) index = (index + 1) % pool.length;
  return pool[index] as T;
}

function ratio(chars: readonly string[], test: RegExp): number {
  if (chars.length === 0) return 0;
  return chars.filter((c) => test.test(c)).length / chars.length;
}

function sizeFor(length: number, xlUsed: number): Size {
  if (length <= 4) return xlUsed < MAX_XL_LINES ? 'xl' : 'l';
  if (length <= 12) return 'l';
  if (length <= 20) return 'm';
  if (length <= 30) return 's';
  return 'xs';
}

function limitFonts(wanted: FontKey, used: Set<FontKey>): FontKey {
  if (used.has(wanted) || used.size < MAX_FONTS) return wanted;
  // A third face is not allowed: pull it toward gothic, or a face already in use.
  return used.has('gothic') ? 'gothic' : [...used][0] ?? 'gothic';
}

/** Deterministic fallback direction used when no authored/AI direction exists. */
export function directSongByRules(lines: readonly string[], seed: string): SongDirection {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const t = line.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  const usedFonts = new Set<FontKey>();
  let xlUsed = 0;
  let prevEntrance: Entrance | null = null;
  let prevHold: Hold | null = null;

  const result: LineDirection[] = lines.map((line, i) => {
    const text = line.trim();
    if (!text) {
      prevEntrance = 'fade';
      prevHold = 'still';
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

    const chars = [...text];
    // A line sung twice or more is "chorus-like" (design spec §4, 2026-11-07):
    // it takes the accent and joins the surge passages.
    const repeated = (counts.get(text) ?? 0) >= MIN_ACCENT_REPEATS;
    const exclaim = /[！!]/.test(text);

    let wanted: FontKey;
    if (ratio(chars, HAN) >= KANJI_MINCHO_RATIO) wanted = 'mincho';
    else if (exclaim || repeated) wanted = 'gothic-heavy';
    else wanted = 'gothic';
    const font = limitFonts(wanted, usedFonts);
    usedFonts.add(font);

    const size = sizeFor(chars.length, xlUsed);
    if (size === 'xl') xlUsed++;

    const horizontal = ratio(chars, ASCII_ALNUM) >= 0.5 || chars.length > 20;

    const entrance = pick(
      ENTRANCE_POOL,
      `${seed}:${i}:entrance`,
      prevEntrance === 'scatter' ? 'scatter' : null,
    );
    const hold = pick(HOLD_POOL, `${seed}:${i}:hold`, prevHold === 'shake' ? 'shake' : null);
    prevEntrance = entrance;
    prevHold = hold;

    const firstHan = chars.findIndex((c) => HAN.test(c));

    return {
      font,
      weight: font === 'gothic-heavy' ? 'bold' : 'regular',
      size,
      orientation: horizontal ? 'horizontal' : 'vertical',
      entrance,
      hold,
      emphasis: firstHan >= 0 ? [firstHan] : [],
      accent: repeated,
      ornament: size === 'xl' ? 'rule' : 'none',
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
