import { METER_MAX_HEIGHT } from '../bandMeter';
import { UNRECOGNIZED_IDLE_FACES } from '../idleComposition';
import type { IdleFaces } from '../idleComposition';
import { printArea, SIZE_RATIO } from '../layout';
import type { GlyphMeasure } from '../layout';
import {
  composeNameplate,
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

  test('an artist too wide for the print area drops to xs; spaces advance but are not placed', () => {
    const wide = { title: '架空の歌', artist: 'A very long imaginary artist name indeed' };
    const { artist } = compose(wide);
    expect(artist.sizePx).toBe(XS);
    expect(artist.glyphs).toHaveLength([...wide.artist].filter((c) => c.trim() !== '').length);
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
