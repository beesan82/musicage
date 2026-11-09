import type { LineDirection } from '../direction/types';
import { METER_MAX_HEIGHT } from './bandMeter';
import type { FontKey, FontWeight } from './fonts';
import type { IdleFaces } from './idleComposition';
import { SIZE_RATIO, verticalOrigin } from './layout';
import type { GlyphMeasure, LineLayout, PlacedGlyph, PrintArea, Viewport } from './layout';
import { fitRow, NAMEPLATE_RULE_HEIGHT, NAMEPLATE_RULE_WIDTH, rowGlyphs, rowWidth, titleOrientation } from './nameplate';

// The lyric sheet (design spec §7, 2026-11-10): what the stage prints for a
// recognised song whose lyrics LRCLIB has only as plain text, without times.
// The stage does not know which line is being sung, so it does not pretend
// to: the text is set as one printed sheet, like the lyric card in a record
// sleeve, and turned page by page on a fixed, slow interval that nothing in
// the music (beat, bar, energy, bands, surge, song position) feeds into.
// Nothing in the body is ever highlighted, and it does not move.
//
// Vertical bands inside the print area, top to bottom:
//   the heading: the title (primary face, s, one row), TITLE_ARTIST_GAP,
//     the artist (secondary face, xs, one row); each cut with the ellipsis
//   HEADING_RULE_GAP, the accent rule 12×2, BODY_GAP
//   the body (one page of it)
//   METER_GAP
//   the band meter (METER_MAX_HEIGHT tall, standing on area.bottom)
// and on the caption row, the note at the left and, with two pages or more,
// the folio (`2 / 3`) at the right.
//
// The body (plainParagraphs, then wrapping and pagination):
// - Lines are split at line breaks, trimmed, inner runs of blanks collapsed.
//   Blank lines separate paragraphs (any number of them is one break).
// - Vertical when the text has any kana or kanji (titleOrientation), set
//   column by column from the right, each glyph placed as layoutLine places
//   it (verticalOrigin); horizontal otherwise.
// - s in the primary face, regular, on every page; rows (columns) are
//   sizePx · PLAIN_LEADING apart.
// - A line too long for a row wraps; its further rows are indented one em.
//   A Latin word is not broken unless it is longer than a row. A row never
//   starts with closing punctuation: the previous row's last token moves down
//   with it.
// - One empty row (column) between paragraphs. A paragraph that fits on a
//   page is never split across pages: it starts a new page instead. A
//   paragraph longer than a page breaks between its lines; a line longer than
//   a page between its rows. A page never starts with the empty row.

/** The body's size. */
export const PLAIN_BODY_SIZE = 's' as const;
/** Rows (columns) of the body are this many sizePx apart. */
export const PLAIN_LEADING = 1.7;
/** The indent of a wrapped line's further rows, in sizePx. */
export const PLAIN_WRAP_INDENT = 1;
/** The body first shows this long after the sheet comes on (wall clock; longer than a drop's wait and scatter). */
export const PLAIN_BODY_DELAY_MS = 1_500;
/** Each page is up for this long, fades included. A fixed interval: never derived from the song. */
export const PLAIN_PAGE_MS = 16_000;
/** A page fades in over this, and out over this before the next one. */
export const PLAIN_PAGE_FADE_MS = 1_200;
/** The body fades out over this when the sheet leaves the stage. */
export const PLAIN_EXIT_MS = 400;

const TITLE_ARTIST_GAP = 8;
const HEADING_RULE_GAP = 10;
const BODY_GAP = 20;
/** Between the body's room and the top of the meter's room (as on the nameplate). */
const METER_GAP = 20;
const EPSILON = 1e-6;

/** Latin letters, digits and the marks inside a word: a run of these is not broken across rows. */
const WORD_CHAR = /[A-Za-z0-9À-ɏ'’-]/;
/** Never at the head of a row (行頭禁則). */
const NO_ROW_START = /^[、。，．,.!?！？」』）)\]］】〉ー…]$/;

export interface PlainSheetTrack {
  title: string;
  artist: string;
}

type Box = { x: number; y: number; width: number; height: number };

/** One drawn piece of a page: a whole row (horizontal) or one glyph (vertical). */
export interface PlainRun {
  text: string;
  /** Baseline origin, as for a PlacedGlyph. */
  x: number;
  y: number;
  /** 90: drawn turned clockwise about its origin (Latin in a vertical column). */
  rotateDeg: 0 | 90;
}

export interface PlainPage {
  runs: PlainRun[];
  bounds: Box;
}

export interface PlainSheet {
  /** The title as the line on stage (one row, s); `text` is what is printed. */
  title: { text: string; direction: LineDirection; layout: LineLayout };
  artist: { text: string; glyphs: PlacedGlyph[]; sizePx: number };
  /** The accent rule between the heading and the body. */
  rule: Box;
  body: {
    orientation: LineDirection['orientation'];
    font: FontKey;
    sizePx: number;
    pages: PlainPage[];
    /** All the pages together: the lamp's centre, which page turns do not move. */
    bounds: Box;
  };
  meter: { x: number; width: number; baseline: number; maxHeight: number };
  /** The note's baseline origin and size (gothic xs, caption row, left). */
  note: { x: number; y: number; sizePx: number };
  /** One per page when there are two or more (none for a single page): right-aligned on the caption row. */
  folios: { text: string; x: number; y: number; sizePx: number }[];
}

/**
 * The text's paragraphs, each a list of its lines (trimmed, blanks collapsed).
 * Empty when there is nothing printable: the stage keeps the nameplate then.
 */
export function plainParagraphs(text: string): string[][] {
  const paragraphs: string[][] = [];
  let current: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line === '') {
      if (current.length > 0) paragraphs.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) paragraphs.push(current);
  return paragraphs;
}

/** A line as tokens: a Latin word, a single space, or one other character. */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let word = '';
  for (const char of line) {
    if (WORD_CHAR.test(char)) {
      word += char;
      continue;
    }
    if (word !== '') tokens.push(word);
    word = '';
    tokens.push(char);
  }
  if (word !== '') tokens.push(word);
  return tokens;
}

/**
 * Wraps one line into rows: the first no longer than `limit`, the rest no
 * longer than `limit − indent` (they are indented). Greedy over tokens; a word
 * longer than its row is broken into characters; closing punctuation never
 * starts a row (the previous row's last token comes down with it, when that
 * row keeps at least one other and the pair fits).
 */
export function wrapPlainLine(
  line: string,
  limit: number,
  indent: number,
  extentOf: (char: string) => number,
): string[] {
  const extent = (token: string) => [...token].reduce((sum, char) => sum + extentOf(char), 0);
  const rows: string[][] = [];
  let row: string[] = [];
  let used = 0;
  const trimEnd = (tokens: string[]) => {
    while (tokens.length > 0 && tokens[tokens.length - 1] === ' ') tokens.pop();
  };
  const close = () => {
    trimEnd(row);
    rows.push(row);
    row = [];
    used = 0;
  };
  const queue = tokenize(line);
  while (queue.length > 0) {
    const token = queue.shift()!;
    if (token === ' ') {
      if (row.length > 0) {
        row.push(token);
        used += extent(token);
      }
      continue;
    }
    const size = extent(token);
    const room = rows.length === 0 ? limit : limit - indent;
    if (row.length > 0 && used + size > room + EPSILON) {
      close();
      const previous = rows[rows.length - 1]!;
      const carried = previous[previous.length - 1];
      if (
        NO_ROW_START.test(token) &&
        carried !== undefined &&
        previous.filter((t) => t !== ' ').length >= 2 &&
        extent(carried) + size <= limit - indent + EPSILON
      ) {
        previous.pop();
        trimEnd(previous);
        row = [carried];
        used = extent(carried);
      }
      queue.unshift(token);
      continue;
    }
    if (size > room + EPSILON && [...token].length > 1) {
      queue.unshift(...token);
      continue;
    }
    row.push(token);
    used += size;
  }
  if (row.length > 0) close();
  return rows.map((tokens) => tokens.join('')).filter((text) => text !== '');
}

interface Slot {
  text: string;
  /** A wrapped line's further row: indented. */
  continued: boolean;
}

/**
 * Pages of at most `capacity` slots each. Paragraphs are separated by one
 * empty slot (null); see the rules at the top of this file.
 */
export function paginatePlain(paragraphs: readonly (readonly (readonly Slot[])[])[], capacity: number): (Slot | null)[][] {
  const cap = Math.max(1, capacity);
  const pages: (Slot | null)[][] = [];
  let page: (Slot | null)[] = [];
  const flush = () => {
    if (page.length > 0) pages.push(page);
    page = [];
  };
  for (const lines of paragraphs) {
    const size = lines.reduce((n, rows) => n + rows.length, 0);
    if (page.length > 0) {
      if (page.length + 1 + size <= cap) page.push(null);
      else flush();
    }
    for (const rows of lines) {
      if (page.length > 0 && page.length + rows.length > cap && rows.length <= cap) flush();
      for (const row of rows) {
        if (page.length >= cap) flush();
        page.push(row);
      }
    }
  }
  flush();
  return pages;
}

function union(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The ascent (most negative) and descent (largest) over every character of `texts`. */
function extents(texts: readonly string[], sizePx: number, measure: GlyphMeasure) {
  let ascent = 0;
  let descent = 0;
  let any = false;
  for (const text of texts) {
    for (const char of text) {
      if (char.trim() === '') continue;
      const m = measure(char, sizePx);
      ascent = Math.min(ascent, m.ascent);
      descent = Math.max(descent, m.descent);
      any = true;
    }
  }
  if (!any) {
    const m = measure('0', sizePx);
    return { ascent: m.ascent, descent: m.descent };
  }
  return { ascent, descent };
}

export function plainTitleDirection(faces: IdleFaces): LineDirection {
  return {
    font: faces.primary,
    weight: faces.anchorWeight,
    size: 's',
    orientation: 'horizontal',
    entrance: 'rise',
    hold: 'still',
    emphasis: [],
    accent: false,
    ornament: 'none',
  };
}

/**
 * Lays the lyric sheet out in `area` (the print area). Returns null when the
 * title is blank or the text has nothing printable: the stage keeps the
 * nameplate (or idle) then.
 */
export function composePlainSheet(
  track: PlainSheetTrack,
  text: string,
  faces: IdleFaces,
  viewport: Viewport,
  area: PrintArea,
  measureFor: (font: FontKey, weight: FontWeight) => GlyphMeasure,
): PlainSheet | null {
  const title = track.title.trim();
  const paragraphs = plainParagraphs(text);
  if (title === '' || paragraphs.length === 0) return null;
  const width = area.right - area.left;
  const xsPx = viewport.width * SIZE_RATIO.xs;
  const sPx = viewport.width * SIZE_RATIO.s;

  // The heading: the title, then the artist, one row each.
  const direction = plainTitleDirection(faces);
  const titleMeasure = measureFor(direction.font, direction.weight);
  const titleText = fitRow(title, sPx, titleMeasure, width);
  const titleExtent = extents([titleText], sPx, titleMeasure);
  const titleBaseline = area.top - titleExtent.ascent;
  const titleGlyphs = rowGlyphs(titleText, area.left, titleBaseline, sPx, titleMeasure);
  const layout: LineLayout = {
    glyphs: titleGlyphs,
    sizePx: sPx,
    bounds: {
      x: area.left,
      y: titleBaseline + titleExtent.ascent,
      width: rowWidth(titleText, sPx, titleMeasure),
      height: titleExtent.descent - titleExtent.ascent,
    },
    columns: 1,
  };

  const secondary = measureFor(faces.secondary, 'regular');
  const artist = track.artist.trim();
  const artistText = artist === '' ? '' : fitRow(artist, xsPx, secondary, width);
  const artistExtent = extents([artistText], xsPx, secondary);
  const artistBaseline = titleBaseline + titleExtent.descent + TITLE_ARTIST_GAP - artistExtent.ascent;
  const artistGlyphs = artistText === '' ? [] : rowGlyphs(artistText, area.left, artistBaseline, xsPx, secondary);
  const rule = {
    x: area.left,
    y: artistBaseline + artistExtent.descent + HEADING_RULE_GAP,
    width: NAMEPLATE_RULE_WIDTH,
    height: NAMEPLATE_RULE_HEIGHT,
  };

  // The meter on the foot of the print area, the body between.
  const meter = { x: area.left, width, baseline: area.bottom, maxHeight: METER_MAX_HEIGHT };
  const bodyTop = rule.y + rule.height + BODY_GAP;
  const bodyBottom = area.bottom - METER_MAX_HEIGHT - METER_GAP;
  const bodyHeight = Math.max(0, bodyBottom - bodyTop);

  const orientation = titleOrientation(paragraphs.flat().join(''));
  const vertical = orientation === 'vertical';
  const font = faces.primary;
  const bodyMeasure = measureFor(font, 'regular');
  const sizePx = viewport.width * SIZE_RATIO[PLAIN_BODY_SIZE];
  const pitch = sizePx * PLAIN_LEADING;
  const indent = sizePx * PLAIN_WRAP_INDENT;
  // A vertical row is a column of square cells; a horizontal one advances glyph by glyph.
  const extentOf: (char: string) => number = vertical ? () => sizePx : (char) => bodyMeasure(char, sizePx).advance;
  const rowLimit = vertical ? bodyHeight : width;
  const wrapped = paragraphs.map((lines) =>
    lines.map((line) =>
      wrapPlainLine(line, rowLimit, indent, extentOf).map((row, i): Slot => ({ text: row, continued: i > 0 })),
    ),
  );
  const bodyExtent = extents(paragraphs.flat(), sizePx, bodyMeasure);
  const capacity = vertical
    ? Math.floor((width - sizePx) / pitch + EPSILON) + 1
    : Math.floor((bodyHeight - (bodyExtent.descent - bodyExtent.ascent)) / pitch + EPSILON) + 1;
  const slotted = paginatePlain(wrapped, capacity);

  const pages = slotted.map((slots): PlainPage => {
    const runs: PlainRun[] = [];
    const boxes: Box[] = [];
    slots.forEach((slot, i) => {
      if (slot === null) return;
      const lead = slot.continued ? indent : 0;
      if (vertical) {
        const centerX = area.right - sizePx / 2 - i * pitch;
        const top = bodyTop + lead;
        const chars = [...slot.text];
        chars.forEach((char, j) => {
          if (char.trim() === '') return;
          const { x, y, rotateDeg } = verticalOrigin(char, bodyMeasure(char, sizePx), sizePx, centerX, top + j * sizePx);
          runs.push({ text: char, x, y, rotateDeg });
        });
        boxes.push({ x: centerX - sizePx / 2, y: top, width: sizePx, height: chars.length * sizePx });
      } else {
        const x = area.left + lead;
        const y = bodyTop - bodyExtent.ascent + i * pitch;
        runs.push({ text: slot.text, x, y, rotateDeg: 0 });
        boxes.push({
          x,
          y: y + bodyExtent.ascent,
          width: rowWidth(slot.text, sizePx, bodyMeasure),
          height: bodyExtent.descent - bodyExtent.ascent,
        });
      }
    });
    return { runs, bounds: union(boxes) };
  });

  const gothic = measureFor('gothic', 'regular');
  const folios =
    pages.length < 2
      ? []
      : pages.map((_, i) => {
          const folio = `${i + 1} / ${pages.length}`;
          return { text: folio, x: area.right - rowWidth(folio, xsPx, gothic), y: area.captionBaseline, sizePx: xsPx };
        });

  return {
    title: { text: titleText, direction, layout },
    artist: { text: artistText, glyphs: artistGlyphs, sizePx: xsPx },
    rule,
    body: { orientation, font, sizePx, pages, bounds: union(pages.map((p) => p.bounds)) },
    meter,
    note: { x: area.left, y: area.captionBaseline, sizePx: xsPx },
    folios,
  };
}

/** Which page is up `elapsedMs` after the body's start: page 0 until then, then one per PLAIN_PAGE_MS, round and round. */
export function plainPageIndex(elapsedMs: number, pageCount: number): number {
  'worklet';
  if (pageCount <= 1 || !(elapsedMs > 0)) return 0;
  return Math.floor(elapsedMs / PLAIN_PAGE_MS) % pageCount;
}

/**
 * The body's opacity `elapsedMs` after its start: 0 before it; a single page
 * fades in once and stays; with more, each page fades in at the start of its
 * PLAIN_PAGE_MS and out at its end (one page never overlaps the next).
 */
export function plainPageOpacity(elapsedMs: number, pageCount: number): number {
  'worklet';
  if (!(elapsedMs > 0)) return 0;
  if (pageCount <= 1) return Math.min(1, elapsedMs / PLAIN_PAGE_FADE_MS);
  const within = elapsedMs % PLAIN_PAGE_MS;
  return Math.max(0, Math.min(1, within / PLAIN_PAGE_FADE_MS, (PLAIN_PAGE_MS - within) / PLAIN_PAGE_FADE_MS));
}

/** How long from `elapsedMs` until the page changes; null when it never does (a single page). */
export function plainNextTurnInMs(elapsedMs: number, pageCount: number): number | null {
  if (pageCount <= 1) return null;
  if (!(elapsedMs > 0)) return PLAIN_PAGE_MS - elapsedMs;
  return PLAIN_PAGE_MS - (elapsedMs % PLAIN_PAGE_MS);
}
