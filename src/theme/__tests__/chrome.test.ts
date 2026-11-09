import { PALETTE_FAMILIES, contrastRatio, mixHex } from '../../direction/palettes';
import { DEFAULT_PALETTE } from '../../direction/types';
import { DEFAULT_CHROME_THEME, chromeFont, chromeTheme } from '../chrome';

const HEX = /^#[0-9A-F]{6}$/;

describe('chromeTheme', () => {
  test('derives every colour from the palette (§3f.2)', () => {
    const p = DEFAULT_PALETTE;
    expect(chromeTheme(p)).toEqual({
      ink: p.ink,
      inkMuted: mixHex(p.ink, p.background, 0.45),
      border: mixHex(p.ink, p.background, 0.65),
      accent: p.accent,
      surface: mixHex(p.background, p.ink, 0.06),
      scrim: 'rgba(11, 11, 12, 0.6)',
      pressed: 'rgba(215, 38, 61, 0.18)',
      fonts: {},
    });
  });

  test('the default theme is the default palette with no fonts loaded', () => {
    expect(DEFAULT_CHROME_THEME).toEqual(chromeTheme(DEFAULT_PALETTE));
    expect(DEFAULT_CHROME_THEME.fonts).toEqual({});
  });

  test('carries the loaded font names', () => {
    const fonts = { regular: 'R', bold: 'B' };
    expect(chromeTheme(DEFAULT_PALETTE, fonts).fonts).toBe(fonts);
  });

  describe.each(PALETTE_FAMILIES.map((f) => [f.key, f.palette] as const))('family %s', (_key, palette) => {
    const theme = chromeTheme(palette);

    test('ink stays readable on the sheet surface (>= 10:1)', () => {
      expect(theme.surface).toMatch(HEX);
      expect(contrastRatio(theme.ink, theme.surface)).toBeGreaterThanOrEqual(10);
    });

    test('muted ink stays readable on the ground (>= 4.5:1)', () => {
      expect(theme.inkMuted).toMatch(HEX);
      expect(contrastRatio(theme.inkMuted, palette.background)).toBeGreaterThanOrEqual(4.5);
    });

    test('the border sits between ink and the ground', () => {
      const toGround = contrastRatio(theme.border, palette.background);
      expect(toGround).toBeGreaterThan(1);
      expect(toGround).toBeLessThan(contrastRatio(palette.ink, palette.background));
      expect(toGround).toBeLessThan(contrastRatio(theme.inkMuted, palette.background));
    });
  });
});

describe('chromeFont', () => {
  test('uses the system font at the weight until the gothic loads', () => {
    expect(chromeFont(DEFAULT_CHROME_THEME, 'bold')).toEqual({ fontWeight: '700' });
    expect(chromeFont(DEFAULT_CHROME_THEME, 'regular')).toEqual({ fontWeight: '400' });
  });

  test('uses the bundled family, without a weight, once loaded', () => {
    const theme = chromeTheme(DEFAULT_PALETTE, { regular: 'R', bold: 'B' });
    expect(chromeFont(theme, 'bold')).toEqual({ fontFamily: 'B' });
    expect(chromeFont(theme, 'regular')).toEqual({ fontFamily: 'R' });
  });
});
