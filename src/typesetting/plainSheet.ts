import type { LineDirection } from '../direction/types';
import { METER_MAX_HEIGHT } from './bandMeter';
import type { FontKey, FontWeight } from './fonts';
import type { IdleFaces } from './idleComposition';
import { SIZE_RATIO, verticalOrigin } from './layout';
import type { GlyphMeasure, LineLayout, PlacedGlyph, PrintArea, Viewport } from './layout';
import { fitRow, NAMEPLATE_RULE_HEIGHT, NAMEPLATE_RULE_WIDTH, rowGlyphs, rowWidth, titleOrientation } from './nameplate';

// The lyric sheet (design spec §7, 2026-11-10; whole text on one sheet,
// 2026-11-11): what the stage prints for a recognised song whose lyrics
// LRCLIB has only as plain text, without times. The stage does not know which
// line is being sung, so it does not pretend to: the whole text is set as one
// printed sheet, like the lyric card in a record sleeve, and all of it stays
// on view. Nothing in the body changes with time once it is in (no pages, no
// turning, no scrolling), nothing in it is ever highlighted, and nothing in
// the music (beat, bar, energy, bands, surge, song position) reaches it.
//
// Vertical bands inside the print area, top to bottom:
//   the heading: the title (primary face, s, one row), TITLE_ARTIST_GAP,
//     the artist (secondary face, xs, one row); each cut with the ellipsis
//   HEADING_RULE_GAP, the accent rule 12×2, BODY_GAP
//   the body (the whole text)
//   METER_GAP
//   the band meter (METER_MAX_HEIGHT tall, standing on area.bottom)
// and on the caption row, the note at the left.
//
// The body (plainParagraphs, then wrapping and fitting):
// - Lines are split at line breaks, trimmed, inner runs of blanks collapsed.
//   Blank lines separate paragraphs (any number of them is one break).
// - Vertical when the text has any kana or kanji (titleOrientation), set
//   column by column from the right, each glyph placed as layoutLine places
//   it (verticalOrigin); horizontal otherwise, row by row down.
// - A line too long for a row wraps; its further rows are indented one em.
//   A Latin word is not broken unless it is longer than a row. A row never
//   starts with closing punctuation: the previous row's last token moves down
//   with it.
// - One empty row (column) between paragraphs; a tier never starts or ends
//   with it.
// - Fitting (fitPlainBody), the first that holds the whole text wins:
//   1. one tier at each of PLAIN_SIZE_STEPS in turn (s first, the floor last);
//   2. at the floor, 2, 3, … tiers (段組み: vertical tiers stacked down the
//      room, horizontal ones side by side), each tier's rows (columns) at
//      least PLAIN_MIN_TIER_EM long;
//   3. the last resort: below the floor, the size shrinks by
//      PLAIN_SQUEEZE_FACTOR (at the floor's leading), trying 1, 2, … tiers at
//      each size, until the whole text fits.
//   Within a tier count, a paragraph that fits in a tier is kept in one
//   (fillTiers, keeping paragraphs); failing that the text flows from tier to
//   tier, breaking anywhere. The text is never cut short and never turned.

/**
 * The body's sizes, largest first: a share of the viewport width (as
 * SIZE_RATIO) and the leading (rows or columns are sizePx · leading apart).
 * The first is s; the last is the floor.
 */
export const PLAIN_SIZE_STEPS: readonly { readonly ratio: number; readonly leading: number }[] = [
  { ratio: SIZE_RATIO.s, leading: 1.7 },
  { ratio: 0.053, leading: 1.65 },
  { ratio: 0.047, leading: 1.6 },
  { ratio: 0.041, leading: 1.55 },
  { ratio: 0.036, leading: 1.5 },
  { ratio: 0.032, leading: 1.45 },
];
/** At the floor and below it, a tier's rows (columns) are at least this many sizePx long. */
export const PLAIN_MIN_TIER_EM = 8;
/** Between tiers, in sizePx. */
export const PLAIN_TIER_GAP = 1.5;
/** The last resort: below the floor, the size shrinks by this factor at a time until the whole text fits. */
export const PLAIN_SQUEEZE_FACTOR = 0.9;
/** A guard on the last resort (no lyric comes near it): past it the text is set whole at that size, even over the room. */
export const PLAIN_SQUEEZE_LIMIT = 60;
/** The indent of a wrapped line's further rows, in sizePx. */
export const PLAIN_WRAP_INDENT = 1;
/** The body first shows this long after the sheet comes on (wall clock; longer than a drop's wait and scatter). */
export const PLAIN_BODY_DELAY_MS = 1_500;
/** The body fades in over this, once; then it stays as it is. */
export const PLAIN_BODY_FADE_MS = 1_200;
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

/** The room the body is set in. */
export interface PlainRoom {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** One drawn piece of the body: a whole row (horizontal) or one glyph (vertical). */
export interface PlainRun {
  text: string;
  /** Baseline origin, as for a PlacedGlyph. */
  x: number;
  y: number;
  /** 90: drawn turned clockwise about its origin (Latin in a vertical column). */
  rotateDeg: 0 | 90;
}

/** The whole body as set (fitPlainBody). */
export interface PlainBodyFit {
  sizePx: number;
  leading: number;
  /** The index into PLAIN_SIZE_STEPS; PLAIN_SIZE_STEPS.length when squeezed below the floor (the last resort). */
  step: number;
  /** How many tiers the room is split into (1: none). */
  tiers: number;
  /** Every run of the text, all drawn at once. */
  runs: PlainRun[];
  bounds: Box;
}

export interface PlainSheet {
  /** The title as the line on stage (one row, s); `text` is what is printed. */
  title: { text: string; direction: LineDirection; layout: LineLayout };
  artist: { text: string; glyphs: PlacedGlyph[]; sizePx: number };
  /** The accent rule between the heading and the body. */
  rule: Box;
  body: PlainBodyFit & {
    orientation: LineDirection['orientation'];
    font: FontKey;
  };
  meter: { x: number; width: number; baseline: number; maxHeight: number };
  /** The note's baseline origin and size (gothic xs, caption row, left). */
  note: { x: number; y: number; sizePx: number };
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

export interface Slot {
  text: string;
  /** A wrapped line's further row: indented. */
  continued: boolean;
}

/**
 * The wrapped text in tiers of at most `capacity` slots each, in reading
 * order; paragraphs are separated by one empty slot (null), which never
 * starts or ends a tier. Keeping paragraphs: a paragraph that fits in a tier
 * is not split across two (it starts the next one instead); one longer than a
 * tier breaks between its lines, a line longer than a tier between its rows.
 * Flowing: the slots fill each tier in turn, breaking anywhere.
 */
export function fillTiers(
  paragraphs: readonly (readonly (readonly Slot[])[])[],
  capacity: number,
  keepParagraphs: boolean,
): (Slot | null)[][] {
  const cap = Math.max(1, capacity);
  const tiers: (Slot | null)[][] = [];
  let tier: (Slot | null)[] = [];
  const flush = () => {
    if (tier.length > 0) tiers.push(tier);
    tier = [];
  };
  for (const lines of paragraphs) {
    const size = lines.reduce((n, rows) => n + rows.length, 0);
    if (tier.length > 0) {
      if (keepParagraphs ? tier.length + 1 + size <= cap : tier.length + 1 < cap) tier.push(null);
      else flush();
    }
    for (const rows of lines) {
      if (keepParagraphs && tier.length > 0 && tier.length + rows.length > cap && rows.length <= cap) flush();
      for (const row of rows) {
        if (tier.length >= cap) flush();
        tier.push(row);
      }
    }
  }
  flush();
  return tiers;
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

/** The most tiers of at least PLAIN_MIN_TIER_EM that `span` holds at `sizePx` (at least 1). */
function maxTiers(span: number, sizePx: number): number {
  const gap = sizePx * PLAIN_TIER_GAP;
  return Math.max(1, Math.floor((span + gap) / (sizePx * PLAIN_MIN_TIER_EM + gap) + EPSILON));
}

/**
 * Sets the whole text at `sizePx` in `tiers` tiers of the room; null when it
 * does not all fit (unless `force`, the last resort's guard, which sets it
 * whole regardless, flowing, even over the room).
 */
function setBody(
  paragraphs: readonly (readonly string[])[],
  vertical: boolean,
  room: PlainRoom,
  measure: GlyphMeasure,
  sizePx: number,
  leading: number,
  tiers: number,
  force = false,
): { runs: PlainRun[]; bounds: Box } | null {
  const width = room.right - room.left;
  const height = Math.max(0, room.bottom - room.top);
  const pitch = sizePx * leading;
  const indent = sizePx * PLAIN_WRAP_INDENT;
  const gap = sizePx * PLAIN_TIER_GAP;
  // Vertical tiers are stacked down the room, horizontal ones side by side.
  const tierSpan = Math.max(0, ((vertical ? height : width) - (tiers - 1) * gap) / tiers);
  const minSpan = (tiers > 1 ? PLAIN_MIN_TIER_EM : 1) * sizePx;
  if (!force && tierSpan < minSpan - EPSILON) return null;
  // A vertical row is a column of square cells; a horizontal one advances glyph by glyph.
  const extentOf: (char: string) => number = vertical ? () => sizePx : (char) => measure(char, sizePx).advance;
  const wrapped = paragraphs.map((lines) =>
    lines.map((line) =>
      wrapPlainLine(line, tierSpan, indent, extentOf).map((row, i): Slot => ({ text: row, continued: i > 0 })),
    ),
  );
  const bodyExtent = extents(paragraphs.flat(), sizePx, measure);
  const lineHeight = bodyExtent.descent - bodyExtent.ascent;
  const across = vertical ? width - sizePx : height - lineHeight;
  if (!force && across < -EPSILON) return null;
  const capacity = Math.floor(Math.max(0, across) / pitch + EPSILON) + 1;
  let slotted = fillTiers(wrapped, capacity, true);
  if (slotted.length > tiers) slotted = fillTiers(wrapped, capacity, false);
  if (!force && slotted.length > tiers) return null;

  const runs: PlainRun[] = [];
  const boxes: Box[] = [];
  for (const [k, slots] of slotted.entries()) {
    const tierStart = (vertical ? room.top : room.left) + k * (tierSpan + gap);
    for (const [i, slot] of slots.entries()) {
      if (slot === null) continue;
      const lead = slot.continued ? indent : 0;
      if (vertical) {
        const centerX = room.right - sizePx / 2 - i * pitch;
        const top = tierStart + lead;
        const chars = [...slot.text];
        // A glyph wider than its tier (only in a degenerate room): it does not fit.
        if (!force && lead + chars.length * sizePx > tierSpan + EPSILON) return null;
        chars.forEach((char, j) => {
          if (char.trim() === '') return;
          const { x, y, rotateDeg } = verticalOrigin(char, measure(char, sizePx), sizePx, centerX, top + j * sizePx);
          runs.push({ text: char, x, y, rotateDeg });
        });
        boxes.push({ x: centerX - sizePx / 2, y: top, width: sizePx, height: chars.length * sizePx });
      } else {
        const x = tierStart + lead;
        const y = room.top - bodyExtent.ascent + i * pitch;
        const rowExtent = rowWidth(slot.text, sizePx, measure);
        if (!force && lead + rowExtent > tierSpan + EPSILON) return null;
        runs.push({ text: slot.text, x, y, rotateDeg: 0 });
        boxes.push({ x, y: y + bodyExtent.ascent, width: rowExtent, height: lineHeight });
      }
    }
  }
  return { runs, bounds: union(boxes) };
}

/**
 * The whole text set in `room`, as large as it will go (see the fitting rules
 * at the top of this file). Never drops a character and never needs a second
 * sheet: everything comes back in one set of runs.
 */
export function fitPlainBody(
  paragraphs: readonly (readonly string[])[],
  orientation: LineDirection['orientation'],
  room: PlainRoom,
  measure: GlyphMeasure,
  viewportWidth: number,
): PlainBodyFit {
  const vertical = orientation === 'vertical';
  const span = vertical ? Math.max(0, room.bottom - room.top) : room.right - room.left;
  const floor = PLAIN_SIZE_STEPS.length - 1;
  // 1. One tier, at each size step in turn.
  for (const [step, { ratio, leading }] of PLAIN_SIZE_STEPS.entries()) {
    const sizePx = viewportWidth * ratio;
    const set = setBody(paragraphs, vertical, room, measure, sizePx, leading, 1);
    if (set !== null) return { sizePx, leading, step, tiers: 1, ...set };
  }
  // 2. At the floor, in tiers.
  const { ratio: floorRatio, leading: floorLeading } = PLAIN_SIZE_STEPS[floor]!;
  const floorPx = viewportWidth * floorRatio;
  for (let tiers = 2; tiers <= maxTiers(span, floorPx); tiers += 1) {
    const set = setBody(paragraphs, vertical, room, measure, floorPx, floorLeading, tiers);
    if (set !== null) return { sizePx: floorPx, leading: floorLeading, step: floor, tiers, ...set };
  }
  // 3. The last resort: smaller than the floor, until the whole text fits.
  let sizePx = floorPx;
  for (let n = 0; n < PLAIN_SQUEEZE_LIMIT; n += 1) {
    sizePx *= PLAIN_SQUEEZE_FACTOR;
    for (let tiers = 1; tiers <= maxTiers(span, sizePx); tiers += 1) {
      const set = setBody(paragraphs, vertical, room, measure, sizePx, floorLeading, tiers);
      if (set !== null) return { sizePx, leading: floorLeading, step: PLAIN_SIZE_STEPS.length, tiers, ...set };
    }
  }
  const tiers = maxTiers(span, sizePx);
  const set = setBody(paragraphs, vertical, room, measure, sizePx, floorLeading, tiers, true)!;
  return { sizePx, leading: floorLeading, step: PLAIN_SIZE_STEPS.length, tiers, ...set };
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
  const room: PlainRoom = {
    left: area.left,
    right: area.right,
    top: rule.y + rule.height + BODY_GAP,
    bottom: area.bottom - METER_MAX_HEIGHT - METER_GAP,
  };
  const orientation = titleOrientation(paragraphs.flat().join(''));
  const font = faces.primary;
  const body = fitPlainBody(paragraphs, orientation, room, measureFor(font, 'regular'), viewport.width);

  return {
    title: { text: titleText, direction, layout },
    artist: { text: artistText, glyphs: artistGlyphs, sizePx: xsPx },
    rule,
    body: { orientation, font, ...body },
    meter,
    note: { x: area.left, y: area.captionBaseline, sizePx: xsPx },
  };
}

/** The body's opacity `elapsedMs` after its start: 0 before it, then one fade in over PLAIN_BODY_FADE_MS, then 1 for good. */
export function plainBodyOpacity(elapsedMs: number): number {
  'worklet';
  if (!(elapsedMs > 0)) return 0;
  return Math.min(1, elapsedMs / PLAIN_BODY_FADE_MS);
}
