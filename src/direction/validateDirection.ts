import type { FontKey, FontWeight } from '../typesetting/fonts';
import type {
  Entrance,
  Hold,
  LineDirection,
  Ornament,
  Palette,
  Size,
  SongDirection,
  TempoFeel,
  Texture,
} from './types';

const FONTS: readonly FontKey[] = [
  'mincho',
  'mincho-old',
  'gothic',
  'gothic-heavy',
  'gothic-round',
  'brush',
];
const WEIGHTS: readonly FontWeight[] = ['light', 'regular', 'bold'];
const SIZES: readonly Size[] = ['xs', 's', 'm', 'l', 'xl'];
const ORIENTATIONS = ['vertical', 'horizontal'] as const;
const ENTRANCES: readonly Entrance[] = ['cut', 'drop', 'rise', 'scatter', 'trace', 'fade'];
const HOLDS: readonly Hold[] = ['still', 'pulse', 'drift', 'shake', 'breathe'];
const ORNAMENTS: readonly Ornament[] = ['none', 'rule', 'frame', 'grid', 'circle', 'numeral'];
const TEXTURES: readonly Texture[] = ['paper', 'grain', 'void', 'scan'];
const TEMPO_FEELS: readonly TempoFeel[] = ['still', 'sway', 'march', 'drive'];

const MAX_FONTS = 2;
const MAX_XL_LINES = 3;
const MAX_EMPHASIS = 3;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

function parseLine(raw: unknown, text: string): LineDirection | null {
  if (!isRecord(raw)) return null;
  const { font, weight, size, orientation, entrance, hold, emphasis, accent, ornament } = raw;
  if (
    !isOneOf(FONTS, font) ||
    !isOneOf(WEIGHTS, weight) ||
    !isOneOf(SIZES, size) ||
    !isOneOf(ORIENTATIONS, orientation) ||
    !isOneOf(ENTRANCES, entrance) ||
    !isOneOf(HOLDS, hold) ||
    !isOneOf(ORNAMENTS, ornament) ||
    typeof accent !== 'boolean' ||
    !Array.isArray(emphasis)
  ) {
    return null;
  }
  const length = [...text].length;
  if (emphasis.length > MAX_EMPHASIS) return null;
  for (const i of emphasis) {
    if (!Number.isInteger(i) || i < 0 || i >= length) return null;
  }
  return {
    font,
    weight,
    size,
    orientation,
    entrance,
    hold,
    emphasis: emphasis as number[],
    accent,
    ornament,
  };
}

/**
 * Validates an untrusted direction (fixture or model response) against the song's line texts.
 * Returns a clean SongDirection, or null if any type, enum, count or stage constraint is broken.
 */
export function validateSongDirection(
  input: unknown,
  lineTexts: readonly string[],
): SongDirection | null {
  if (!isRecord(input)) return null;
  const { palette, texture, tempoFeel, idleGlyphs, lines } = input;
  if (!isRecord(palette)) return null;
  const { background, ink, accent, accentHigh, light } = palette;
  if (
    typeof background !== 'string' ||
    typeof ink !== 'string' ||
    typeof accent !== 'string' ||
    !HEX_COLOR.test(background) ||
    !HEX_COLOR.test(ink) ||
    !HEX_COLOR.test(accent)
  ) {
    return null;
  }
  // The second accent is optional; when given it must be a colour like the others.
  if (accentHigh !== undefined && (typeof accentHigh !== 'string' || !HEX_COLOR.test(accentHigh))) {
    return null;
  }
  // The lamp colour is optional in the same way.
  if (light !== undefined && (typeof light !== 'string' || !HEX_COLOR.test(light))) {
    return null;
  }
  const cleanPalette: Palette = { background, ink, accent };
  if (accentHigh !== undefined) cleanPalette.accentHigh = accentHigh;
  if (light !== undefined) cleanPalette.light = light;
  if (!isOneOf(TEXTURES, texture) || !isOneOf(TEMPO_FEELS, tempoFeel)) return null;
  if (typeof idleGlyphs !== 'string') return null;
  if (!Array.isArray(lines) || lines.length !== lineTexts.length) return null;

  const parsed: LineDirection[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = parseLine(lines[i], lineTexts[i] ?? '');
    if (!line) return null;
    parsed.push(line);
  }

  if (new Set(parsed.map((l) => l.font)).size > MAX_FONTS) return null;
  if (parsed.filter((l) => l.size === 'xl').length > MAX_XL_LINES) return null;
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const cur = parsed[i];
    if (!prev || !cur) return null;
    if (cur.entrance === 'scatter' && prev.entrance === 'scatter') return null;
    if (cur.hold === 'shake' && prev.hold === 'shake') return null;
  }

  return {
    palette: cleanPalette,
    texture,
    tempoFeel,
    idleGlyphs,
    lines: parsed,
  };
}
