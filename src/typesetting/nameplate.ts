import type { LineDirection, Size } from '../direction/types';
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
//
// Fitting a long name (design spec §7, 2026-11-09 evening):
// - The title steps down xl → l → m → s, at most two columns (rows), as any
//   line does (layoutLine). It never goes below s: a title that would need xs,
//   or would not keep to its area at s, is cut to the longest head that does,
//   ending in NAMEPLATE_ELLIPSIS.
// - The artist is one row: s, else xs, else cut at xs with the ellipsis.
// Nothing is ever printed outside the print area.

/** The smallest size a nameplate's title is set in; below it the title is cut instead. */
export const NAMEPLATE_TITLE_MIN_SIZE: Size = 's';
/** Ends a name cut to fit. Upright in a horizontal title, turned with the column in a vertical one. */
export const NAMEPLATE_ELLIPSIS = '…';

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
  /** The title as the line on stage; `text` is what is printed (the title, or its head cut to fit). */
  title: { text: string; direction: LineDirection; layout: LineLayout };
  artist: {
    /** What is printed: the artist, or its head cut to fit. */
    text: string;
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

const EPSILON = 1e-6;

/** `text` cut after its first `count` characters (trailing spaces dropped) and ended with the ellipsis. */
function cut(chars: readonly string[], count: number): string {
  return chars.slice(0, count).join('').trimEnd() + NAMEPLATE_ELLIPSIS;
}

/**
 * The longest `cut` of `chars` for which `fits` holds, by bisection (a longer
 * head never fits where a shorter one does not); null if not even one character does.
 */
function longestCut<T>(chars: readonly string[], attempt: (text: string) => T, fits: (value: T) => boolean) {
  let best: { text: string; value: T } | null = null;
  let lo = 1;
  let hi = chars.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const text = cut(chars, mid);
    const value = attempt(text);
    if (fits(value)) {
      best = { text, value };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** One row of `text` no wider than `width`: the text itself, or its longest head that fits with the ellipsis. */
function fitRow(text: string, sizePx: number, measure: GlyphMeasure, width: number): string {
  if (rowWidth(text, sizePx, measure) <= width + EPSILON) return text;
  const best = longestCut([...text], (t) => rowWidth(t, sizePx, measure), (w) => w <= width + EPSILON);
  return best?.text ?? NAMEPLATE_ELLIPSIS;
}

function within(bounds: LineLayout['bounds'], area: PrintArea): boolean {
  return (
    bounds.x >= area.left - EPSILON &&
    bounds.x + bounds.width <= area.right + EPSILON &&
    bounds.y >= area.top - EPSILON &&
    bounds.y + bounds.height <= area.bottom + EPSILON
  );
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

  // The artist line above it, in s; a name too wide for the area drops to xs,
  // and one too wide even then is cut to fit.
  const areaWidth = area.right - area.left;
  let artistPx = viewport.width * SIZE_RATIO.s;
  let artistText = artist;
  if (artist !== '' && rowWidth(artist, artistPx, secondary) > areaWidth + EPSILON) {
    artistPx = viewport.width * SIZE_RATIO.xs;
    artistText = fitRow(artist, artistPx, secondary, areaWidth);
  }
  // The row's extent over all its characters: a name mixing kana and Latin
  // letters keeps clear of the rule above and the meter below whichever comes first.
  let ascent = 0;
  let descent = 0;
  for (const char of artistText === '' ? ['0'] : [...artistText]) {
    const m = secondary(char, artistPx);
    ascent = Math.min(ascent, m.ascent);
    descent = Math.max(descent, m.descent);
  }
  const artistBaseline = meterTop - METER_GAP - descent;
  const rule = {
    x: area.left,
    y: artistBaseline + ascent - RULE_GAP - NAMEPLATE_RULE_HEIGHT,
    width: NAMEPLATE_RULE_WIDTH,
    height: NAMEPLATE_RULE_HEIGHT,
  };
  const artistGlyphs = artistText === '' ? [] : rowGlyphs(artistText, area.left, artistBaseline, artistPx, secondary);

  // The title in what is left above, centred in it either way (layoutLine
  // centres a horizontal line itself; a vertical one is shifted here). The
  // orientation is the whole title's, so a cut title keeps it.
  const titleArea: PrintArea = { ...area, bottom: rule.y - ARTIST_GAP };
  const direction = titleDirection(title, faces);
  const titleMeasure = measureFor(direction.font, direction.weight);
  const minPx = viewport.width * SIZE_RATIO[NAMEPLATE_TITLE_MIN_SIZE];
  const setTitle = (text: string) => layoutLine(text, direction, viewport, titleMeasure, titleArea);
  const fits = (l: LineLayout) => l.glyphs.length > 0 && l.sizePx >= minPx - EPSILON && within(l.bounds, titleArea);
  let titleText = title;
  let layout = setTitle(title);
  if (!fits(layout)) {
    // Too long for two lines at the smallest title size: the longest head that
    // fits. (If not even one character does, the area is degenerate and the
    // whole title is left as layoutLine set it.)
    const best = longestCut([...title], setTitle, fits);
    if (best !== null) {
      titleText = best.text;
      layout = best.value;
    }
  }
  if (direction.orientation === 'vertical' && layout.glyphs.length > 0) {
    const room = titleArea.bottom - titleArea.top - layout.bounds.height;
    const shift = Math.max(0, room / 2);
    if (shift > 0) {
      layout.glyphs = layout.glyphs.map((g) => ({ ...g, y: g.y + shift }));
      layout.bounds = { ...layout.bounds, y: layout.bounds.y + shift };
    }
  }

  return {
    title: { text: titleText, direction, layout },
    artist: { text: artistText, glyphs: artistGlyphs, sizePx: artistPx, rule },
    meter,
    note: { x: area.left, y: area.captionBaseline, sizePx: viewport.width * SIZE_RATIO.xs },
  };
}
