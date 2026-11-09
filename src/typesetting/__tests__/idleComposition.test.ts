import type { LineDirection, SongDirection } from '../../direction/types';
import type { FontKey } from '../fonts';
import {
  CLOCK_MAX_PX,
  CLOCK_MIN_PX,
  composeClock,
  idleFaces,
  UNRECOGNIZED_IDLE_FACES,
} from '../idleComposition';
import { SIZE_RATIO } from '../layout';
import type { GlyphMeasure, PlacedGlyph } from '../layout';

const vp = { width: 390, height: 844, insetTop: 59, insetBottom: 34 };
// Proportional figures, so a changing digit would move its neighbours unless
// the clock lays the digits out in fixed cells. Ascent −0.88, descent 0.12.
const widthOf = (digit: number, one: number, colon: number) => (ch: string) =>
  ch === '1' ? one : /[0-9]/.test(ch) ? digit : ch === ':' ? colon : 1;
const textEm = widthOf(0.6, 0.4, 0.3);
const timeEm = widthOf(0.55, 0.35, 0.28);
const measure: GlyphMeasure = (ch, size) => ({ advance: size * textEm(ch), ascent: -size * 0.88, descent: size * 0.12 });
const timeMeasure: GlyphMeasure = (ch, size) => ({
  advance: size * timeEm(ch),
  ascent: -size * 0.88,
  descent: size * 0.12,
});
const track = { title: 'Night Drive', artist: 'Kei' };

// The print area, from MusicageApp's layout (independent of the module's constants):
// wordmark row 12 + 16 below the top inset, then a 24px margin; the controls
// (18 + 48 + 16 + 48) above the bottom inset, the caption baseline 12 above
// them, its xs ascent and a 24px margin above that; 24px side margins.
const XS = SIZE_RATIO.xs * 390;
const CAPTION_Y = 844 - 34 - (18 + 48 + 16 + 48) - 12; // 668
const AREA = { left: 24, right: 366, top: 59 + 12 + 16 + 24, bottom: CAPTION_Y - XS * 0.88 - 24 };
const CENTRE_X = 195;

// The clock's sizes for these measures: the widest digit is the cell.
// HH:MM = 4 cells + a colon in the time face; :SS = a colon + 2 cells in the text face at 0.32.
const TIME_EM = 4 * 0.55 + 0.28;
const SECONDS_EM = 0.32 * (0.3 + 2 * 0.6);
const TIME_PX = (0.94 * (AREA.right - AREA.left)) / (TIME_EM + SECONDS_EM);
const GROUP_WIDTH = TIME_PX * (TIME_EM + SECONDS_EM);
const GROUP_LEFT = CENTRE_X - GROUP_WIDTH / 2;
const TIME_BASELINE = AREA.top + 0.38 * (AREA.bottom - AREA.top);

// 2026-11-08 is a Sunday; 2026-12-31 a Thursday; 2027-01-01 a Friday. Local time.
const SUNDAY_MORNING = new Date(2026, 10, 8, 9, 5, 7);
const NEW_YEARS_EVE = new Date(2026, 11, 31, 23, 59, 59);
const NEW_YEAR = new Date(2027, 0, 1, 0, 0, 0);
const TIMES = [
  SUNDAY_MORNING,
  new Date(2026, 10, 8, 9, 5, 8),
  new Date(2026, 10, 8, 9, 6, 0),
  new Date(2026, 10, 8, 11, 11, 11),
  new Date(2026, 10, 8, 19, 48, 30),
  NEW_YEARS_EVE,
  NEW_YEAR,
];

const compose = (now: Date) => composeClock(now, vp, null, measure, timeMeasure);
const band = (glyphs: PlacedGlyph[], from: number) =>
  glyphs.filter((g) => g.index >= from && g.index < from + 100).sort((a, b) => a.index - b.index);
const rows = (now: Date) => {
  const { glyphs } = compose(now);
  return { date: band(glyphs, 0), time: band(glyphs, 100), seconds: band(glyphs, 200), all: glyphs };
};
const text = (glyphs: PlacedGlyph[]) => glyphs.map((g) => g.char).join('');
const measureOf = (g: PlacedGlyph) => (g.face === 'primary' ? timeMeasure : measure)(g.char, g.sizePx);
const boxOf = (g: PlacedGlyph) => {
  const { advance, ascent, descent } = measureOf(g);
  return { left: g.x, top: g.y + ascent, right: g.x + advance, bottom: g.y + descent };
};

test('is deterministic for the same time', () => {
  expect(compose(SUNDAY_MORNING)).toEqual(compose(new Date(SUNDAY_MORNING.getTime())));
});

test('prints HH:MM, :SS and M月D日（曜）, 24-hour and zero-padded', () => {
  expect(text(rows(SUNDAY_MORNING).time)).toBe('09:05');
  expect(text(rows(SUNDAY_MORNING).seconds)).toBe(':07');
  expect(text(rows(SUNDAY_MORNING).date)).toBe('11月8日（日）');
  expect(text(rows(NEW_YEARS_EVE).time)).toBe('23:59');
  expect(text(rows(NEW_YEARS_EVE).seconds)).toBe(':59');
  expect(text(rows(NEW_YEARS_EVE).date)).toBe('12月31日（木）');
  expect(text(rows(NEW_YEAR).time)).toBe('00:00');
  expect(text(rows(NEW_YEAR).seconds)).toBe(':00');
  expect(text(rows(NEW_YEAR).date)).toBe('1月1日（金）');
});

test('indices are fixed bands per row: date 0+, time 100-104, seconds 200-202', () => {
  for (const now of TIMES) {
    const { date, time, seconds, all } = rows(now);
    expect(date.map((g) => g.index)).toEqual(date.map((_, i) => i));
    expect(time.map((g) => g.index)).toEqual([100, 101, 102, 103, 104]);
    expect(seconds.map((g) => g.index)).toEqual([200, 201, 202]);
    expect(all).toHaveLength(date.length + 8);
  }
});

test('a new second or minute only swaps characters: keys, cells, sizes and baselines stay', () => {
  const cellsOf = (now: Date) =>
    [...rows(now).time, ...rows(now).seconds].map((g) => ({
      index: g.index,
      centre: g.x + measureOf(g).advance / 2,
      y: g.y,
      sizePx: g.sizePx,
    }));
  const first = cellsOf(SUNDAY_MORNING);
  for (const now of TIMES.slice(1)) {
    const next = cellsOf(now);
    expect(next.map((c) => c.index)).toEqual(first.map((c) => c.index));
    next.forEach((c, i) => {
      expect(c.centre).toBeCloseTo(first[i]!.centre, 6);
      expect(c.y).toBe(first[i]!.y);
      expect(c.sizePx).toBe(first[i]!.sizePx);
    });
    expect(compose(now).focus).toEqual(compose(SUNDAY_MORNING).focus);
  }
  // The date row too, inside one day.
  const date = (now: Date) => rows(now).date.map(({ index, x, y, sizePx }) => ({ index, x, y, sizePx }));
  expect(date(new Date(2026, 10, 8, 9, 6, 0))).toEqual(date(SUNDAY_MORNING));
});

test('HH:MM:SS takes 94% of the print area width, centred; the seconds are 0.32 of the time', () => {
  for (const now of TIMES) {
    const { time, seconds } = rows(now);
    for (const g of time) expect(g.sizePx).toBeCloseTo(TIME_PX, 6);
    for (const g of seconds) expect(g.sizePx).toBeCloseTo(TIME_PX * 0.32, 6);
    // The row's ends are cell edges: the first time cell and the last seconds cell.
    const firstCell = time[0]!.x + measureOf(time[0]!).advance / 2 - (0.55 * TIME_PX) / 2;
    const last = seconds[2]!;
    const lastCell = last.x + measureOf(last).advance / 2 + (0.6 * last.sizePx) / 2;
    expect(firstCell).toBeCloseTo(GROUP_LEFT, 6);
    expect(lastCell - firstCell).toBeCloseTo(GROUP_WIDTH, 6);
    expect((firstCell + lastCell) / 2).toBeCloseTo(CENTRE_X, 6);
  }
  expect(TIME_PX).toBeGreaterThanOrEqual(CLOCK_MIN_PX);
  expect(TIME_PX).toBeLessThanOrEqual(CLOCK_MAX_PX);
});

test('the time size is clamped to [CLOCK_MIN_PX, CLOCK_MAX_PX]', () => {
  const scaled =
    (k: number): GlyphMeasure =>
    (_ch, size) => ({ advance: size * k, ascent: -size * 0.88, descent: size * 0.12 });
  const narrow = composeClock(SUNDAY_MORNING, vp, null, scaled(0.05), scaled(0.05)).glyphs;
  expect(band(narrow, 100)[0]!.sizePx).toBe(CLOCK_MAX_PX);
  const wide = composeClock(SUNDAY_MORNING, vp, null, scaled(5), scaled(5)).glyphs;
  expect(band(wide, 100)[0]!.sizePx).toBe(CLOCK_MIN_PX);
});

test('baselines: the time 38% down the print area, the seconds on it, the date 0.55 × size + 28 below', () => {
  const { time, seconds, date } = rows(SUNDAY_MORNING);
  for (const g of [...time, ...seconds]) expect(g.y).toBeCloseTo(TIME_BASELINE, 6);
  for (const g of date) expect(g.y).toBeCloseTo(TIME_BASELINE + 0.55 * TIME_PX + 28, 6);
});

test('the date row is centred, a little larger than s', () => {
  for (const now of TIMES) {
    const { date } = rows(now);
    const boxes = date.map(boxOf);
    expect((boxes[0]!.left + boxes.at(-1)!.right) / 2).toBeCloseTo(CENTRE_X, 6);
    for (const g of date) {
      expect(g.sizePx).toBeGreaterThanOrEqual(390 * SIZE_RATIO.s);
      expect(g.sizePx).toBeLessThan(390 * SIZE_RATIO.m);
    }
  }
});

test('every glyph box stays inside the print area, upright', () => {
  for (const now of TIMES) {
    for (const g of compose(now).glyphs) {
      const box = boxOf(g);
      expect(box.top).toBeGreaterThanOrEqual(AREA.top - 1e-6);
      expect(box.bottom).toBeLessThanOrEqual(AREA.bottom + 1e-6);
      expect(box.left).toBeGreaterThanOrEqual(AREA.left - 1e-6);
      expect(box.right).toBeLessThanOrEqual(AREA.right + 1e-6);
      expect(g.rotateDeg).toBe(0);
      expect(g.emphasized).toBe(false);
    }
  }
});

test('focus is the centre of the HH:MM box', () => {
  const timeWidth = TIME_EM * TIME_PX;
  expect(compose(SUNDAY_MORNING).focus!.x).toBeCloseTo(GROUP_LEFT + timeWidth / 2, 6);
  expect(compose(SUNDAY_MORNING).focus!.y).toBeCloseTo(TIME_BASELINE + ((-0.88 + 0.12) / 2) * TIME_PX, 6);
});

test('faces, accent and alpha: the time primary; seconds (0.55) and date (0.75) secondary; only the weekday accent', () => {
  for (const now of TIMES) {
    // One composition for both sides, so the accent is compared by identity.
    const { time, seconds, date, all } = rows(now);
    for (const g of time) expect(g).toMatchObject({ face: 'primary', accent: false });
    for (const g of time) expect(g.alpha).toBeUndefined();
    for (const g of seconds) expect(g).toMatchObject({ face: 'secondary', accent: false, alpha: 0.55 });
    for (const g of date) expect(g).toMatchObject({ face: 'secondary', alpha: 0.75 });
    const accents = all.filter((g) => g.accent === true);
    expect(accents).toHaveLength(1);
    expect(accents[0]).toBe(date.at(-2));
    expect('日月火水木金土').toContain(accents[0]!.char);
  }
});

test('caption is "artist — title" at the left margin just above the controls, size xs; null without a track', () => {
  const withTrack = composeClock(SUNDAY_MORNING, vp, track, measure, timeMeasure);
  expect(withTrack.caption).toEqual({ text: 'Kei — Night Drive', x: 24, y: CAPTION_Y, sizePx: XS });
  // The caption's box clears the controls, and the clock does not move when a track appears.
  expect(CAPTION_Y + XS * 0.12).toBeLessThanOrEqual(844 - 34 - 130);
  expect(withTrack.glyphs).toEqual(compose(SUNDAY_MORNING).glyphs);
  expect(withTrack.focus).toEqual(compose(SUNDAY_MORNING).focus);
  expect(compose(SUNDAY_MORNING).caption).toBeNull();
});

describe('idleFaces (visual overhaul spec §3e; now the nameplate faces)', () => {
  const line = (font: FontKey): LineDirection => ({
    font,
    weight: 'regular',
    size: 'm',
    orientation: 'horizontal',
    entrance: 'fade',
    hold: 'still',
    emphasis: [],
    accent: false,
    ornament: 'none',
  });
  const song = (fonts: FontKey[]) =>
    ({ lines: fonts.map(line) }) as unknown as SongDirection;

  test('before a song is recognised: mincho-old over gothic, anchors regular', () => {
    expect(idleFaces(null)).toEqual({ primary: 'mincho-old', secondary: 'gothic', anchorWeight: 'regular' });
    expect(UNRECOGNIZED_IDLE_FACES).toEqual(idleFaces(null));
  });

  test("a recognised song: its most used face over its other face", () => {
    expect(idleFaces(song(['gothic', 'brush', 'brush', 'gothic', 'brush']))).toEqual({
      primary: 'brush',
      secondary: 'gothic',
      anchorWeight: 'regular',
    });
  });

  test('a tie goes to the face of the earlier line', () => {
    expect(idleFaces(song(['mincho', 'gothic-round', 'gothic-round', 'mincho']))).toMatchObject({
      primary: 'mincho',
      secondary: 'gothic-round',
    });
    expect(idleFaces(song(['gothic-round', 'mincho', 'mincho', 'gothic-round']))).toMatchObject({
      primary: 'gothic-round',
      secondary: 'mincho',
    });
  });

  test('one face only: gothic is the secondary', () => {
    expect(idleFaces(song(['mincho', 'mincho']))).toMatchObject({ primary: 'mincho', secondary: 'gothic' });
  });

  test('a gothic primary sets the anchors bold', () => {
    expect(idleFaces(song(['gothic', 'gothic', 'mincho']))).toEqual({
      primary: 'gothic',
      secondary: 'mincho',
      anchorWeight: 'bold',
    });
    expect(idleFaces(song(['gothic']))).toEqual({ primary: 'gothic', secondary: 'gothic', anchorWeight: 'bold' });
  });

  test('a song without line directions falls back to the unrecognised faces', () => {
    expect(idleFaces(song([]))).toEqual(UNRECOGNIZED_IDLE_FACES);
  });

  test('never more than two faces', () => {
    const faces = idleFaces(song(['brush', 'mincho', 'gothic-heavy', 'brush']));
    expect(new Set([faces.primary, faces.secondary]).size).toBeLessThanOrEqual(2);
    expect(faces).toMatchObject({ primary: 'brush', secondary: 'mincho' });
  });
});
