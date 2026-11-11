import {
  PALETTE_FAMILIES,
  contrastRatio,
  lightHexFor,
  mixHex,
  paletteFamilyFor,
  paletteFamilyKeyFor,
  rgbaOf,
} from '../palettes';
import { DEFAULT_PALETTE } from '../types';

const HEX = /^#[0-9A-F]{6}$/;

describe('PALETTE_FAMILIES', () => {
  test('has the eight families of the design table, in order', () => {
    expect(PALETTE_FAMILIES.map((f) => f.key)).toEqual([
      'sumi',
      'ai',
      'sabi',
      'umi',
      'kohaku',
      'hana',
      'koori',
      'midori',
    ]);
  });

  test('sumi has no dictionary; every other family has 8 to 12 words', () => {
    for (const family of PALETTE_FAMILIES) {
      if (family.key === 'sumi') expect(family.words).toEqual([]);
      else {
        expect(family.words.length).toBeGreaterThanOrEqual(8);
        expect(family.words.length).toBeLessThanOrEqual(12);
      }
    }
  });

  test.each(PALETTE_FAMILIES.map((f) => [f.key, f] as const))(
    '%s: ink >= 10:1 and accent >= 3.5:1 against the background',
    (_key, family) => {
      const { background, ink, accent } = family.palette;
      expect(contrastRatio(ink, background)).toBeGreaterThanOrEqual(10);
      expect(contrastRatio(accent, background)).toBeGreaterThanOrEqual(3.5);
    },
  );

  test('every family colour is #RRGGBB and every family names its light', () => {
    for (const { palette } of PALETTE_FAMILIES) {
      for (const hex of [palette.background, palette.ink, palette.accent, palette.accentHigh, palette.light]) {
        expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

describe('contrastRatio', () => {
  test('is 21 for black on white, 1 for a colour on itself, and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#7FA6FF', '#7FA6FF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#F2EFE6', '#0E0D0C')).toBeCloseTo(contrastRatio('#0E0D0C', '#F2EFE6'), 10);
  });

  test('matches the design estimate for the sumi red (about 3.9:1)', () => {
    expect(contrastRatio('#D7263D', '#0E0D0C')).toBeGreaterThan(3.7);
    expect(contrastRatio('#D7263D', '#0E0D0C')).toBeLessThan(4.1);
  });
});

describe('mixHex', () => {
  test('returns the ends at 0 and 1 and the midpoint at 0.5', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('#102030', '#203040', 0.5)).toBe('#182838');
  });
});

describe('rgbaOf', () => {
  test('writes a #RRGGBB colour as rgba() with the given alpha', () => {
    expect(rgbaOf('#0B0B0C', 0.6)).toBe('rgba(11, 11, 12, 0.6)');
    expect(rgbaOf('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)');
  });
});

describe('lightHexFor', () => {
  test('uses palette.light when it is given', () => {
    expect(lightHexFor({ ...DEFAULT_PALETTE, light: '#123456' })).toBe('#123456');
  });

  test('without light, mixes ink 40% toward accent, deterministically', () => {
    const palette = { background: '#000000', ink: '#FFFFFF', accent: '#000000' };
    // 255 * 0.6 = 153 = 0x99
    expect(lightHexFor(palette)).toBe('#999999');
    expect(lightHexFor(DEFAULT_PALETTE)).toBe(lightHexFor({ ...DEFAULT_PALETTE }));
    expect(lightHexFor(DEFAULT_PALETTE)).toBe(mixHex(DEFAULT_PALETTE.ink, DEFAULT_PALETTE.accent, 0.4));
    expect(lightHexFor(DEFAULT_PALETTE)).toMatch(HEX);
  });
});

describe('paletteFamilyFor', () => {
  const NO_HITS = ['ラララ', 'さよなら', 'もう少しだけ', 'la la la'];

  test('is deterministic for the same lines and seed', () => {
    const lines = ['遠い海を見ていた', '波の音だけ'];
    expect(paletteFamilyFor(lines, 's')).toBe(paletteFamilyFor(lines, 's'));
    expect(paletteFamilyFor(NO_HITS, 's')).toBe(paletteFamilyFor(NO_HITS, 's'));
  });

  test('sea and waves pick umi; night and moon pick ai', () => {
    expect(paletteFamilyFor(['遠い海を見ていた', '波の音だけ', 'さよなら'], 's').key).toBe('umi');
    expect(paletteFamilyFor(['ひとりの夜に', '月を探した'], 's').key).toBe('ai');
  });

  test('returns a family carrying its palette and texture', () => {
    const family = paletteFamilyFor(['ひとりの夜に', '月を探した'], 's');
    expect(family.palette.background).toBe('#0A0C14');
    expect(family.texture).toBe('void');
  });

  test('the family with more hits wins regardless of order', () => {
    // umi appears first but kohaku has more hits.
    const lines = ['海へ', '光の中で', '朝が来る', '燃える火'];
    expect(paletteFamilyFor(lines, 's').key).toBe('kohaku');
  });

  test('a word repeated in one line counts once; different words in one line each count', () => {
    // umi: 海 once (line 0, repeated in-line). ai: 夜 + 月 in line 1 = 2.
    expect(paletteFamilyFor(['海海海海', '夜と月'], 's').key).toBe('ai');
  });

  test('on a tie, the family that appeared in an earlier line wins', () => {
    expect(paletteFamilyFor(['森を抜けて', '雪が降る'], 's').key).toBe('midori');
    expect(paletteFamilyFor(['雪が降る', '森を抜けて'], 's').key).toBe('koori');
  });

  test('with no hits, the seed draws the family and spreads over the eight', () => {
    const seeds = ['song-a', 'song-b', 'song-c', 'song-d', 'song-e', 'song-f', 'song-g', 'song-h'];
    const keys = new Set(seeds.map((seed) => paletteFamilyFor(NO_HITS, seed).key));
    expect(keys.size).toBeGreaterThanOrEqual(3);
  });

  test('empty lyrics fall back to the seed draw', () => {
    expect(PALETTE_FAMILIES).toContain(paletteFamilyFor([], 'x'));
  });
});

describe('paletteFamilyKeyFor', () => {
  test('finds the family of a family palette, even a copy', () => {
    for (const family of PALETTE_FAMILIES) {
      expect(paletteFamilyKeyFor({ ...family.palette })).toBe(family.key);
    }
  });

  test('returns null for a palette outside the families', () => {
    expect(paletteFamilyKeyFor({ background: '#000000', ink: '#EEEEEE', accent: '#FF0000' })).toBeNull();
  });
});
