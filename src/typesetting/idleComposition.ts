import type { SongDirection } from '../direction/types';
import type { FontKey, FontWeight } from './fonts';
import { printArea, SIZE_RATIO } from './layout';
import type { GlyphMeasure, PlacedGlyph, Viewport } from './layout';

// Idle composition: shown while no lyric line is active. The idle screen is a
// wall clock (the owner's call after the device pass of the visual overhaul;
// it replaces the typographic poster of spec §3e). It follows the wall clock,
// not the beat, so it keeps time through silence too.
//
// - Time row: HH:MM (24-hour, zero-padded) in mincho-old, very large, then
//   :SS in gothic at SECONDS_RATIO of its size and SECONDS_ALPHA, on the same
//   baseline. The colons never blink; once a second only the digits change.
//   The size is fitted so the whole of HH:MM:SS takes TIME_WIDTH of the print
//   area's width, clamped to [CLOCK_MIN_PX, CLOCK_MAX_PX]. Its baseline sits
//   TIME_BASELINE of the way down the print area; the row is centred.
// - Digits sit in fixed cells as wide as the widest digit (tabular figures
//   laid out by hand), so a changing digit never moves its neighbours and the
//   row never shifts sideways as the time goes by.
// - Date row: M月D日（曜） in gothic, ink at DATE_ALPHA, centred, its baseline
//   DATE_GAP_RATIO of the time's size plus DATE_GAP_PX below the time's. Only
//   the weekday kanji is in the accent.
// - Indices are stable bands per row (date 0+, time 100+, seconds 200+), so
//   recomposing every second swaps characters, never glyph keys.
// - Faces: the time row is the 'primary' role, the seconds and the date the
//   'secondary'; the stage sets them in CLOCK_TIME_FACE / CLOCK_TEXT_FACE
//   whatever the song (the song's faces are for the nameplate).
// - `focus` is the centre of the HH:MM box: the lamp rests on the time.
//
// Reserved bands: the print area (layout.ts `printArea`, shared with the
// context lines of LyricStage). The caption's baseline sits a small gap above
// the controls, at the left margin; the caption line is reserved even when
// there is no track, so recognising a song does not move the clock.

export type IdleTrack = { title: string; artist: string } | null;

export interface IdleComposition {
  glyphs: PlacedGlyph[];
  caption: { text: string; x: number; y: number; sizePx: number } | null;
  /** The lamp's centre in px: the centre of the time row's HH:MM. */
  focus?: { x: number; y: number };
}

/** The caption's text for a recognized track: artist, an em dash, title. */
export function captionText(track: NonNullable<IdleTrack>): string {
  return `${track.artist} — ${track.title}`;
}

/** The clock's faces: the time row, and the seconds, the date and the caption. */
export const CLOCK_TIME_FACE: FontKey = 'mincho-old';
export const CLOCK_TEXT_FACE: FontKey = 'gothic';

/** HH:MM:SS takes this share of the print area's width. */
const TIME_WIDTH = 0.94;
/** Bounds on the time's size; the fit lands near 120 px on a 390 pt stage. */
export const CLOCK_MIN_PX = 48;
export const CLOCK_MAX_PX = 168;
/** The time's baseline, as a share of the print area's height from its top. */
const TIME_BASELINE = 0.38;
const SECONDS_RATIO = 0.32;
const SECONDS_ALPHA = 0.55;
/** The date: a little larger than SIZE_RATIO.s (0.06). */
const DATE_SIZE_RATIO = 0.066;
const DATE_ALPHA = 0.75;
const DATE_GAP_RATIO = 0.55;
const DATE_GAP_PX = 28;
/** Measured at this size and scaled: advances are linear in the size. */
const REFERENCE_PX = 100;

const DATE_INDEX = 0;
const TIME_INDEX = 100;
const SECONDS_INDEX = 200;

const DIGITS = [...'0123456789'];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The widest digit's advance at `sizePx`: the cell every digit is centred in. */
function digitCell(measure: GlyphMeasure, sizePx: number): number {
  return Math.max(...DIGITS.map((d) => measure(d, sizePx).advance));
}

/** Width of a run of digits and colons laid out in digit cells. */
function runWidth(text: string, measure: GlyphMeasure, sizePx: number): number {
  const cell = digitCell(measure, sizePx);
  return [...text].reduce((w, ch) => w + (ch === ':' ? measure(ch, sizePx).advance : cell), 0);
}

/** Places a run of digits and colons from `left` on `baseline`, each digit centred in its cell. */
function placeRun(
  text: string,
  left: number,
  baseline: number,
  sizePx: number,
  measure: GlyphMeasure,
  firstIndex: number,
  extra: Pick<PlacedGlyph, 'face'> & { alpha?: number },
): PlacedGlyph[] {
  const cell = digitCell(measure, sizePx);
  let x = left;
  return [...text].map((char, i) => {
    const { advance } = measure(char, sizePx);
    const width = char === ':' ? advance : cell;
    const glyph: PlacedGlyph = {
      char,
      index: firstIndex + i,
      x: x + (width - advance) / 2,
      y: baseline,
      rotateDeg: 0,
      sizePx,
      emphasized: false,
      accent: false,
      ...extra,
    };
    x += width;
    return glyph;
  });
}

/**
 * The idle clock at `now` (local time). `measure` is the text face (gothic:
 * the seconds, the date, the caption and the print area); `timeMeasure` the
 * time face (mincho-old).
 */
export function composeClock(
  now: Date,
  viewport: Viewport,
  track: IdleTrack,
  measure: GlyphMeasure,
  timeMeasure: GlyphMeasure,
): IdleComposition {
  const captionPx = viewport.width * SIZE_RATIO.xs;
  const area = printArea(viewport, measure('0', captionPx).ascent);
  const centreX = (area.left + area.right) / 2;

  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const ss = `:${pad2(now.getSeconds())}`;

  // Fit HH:MM:SS to the width from a reference measurement. The cells come
  // from the widest digit, so the size does not depend on the current time.
  const unit =
    (runWidth('00:00', timeMeasure, REFERENCE_PX) + SECONDS_RATIO * runWidth(':00', measure, REFERENCE_PX)) /
    REFERENCE_PX;
  const fit = (TIME_WIDTH * (area.right - area.left)) / unit;
  const timePx = Math.min(CLOCK_MAX_PX, Math.max(CLOCK_MIN_PX, fit));
  const secondsPx = timePx * SECONDS_RATIO;
  const timeWidth = runWidth('00:00', timeMeasure, timePx);
  const groupWidth = timeWidth + runWidth(':00', measure, secondsPx);
  const left = centreX - groupWidth / 2;

  // The time's top never rises above the print area's top.
  const timeMetrics = timeMeasure('0', timePx);
  const timeBaseline = Math.max(
    area.top + TIME_BASELINE * (area.bottom - area.top),
    area.top - timeMetrics.ascent,
  );

  const time = placeRun(hhmm, left, timeBaseline, timePx, timeMeasure, TIME_INDEX, { face: 'primary' });
  const seconds = placeRun(ss, left + timeWidth, timeBaseline, secondsPx, measure, SECONDS_INDEX, {
    face: 'secondary',
    alpha: SECONDS_ALPHA,
  });

  // The date row, centred by its own width (it changes once a day). Its foot
  // never drops below the print area's bottom.
  const datePx = viewport.width * DATE_SIZE_RATIO;
  const weekday = WEEKDAYS[now.getDay()]!;
  const dateText = `${now.getMonth() + 1}月${now.getDate()}日（${weekday}）`;
  const dateChars = [...dateText];
  const weekdayAt = dateChars.length - 2;
  const advances = dateChars.map((char) => measure(char, datePx).advance);
  const dateBaseline = Math.min(
    timeBaseline + DATE_GAP_RATIO * timePx + DATE_GAP_PX,
    area.bottom - measure('0', datePx).descent,
  );
  let dateX = centreX - advances.reduce((sum, a) => sum + a, 0) / 2;
  const date = dateChars.map((char, i): PlacedGlyph => {
    const glyph: PlacedGlyph = {
      char,
      index: DATE_INDEX + i,
      x: dateX,
      y: dateBaseline,
      rotateDeg: 0,
      sizePx: datePx,
      emphasized: false,
      face: 'secondary',
      accent: i === weekdayAt,
      alpha: DATE_ALPHA,
    };
    dateX += advances[i]!;
    return glyph;
  });

  return {
    glyphs: [...date, ...time, ...seconds],
    caption: track && {
      text: captionText(track),
      x: area.left,
      y: area.captionBaseline,
      sizePx: captionPx,
    },
    focus: {
      x: left + timeWidth / 2,
      y: timeBaseline + (timeMetrics.ascent + timeMetrics.descent) / 2,
    },
  };
}

/** The idle screen's two faces (visual overhaul spec §3e); now the nameplate's. */
export interface IdleFaces {
  /** The title's face. */
  primary: FontKey;
  /** The artist's face. */
  secondary: FontKey;
  /** Bold when the primary face is gothic (the only face with a bold file). */
  anchorWeight: FontWeight;
}

/** Before a song is recognised: an old mincho over gothic. */
export const UNRECOGNIZED_IDLE_FACES: IdleFaces = {
  primary: 'mincho-old',
  secondary: 'gothic',
  anchorWeight: 'regular',
};

/**
 * The faces for a song (spec §3e). The primary face is the face of the
 * most of the song's line directions; a tie goes to the face that appears on
 * the earlier line. The secondary is the song's other face (the next by the
 * same count, should a direction carry more than two), or gothic when the song
 * has one face only. With no song, or a song without line directions,
 * UNRECOGNIZED_IDLE_FACES.
 */
export function idleFaces(direction: SongDirection | null): IdleFaces {
  if (direction === null || direction.lines.length === 0) return UNRECOGNIZED_IDLE_FACES;
  // Map keeps insertion order, i.e. each face's first line; the stable sort
  // keeps that order between equal counts.
  const counts = new Map<FontKey, number>();
  for (const line of direction.lines) counts.set(line.font, (counts.get(line.font) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([font]) => font);
  const primary = ranked[0]!;
  return {
    primary,
    secondary: ranked[1] ?? 'gothic',
    anchorWeight: primary === 'gothic' ? 'bold' : 'regular',
  };
}
