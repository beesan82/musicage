import type { LineDirection } from '../direction/types';
import type { FontKey, FontWeight } from './fonts';
import type { IdleFaces } from './idleComposition';
import { layoutLine, SIZE_RATIO } from './layout';
import type { GlyphMeasure, LineLayout, PlacedGlyph, PrintArea, Viewport } from './layout';
import { METER_MAX_HEIGHT } from './bandMeter';

// The nameplate: what the stage prints for a recognised song it cannot follow
// line by line (no synced lyrics). The song's title is the line on stage, set
// large in the idle print's primary face; the artist stands small in the
// secondary face above the band meter at the foot of the print area; the
// caption row below carries a short honest note (recognitionCopy). The title
// takes the `pulse` hold, so it breathes on the beat heads like a lyric line
// would, and the meter answers the bands: the screen is visibly playing the
// music, without pretending to know its words.
//
// Vertical bands inside the print area, top to bottom:
//   title area  (the title, centred in it)
//   ARTIST_GAP
//   accent rule 12×2, RULE_GAP, artist line (secondary face, s)
//   METER_GAP
//   the meter (METER_MAX_HEIGHT tall, standing on area.bottom)
// and on the caption baseline, the note (gothic xs, like the idle caption).

/** Between the title's area and the artist's accent rule. */
const ARTIST_GAP = 24;
/** Between the artist's descent and the top of the meter's room. */
const METER_GAP = 20;
/** The artist line's accent rule (the idle caption's 12×2, spec §3e). */
export const NAMEPLATE_RULE_WIDTH = 12;
export const NAMEPLATE_RULE_HEIGHT = 2;
const RULE_GAP = 6;

export interface NameplateTrack {
  title: string;
  artist: string;
}

export interface Nameplate {
  /** The title as the line on stage. */
  title: { direction: LineDirection; layout: LineLayout };
  artist: {
    glyphs: PlacedGlyph[];
    sizePx: number;
    rule: { x: number; y: number; width: number; height: number };
  };
  /** The band meter's row: its rules stand on `baseline` and grow up to `maxHeight`. */
  meter: { x: number; width: number; baseline: number; maxHeight: number };
  /** The note's baseline origin and size (gothic xs on the caption row). */
  note: { x: number; y: number; sizePx: number };
}

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/u;

/** A title with any kana or kanji stands vertical, as the object's own writing does; a Latin title lies horizontal. */
export function titleOrientation(title: string): LineDirection['orientation'] {
  return CJK.test(title) ? 'vertical' : 'horizontal';
}

export function titleDirection(title: string, faces: IdleFaces): LineDirection {
  return {
    font: faces.primary,
    weight: faces.anchorWeight,
    size: 'xl',
    orientation: titleOrientation(title),
    entrance: 'rise',
    hold: 'pulse',
    emphasis: [],
    accent: false,
    ornament: 'none',
  };
}

/** A horizontal row of glyphs from `x` on `baseline`; spaces advance but are not placed. */
function rowGlyphs(text: string, x: number, baseline: number, sizePx: number, measure: GlyphMeasure): PlacedGlyph[] {
  const glyphs: PlacedGlyph[] = [];
  let cursor = x;
  [...text].forEach((char, index) => {
    const { advance } = measure(char, sizePx);
    if (char.trim() !== '') {
      glyphs.push({ char, index, x: cursor, y: baseline, rotateDeg: 0, sizePx, emphasized: false });
    }
    cursor += advance;
  });
  return glyphs;
}

function rowWidth(text: string, sizePx: number, measure: GlyphMeasure): number {
  return [...text].reduce((w, char) => w + measure(char, sizePx).advance, 0);
}

/**
 * Lays the nameplate out in `area` (the print area). Returns null when the
 * title is blank: there is nothing to print, and the stage shows idle instead.
 */
export function composeNameplate(
  track: NameplateTrack,
  faces: IdleFaces,
  viewport: Viewport,
  area: PrintArea,
  measureFor: (font: FontKey, weight: FontWeight) => GlyphMeasure,
): Nameplate | null {
  const title = track.title.trim();
  if (title === '') return null;
  const artist = track.artist.trim();
  const secondary = measureFor(faces.secondary, 'regular');

  // The meter stands on the foot of the print area.
  const meterTop = area.bottom - METER_MAX_HEIGHT;
  const meter = { x: area.left, width: area.right - area.left, baseline: area.bottom, maxHeight: METER_MAX_HEIGHT };

  // The artist line above it, in s; a name too wide for the area drops to xs.
  let artistPx = viewport.width * SIZE_RATIO.s;
  if (artist !== '' && rowWidth(artist, artistPx, secondary) > area.right - area.left) {
    artistPx = viewport.width * SIZE_RATIO.xs;
  }
  const { ascent, descent } = secondary(artist === '' ? '0' : [...artist][0]!, artistPx);
  const artistBaseline = meterTop - METER_GAP - descent;
  const rule = {
    x: area.left,
    y: artistBaseline + ascent - RULE_GAP - NAMEPLATE_RULE_HEIGHT,
    width: NAMEPLATE_RULE_WIDTH,
    height: NAMEPLATE_RULE_HEIGHT,
  };
  const artistGlyphs = artist === '' ? [] : rowGlyphs(artist, area.left, artistBaseline, artistPx, secondary);

  // The title in what is left above, centred in it either way (layoutLine
  // centres a horizontal line itself; a vertical one is shifted here).
  const titleArea: PrintArea = { ...area, bottom: rule.y - ARTIST_GAP };
  const direction = titleDirection(title, faces);
  const layout = layoutLine(title, direction, viewport, measureFor(direction.font, direction.weight), titleArea);
  if (direction.orientation === 'vertical' && layout.glyphs.length > 0) {
    const room = titleArea.bottom - titleArea.top - layout.bounds.height;
    const shift = Math.max(0, room / 2);
    if (shift > 0) {
      layout.glyphs = layout.glyphs.map((g) => ({ ...g, y: g.y + shift }));
      layout.bounds = { ...layout.bounds, y: layout.bounds.y + shift };
    }
  }

  return {
    title: { direction, layout },
    artist: { glyphs: artistGlyphs, sizePx: artistPx, rule },
    meter,
    note: { x: area.left, y: area.captionBaseline, sizePx: viewport.width * SIZE_RATIO.xs },
  };
}
