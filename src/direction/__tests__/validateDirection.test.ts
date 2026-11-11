import { validateSongDirection } from '../validateDirection';
import { DEFAULT_IDLE_GLYPHS, DEFAULT_PALETTE, type LineDirection } from '../types';

const TEXTS = ['夜の底で灯りを数える', '走れ！', '朝'];

function line(over: Partial<LineDirection> = {}): LineDirection {
  return {
    font: 'mincho',
    weight: 'regular',
    size: 'm',
    orientation: 'vertical',
    entrance: 'fade',
    hold: 'still',
    emphasis: [0],
    accent: false,
    ornament: 'none',
    ...over,
  };
}

function direction(lines: LineDirection[]) {
  return {
    palette: { ...DEFAULT_PALETTE },
    texture: 'grain',
    tempoFeel: 'sway',
    idleGlyphs: DEFAULT_IDLE_GLYPHS,
    lines,
  };
}

describe('validateSongDirection', () => {
  test('accepts a well-formed direction with matching line count', () => {
    const input = direction([line(), line({ font: 'gothic' }), line()]);
    expect(validateSongDirection(input, TEXTS)).toEqual(input);
  });

  test('rejects when lines.length differs from lineCount', () => {
    expect(validateSongDirection(direction([line(), line()]), TEXTS)).toBeNull();
  });

  test('rejects more than two fonts in one song', () => {
    const input = direction([line(), line({ font: 'gothic' }), line({ font: 'brush' })]);
    expect(validateSongDirection(input, TEXTS)).toBeNull();
  });

  test('rejects more than three xl lines', () => {
    const texts = ['あ', 'い', 'う', 'え'];
    const xl = line({ size: 'xl', emphasis: [] });
    expect(validateSongDirection(direction([xl, xl, xl, xl]), texts)).toBeNull();
    expect(
      validateSongDirection(direction([xl, xl, xl, line({ emphasis: [] })]), texts),
    ).not.toBeNull();
  });

  test('rejects scatter followed directly by scatter', () => {
    const s = line({ entrance: 'scatter' });
    expect(validateSongDirection(direction([s, s, line()]), TEXTS)).toBeNull();
    expect(validateSongDirection(direction([s, line(), s]), TEXTS)).not.toBeNull();
  });

  test('rejects shake followed directly by shake', () => {
    const s = line({ hold: 'shake' });
    expect(validateSongDirection(direction([s, s, line()]), TEXTS)).toBeNull();
  });

  test('rejects emphasis index beyond the line text length', () => {
    const input = direction([line(), line({ emphasis: [3] }), line()]);
    expect(validateSongDirection(input, TEXTS)).toBeNull();
  });

  test('rejects more than three emphasis indices', () => {
    const input = direction([line({ emphasis: [0, 1, 2, 3] }), line(), line()]);
    expect(validateSongDirection(input, TEXTS)).toBeNull();
  });

  describe('the optional second accent (palette.accentHigh)', () => {
    const base = direction([line(), line(), line()]);
    const withoutHigh = {
      background: DEFAULT_PALETTE.background,
      ink: DEFAULT_PALETTE.ink,
      accent: DEFAULT_PALETTE.accent,
    };

    test('passes and is kept when it is a well-formed colour', () => {
      const input = { ...base, palette: { ...withoutHigh, accentHigh: '#FF8800' } };
      expect(validateSongDirection(input, TEXTS)?.palette).toEqual({ ...withoutHigh, accentHigh: '#FF8800' });
    });

    test('passes when it is left out, and the result has no accentHigh', () => {
      const input = { ...base, palette: withoutHigh };
      const palette = validateSongDirection(input, TEXTS)?.palette;
      expect(palette).toEqual(withoutHigh);
      expect(palette).not.toHaveProperty('accentHigh');
    });

    test('fails when it is a broken colour or not a string', () => {
      for (const accentHigh of ['red', '#FF88', '#GGGGGG', 123, null]) {
        const input = { ...base, palette: { ...withoutHigh, accentHigh } };
        expect(validateSongDirection(input, TEXTS)).toBeNull();
      }
    });
  });

  describe('the optional lamp colour (palette.light)', () => {
    const base = direction([line(), line(), line()]);
    const withoutLight = { ...DEFAULT_PALETTE };

    test('passes and is kept when it is a well-formed colour', () => {
      const input = { ...base, palette: { ...withoutLight, light: '#F0E6D2' } };
      expect(validateSongDirection(input, TEXTS)?.palette).toEqual({ ...withoutLight, light: '#F0E6D2' });
    });

    test('passes when it is left out, and the result has no light', () => {
      const palette = validateSongDirection({ ...base, palette: withoutLight }, TEXTS)?.palette;
      expect(palette).toEqual(withoutLight);
      expect(palette).not.toHaveProperty('light');
    });

    test('is kept without accentHigh too', () => {
      const noHigh = { background: withoutLight.background, ink: withoutLight.ink, accent: withoutLight.accent };
      const input = { ...base, palette: { ...noHigh, light: '#C9D6F2' } };
      const palette = validateSongDirection(input, TEXTS)?.palette;
      expect(palette).toEqual({ ...noHigh, light: '#C9D6F2' });
      expect(palette).not.toHaveProperty('accentHigh');
    });

    test('fails when it is a broken colour or not a string', () => {
      for (const light of ['white', '#FFF', '#GGGGGG', 0, null]) {
        const input = { ...base, palette: { ...withoutLight, light } };
        expect(validateSongDirection(input, TEXTS)).toBeNull();
      }
    });
  });

  test('rejects bad colors, unknown enums and non-objects', () => {
    const base = direction([line(), line(), line()]);
    expect(
      validateSongDirection({ ...base, palette: { ...DEFAULT_PALETTE, ink: 'red' } }, TEXTS),
    ).toBeNull();
    expect(validateSongDirection({ ...base, texture: 'glitter' }, TEXTS)).toBeNull();
    expect(validateSongDirection(null, TEXTS)).toBeNull();
    expect(validateSongDirection('x', TEXTS)).toBeNull();
  });
});
