import { METER_MAX_HEIGHT } from '../bandMeter';
import { UNRECOGNIZED_IDLE_FACES } from '../idleComposition';
import type { IdleFaces } from '../idleComposition';
import { printArea, SIZE_RATIO } from '../layout';
import type { GlyphMeasure } from '../layout';
import {
  composeNameplate,
  NAMEPLATE_ELLIPSIS,
  NAMEPLATE_RULE_HEIGHT,
  NAMEPLATE_RULE_WIDTH,
  titleDirection,
  titleOrientation,
} from '../nameplate';

// The jest Font: every glyph sizePx wide, ascent −0.88, descent 0.12.
const VIEWPORT = { width: 390, height: 844, insetTop: 47, insetBottom: 34 };
const measure: GlyphMeasure = (_char, sizePx) => ({ advance: sizePx, ascent: -sizePx * 0.88, descent: sizePx * 0.12 });
const measureFor = () => measure;
const XS = 390 * SIZE_RATIO.xs;
const S = 390 * SIZE_RATIO.s;
const AREA = printArea(VIEWPORT, -XS * 0.88);
const faces: IdleFaces = UNRECOGNIZED_IDLE_FACES;
// Fictional songs.
const song = { title: '架空の歌', artist: '架空の人' };
const latin = { title: 'Imaginary Song', artist: 'Nobody Band' };

const compose = (track = song) => {
  const plate = composeNameplate(track, faces, VIEWPORT, AREA, measureFor);
  if (plate === null) throw new Error('expected a nameplate');
  return plate;
};

describe('titleOrientation / titleDirection', () => {
  test('a title with kana or kanji stands vertical; a Latin title lies horizontal', () => {
    expect(titleOrientation('架空の歌')).toBe('vertical');
    expect(titleOrientation('ヨル')).toBe('vertical');
    expect(titleOrientation('Imaginary Song')).toBe('horizontal');
    expect(titleOrientation('Song ひとつ')).toBe('vertical');
  });

  test('the title is the line on stage in the primary face at xl, rising, holding pulse, no ornament', () => {
    expect(titleDirection('架空の歌', faces)).toEqual({
      font: faces.primary,
      weight: faces.anchorWeight,
      size: 'xl',
      orientation: 'vertical',
      entrance: 'rise',
      hold: 'pulse',
      emphasis: [],
      accent: false,
      ornament: 'none',
    });
    const gothic: IdleFaces = { primary: 'gothic', secondary: 'mincho', anchorWeight: 'bold' };
    expect(titleDirection('Imaginary Song', gothic)).toMatchObject({ font: 'gothic', weight: 'bold', orientation: 'horizontal' });
  });
});

describe('composeNameplate', () => {
  test('a blank title prints nothing (the stage shows idle instead)', () => {
    expect(composeNameplate({ title: '   ', artist: 'x' }, faces, VIEWPORT, AREA, measureFor)).toBeNull();
  });

  test('the meter stands on the foot of the print area, edge to edge', () => {
    const { meter } = compose();
    expect(meter).toEqual({ x: AREA.left, width: AREA.right - AREA.left, baseline: AREA.bottom, maxHeight: METER_MAX_HEIGHT });
  });

  test('the artist stands small (s) above the meter, under a 12×2 accent rule, from the left margin', () => {
    const { artist } = compose();
    expect(artist.sizePx).toBe(S);
    expect(artist.glyphs.map((g) => g.char)).toEqual([...song.artist]);
    const baseline = AREA.bottom - METER_MAX_HEIGHT - 20 - S * 0.12;
    for (const glyph of artist.glyphs) {
      expect(glyph.y).toBeCloseTo(baseline, 6);
      expect(glyph.rotateDeg).toBe(0);
      expect(glyph.emphasized).toBe(false);
    }
    expect(artist.glyphs[0]!.x).toBe(AREA.left);
    expect(artist.glyphs[1]!.x).toBeCloseTo(AREA.left + S, 6);
    expect(artist.rule).toMatchObject({ x: AREA.left, width: NAMEPLATE_RULE_WIDTH, height: NAMEPLATE_RULE_HEIGHT });
    // The rule's foot sits 6px above the artist's ascent.
    expect(artist.rule.y + NAMEPLATE_RULE_HEIGHT).toBeCloseTo(baseline - S * 0.88 - 6, 6);
  });

  test('an artist too wide for the print area at s drops to xs; spaces advance but are not placed', () => {
    // 16 glyphs: 374px at s (wider than the 342px area), 281px at xs.
    const wide = { title: '架空の歌', artist: 'Nobody Band Trio' };
    const { artist } = compose(wide);
    expect(artist.sizePx).toBe(XS);
    expect(artist.text).toBe(wide.artist);
    expect(artist.glyphs).toHaveLength([...wide.artist].filter((c) => c.trim() !== '').length);
  });

  test('an artist too wide even at xs is cut to its longest head that fits, ending in the ellipsis', () => {
    // 40 glyphs at xs is 702px; 19 glyphs (18 + the ellipsis) is the most that fits in 342px.
    const wide = { title: '架空の歌', artist: 'A very long imaginary artist name indeed' };
    const { artist } = compose(wide);
    expect(artist.sizePx).toBe(XS);
    expect(artist.text).toBe(`A very long imagin${NAMEPLATE_ELLIPSIS}`);
    expect(artist.glyphs.map((g) => g.char).join('')).toBe('Averylongimagin…');
    const last = artist.glyphs.at(-1)!;
    expect(last.x + XS).toBeLessThanOrEqual(AREA.right + 1e-6);
  });

  test('a cut never ends in a space before the ellipsis', () => {
    // The head of 18 would end in a space here; it is dropped.
    const { artist } = compose({ title: '架空の歌', artist: 'Imaginary artists of nowhere at all' });
    expect(artist.text).toMatch(/\S…$/u);
  });

  test('a vertical title is centred in the room above the artist’s rule, inside the print area', () => {
    const { title, artist } = compose();
    expect(title.direction.orientation).toBe('vertical');
    const titleBottom = artist.rule.y - 24;
    const { bounds } = title.layout;
    expect(bounds.y).toBeGreaterThanOrEqual(AREA.top - 1e-6);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(titleBottom + 1e-6);
    expect(bounds.y - AREA.top).toBeCloseTo(titleBottom - (bounds.y + bounds.height), 6);
    expect(bounds.x).toBeGreaterThanOrEqual(AREA.left - 1e-6);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(AREA.right + 1e-6);
    expect(title.layout.glyphs).toHaveLength(4);
  });

  test('a horizontal title is one glyph per non-space character, inside the print area above the artist', () => {
    const { title, artist } = compose(latin);
    expect(title.direction.orientation).toBe('horizontal');
    expect(title.layout.glyphs).toHaveLength([...latin.title].filter((c) => c.trim() !== '').length);
    const { bounds } = title.layout;
    expect(bounds.y).toBeGreaterThanOrEqual(AREA.top - 1e-6);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(artist.rule.y - 24 + 1e-6);
    expect(bounds.x).toBeGreaterThanOrEqual(AREA.left - 1e-6);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(AREA.right + 1e-6);
  });

  describe('fitting a long title (never below s, never outside its area)', () => {
    // The room above the artist's rule is about 418px tall and 342px wide:
    // vertical s takes 17 glyphs a column, horizontal s 14 a row (jest Font).
    const fictional = (n: number) => Array.from({ length: n }, (_, i) => '架空夜歌'[i % 4]).join('');
    const latinOf = (n: number) => Array.from({ length: n }, (_, i) => 'Imaginary Song '[i % 15]).join('').trim();
    const titleRoom = (plate: ReturnType<typeof compose>) => ({ ...AREA, bottom: plate.artist.rule.y - 24 });
    const expectWithin = (plate: ReturnType<typeof compose>) => {
      const { bounds } = plate.title.layout;
      const room = titleRoom(plate);
      expect(bounds.x).toBeGreaterThanOrEqual(room.left - 1e-6);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(room.right + 1e-6);
      expect(bounds.y).toBeGreaterThanOrEqual(room.top - 1e-6);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(room.bottom + 1e-6);
    };

    test('a short title is printed whole at xl', () => {
      const plate = compose();
      expect(plate.title.text).toBe(song.title);
      expect(plate.title.layout.sizePx).toBe(390 * SIZE_RATIO.xl);
    });

    test('a vertical title that fits two columns at s is printed whole at s', () => {
      const title = fictional(34);
      const plate = compose({ title, artist: song.artist });
      expect(plate.title.text).toBe(title);
      expect(plate.title.layout.sizePx).toBe(S);
      expect(plate.title.layout.columns).toBe(2);
      expectWithin(plate);
    });

    test('a vertical title too long for two columns at s is cut to the longest head that fits, ending in the ellipsis', () => {
      const plate = compose({ title: fictional(60), artist: song.artist });
      expect(plate.title.text).toBe(`${fictional(33)}${NAMEPLATE_ELLIPSIS}`);
      expect(plate.title.layout.sizePx).toBe(S);
      expect(plate.title.layout.columns).toBe(2);
      expect(plate.title.layout.glyphs).toHaveLength(34);
      expect(plate.title.layout.glyphs.at(-1)!.char).toBe(NAMEPLATE_ELLIPSIS);
      // The orientation is the whole title's.
      expect(plate.title.direction.orientation).toBe('vertical');
      expectWithin(plate);
    });

    test('a horizontal title too long for two rows at s is cut the same way', () => {
      const title = latinOf(120);
      const plate = compose({ title, artist: latin.artist });
      expect(plate.title.direction.orientation).toBe('horizontal');
      expect(plate.title.text.endsWith(NAMEPLATE_ELLIPSIS)).toBe(true);
      expect(title.startsWith(plate.title.text.slice(0, -1))).toBe(true);
      expect(plate.title.layout.sizePx).toBe(S);
      expect(plate.title.layout.columns).toBeLessThanOrEqual(2);
      expectWithin(plate);
    });

    test('a long title mixing kana and Latin letters stands vertical and keeps to its area', () => {
      const title = `${'Imaginary '.repeat(4)}の${'夜歌'.repeat(12)}`;
      const plate = compose({ title, artist: 'Nobody 架空の人 Band' });
      expect(plate.title.direction.orientation).toBe('vertical');
      expect(plate.title.layout.sizePx).toBeGreaterThanOrEqual(S);
      expectWithin(plate);
    });

    test.each([
      ['vertical', (n: number) => fictional(n)],
      ['horizontal', (n: number) => latinOf(n)],
    ] as const)('every %s title length from 1 to 120 keeps to its area at s or larger', (_kind, of) => {
      for (let n = 1; n <= 120; n += 1) {
        const title = of(n);
        if (title === '') continue;
        const plate = compose({ title, artist: 'A very long imaginary artist name indeed' });
        expect(plate.title.layout.sizePx).toBeGreaterThanOrEqual(S);
        expect(plate.title.layout.columns).toBeLessThanOrEqual(2);
        expectWithin(plate);
        const lastArtist = plate.artist.glyphs.at(-1)!;
        expect(lastArtist.x + plate.artist.sizePx).toBeLessThanOrEqual(AREA.right + 1e-6);
      }
    });

    test('on a small screen (iPhone SE size) the same rules hold', () => {
      const small = { width: 320, height: 568, insetTop: 20, insetBottom: 0 };
      const area = printArea(small, -320 * SIZE_RATIO.xs * 0.88);
      const smallS = 320 * SIZE_RATIO.s;
      for (const title of [fictional(80), latinOf(120), song.title]) {
        const plate = composeNameplate({ title, artist: 'Nobody 架空の人 Band and Friends' }, faces, small, area, measureFor)!;
        const { bounds } = plate.title.layout;
        expect(plate.title.layout.sizePx).toBeGreaterThanOrEqual(smallS);
        expect(bounds.x).toBeGreaterThanOrEqual(area.left - 1e-6);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.right + 1e-6);
        expect(bounds.y).toBeGreaterThanOrEqual(area.top - 1e-6);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(plate.artist.rule.y - 24 + 1e-6);
      }
    });
  });

  test('an artist mixing scripts keeps clear of the meter by its deepest descent', () => {
    // Latin letters narrower and deeper than kana here, as in a real face.
    const mixed: GlyphMeasure = (char, sizePx) =>
      /[A-Za-z ]/.test(char)
        ? { advance: sizePx * 0.55, ascent: -sizePx * 0.75, descent: sizePx * 0.25 }
        : { advance: sizePx, ascent: -sizePx * 0.88, descent: sizePx * 0.12 };
    const plate = composeNameplate({ title: song.title, artist: '架空のNobody' }, faces, VIEWPORT, AREA, () => mixed)!;
    const baseline = plate.artist.glyphs[0]!.y;
    const meterTop = AREA.bottom - METER_MAX_HEIGHT;
    // The deepest descent (the Latin letters') ends METER_GAP (20px) above the meter.
    expect(baseline + S * 0.25).toBeCloseTo(meterTop - 20, 6);
    // The rule clears the tallest ascent (the kana's) by 6px.
    expect(plate.artist.rule.y + NAMEPLATE_RULE_HEIGHT).toBeCloseTo(baseline - S * 0.88 - 6, 6);
  });

  test('the note sits on the caption row at the left margin in xs', () => {
    expect(compose().note).toEqual({ x: AREA.left, y: AREA.captionBaseline, sizePx: XS });
  });

  test('a song without an artist still prints its title and meter', () => {
    const plate = compose({ title: '架空の歌', artist: '' });
    expect(plate.artist.glyphs).toEqual([]);
    expect(plate.title.layout.glyphs).toHaveLength(4);
    expect(plate.meter.baseline).toBe(AREA.bottom);
  });
});
