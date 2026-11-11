import { fnv1a } from './hash';
import type { Palette, Texture } from './types';

export type PaletteFamilyKey =
  | 'sumi'
  | 'ai'
  | 'sabi'
  | 'umi'
  | 'kohaku'
  | 'hana'
  | 'koori'
  | 'midori';

/**
 * A hand-tuned colour family for the rule-based director (visual overhaul spec
 * §3a.2). Rules pick one of these instead of computing colours, so contrast
 * stays testable. Values are starting points; stage G tunes them on device.
 */
export interface PaletteFamily {
  key: PaletteFamilyKey;
  /** Japanese display name. */
  name: string;
  /** Closed lyric dictionary, matched as substrings. Empty for sumi. */
  words: readonly string[];
  palette: Readonly<Palette>;
  texture: Texture;
}

export const PALETTE_FAMILIES: readonly PaletteFamily[] = [
  {
    key: 'sumi',
    name: '墨と朱',
    words: [],
    palette: {
      background: '#0E0D0C',
      light: '#F0E6D2',
      ink: '#F2EFE6',
      accent: '#D7263D',
      accentHigh: '#FF4D5E',
    },
    texture: 'paper',
  },
  {
    key: 'ai',
    name: '藍と月',
    words: ['夜', '月', '星', '闇', '眠', '夢', '影', '窓', '静'],
    palette: {
      background: '#0A0C14',
      light: '#C9D6F2',
      ink: '#E8ECF4',
      accent: '#7FA6FF',
      accentHigh: '#A9C4FF',
    },
    texture: 'void',
  },
  {
    key: 'sabi',
    name: '鉄錆',
    words: ['街', '鉄', '錆', '機械', '駅', '煙', '線路', '工場', 'ビル', '車'],
    palette: {
      background: '#100D0B',
      light: '#E3B38A',
      ink: '#EFE4D6',
      accent: '#E0783C',
      accentHigh: '#FF9A55',
    },
    texture: 'scan',
  },
  {
    key: 'umi',
    name: '深海',
    words: ['海', '雨', '水', '波', '涙', '青', '川', '潮', '泳'],
    palette: {
      background: '#080F10',
      light: '#A8E0DA',
      ink: '#E4F1EE',
      accent: '#3FC8B4',
      accentHigh: '#6FE6D4',
    },
    texture: 'grain',
  },
  {
    key: 'kohaku',
    name: '琥珀',
    words: ['光', '朝', '夜明け', '太陽', '金', '炎', '火', '燃', '暁'],
    palette: {
      background: '#110E08',
      light: '#F2CC7A',
      ink: '#F5EEDC',
      accent: '#F0B429',
      accentHigh: '#FFD15C',
    },
    texture: 'paper',
  },
  {
    key: 'hana',
    name: '緋と花',
    words: ['花', '桜', '春', '恋', '唇', '甘', '薔薇', '色'],
    palette: {
      background: '#120A0E',
      light: '#F0B8C8',
      ink: '#F6E9EE',
      accent: '#F06292',
      accentHigh: '#FF8FB5',
    },
    texture: 'grain',
  },
  {
    key: 'koori',
    name: '氷',
    words: ['雪', '白', '冬', '氷', '透', '凍', '息', '銀'],
    palette: {
      background: '#0B0D0F',
      light: '#DCE6EE',
      ink: '#F4F7FA',
      accent: '#6EC6E8',
      accentHigh: '#9ADCF4',
    },
    texture: 'void',
  },
  {
    key: 'midori',
    name: '翠',
    words: ['森', '木', '草', '風', '緑', '土', '山', '葉', '野'],
    palette: {
      background: '#0A0F0B',
      light: '#BFDDB0',
      ink: '#ECF2E6',
      accent: '#7CC46A',
      accentHigh: '#A3E08E',
    },
    texture: 'paper',
  },
];

/**
 * Picks the colour family for a song (spec §3a.3). Each line scores one hit
 * per distinct dictionary word it contains (substring match; a word repeated
 * within a line counts once). The family with the most hits wins; a tie goes
 * to the family whose first hit came in an earlier line (then table order).
 * With no hits at all, the seed draws one of the eight, so unmatched songs
 * still differ from each other. Deterministic for the same lines and seed.
 */
export function paletteFamilyFor(lines: readonly string[], seed: string): PaletteFamily {
  let best: PaletteFamily | null = null;
  let bestHits = 0;
  let bestFirstLine = Infinity;

  for (const family of PALETTE_FAMILIES) {
    let hits = 0;
    let firstLine = Infinity;
    lines.forEach((line, i) => {
      for (const word of family.words) {
        if (line.includes(word)) {
          hits++;
          if (i < firstLine) firstLine = i;
        }
      }
    });
    if (hits > bestHits || (hits > 0 && hits === bestHits && firstLine < bestFirstLine)) {
      best = family;
      bestHits = hits;
      bestFirstLine = firstLine;
    }
  }

  return best ?? (PALETTE_FAMILIES[fnv1a(seed) % PALETTE_FAMILIES.length] as PaletteFamily);
}

/** The key of the family whose palette this is (by colour values), or null. */
export function paletteFamilyKeyFor(palette: Palette): PaletteFamilyKey | null {
  const same = (a: string | undefined, b: string | undefined) =>
    (a ?? '').toUpperCase() === (b ?? '').toUpperCase();
  const family = PALETTE_FAMILIES.find(
    ({ palette: p }) =>
      same(p.background, palette.background) &&
      same(p.ink, palette.ink) &&
      same(p.accent, palette.accent) &&
      same(p.accentHigh, palette.accentHigh) &&
      same(p.light, palette.light),
  );
  return family?.key ?? null;
}

function hexToRgb255(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgb255ToHex(rgb: readonly number[]): string {
  return `#${rgb
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** Mixes two #RRGGBB colours in sRGB: t = 0 gives `a`, t = 1 gives `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb255(a);
  const cb = hexToRgb255(b);
  return rgb255ToHex(ca.map((v, i) => v + ((cb[i] ?? 0) - v) * t));
}

/** A #RRGGBB colour as a CSS `rgba(...)` string with the given alpha. */
export function rgbaOf(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb255(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** How far the derived lamp colour leans from ink toward accent. */
const LIGHT_ACCENT_MIX = 0.4;

/** The lamp colour: `palette.light`, or ink mixed 40% toward accent. */
export function lightHexFor(palette: Palette): string {
  return palette.light ?? mixHex(palette.ink, palette.accent, LIGHT_ACCENT_MIX);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb255(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two #RRGGBB colours (1 to 21, order-free). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
