import { METER_MAX_HEIGHT } from '../bandMeter';
import { UNRECOGNIZED_IDLE_FACES } from '../idleComposition';
import { printArea, SIZE_RATIO } from '../layout';
import type { GlyphMeasure } from '../layout';
import { NAMEPLATE_ELLIPSIS } from '../nameplate';
import {
  composePlainSheet,
  fillTiers,
  fitPlainBody,
  PLAIN_BODY_FADE_MS,
  PLAIN_MIN_TIER_EM,
  PLAIN_SIZE_STEPS,
  PLAIN_TIER_GAP,
  plainBodyOpacity,
  plainParagraphs,
  plainTitleDirection,
  wrapPlainLine,
} from '../plainSheet';
import type { PlainBodyFit, PlainRoom, PlainSheet } from '../plainSheet';

// The jest Font: every glyph sizePx wide, ascent −0.88, descent 0.12.
// Every text here is fictional, written (or generated) for these tests.
const VIEWPORT = { width: 390, height: 844, insetTop: 47, insetBottom: 34 };
const measure: GlyphMeasure = (_char, sizePx) => ({ advance: sizePx, ascent: -sizePx * 0.88, descent: sizePx * 0.12 });
const measureFor = () => measure;
const XS = 390 * SIZE_RATIO.xs;
const S = 390 * SIZE_RATIO.s;
const AREA = printArea(VIEWPORT, -XS * 0.88);
const faces = UNRECOGNIZED_IDLE_FACES;
const song = { title: '架空の歌', artist: '架空の人' };
const PITCH = S * PLAIN_SIZE_STEPS[0]!.leading;
const FLOOR = PLAIN_SIZE_STEPS.length - 1;
const FLOOR_PX = 390 * PLAIN_SIZE_STEPS[FLOOR]!.ratio;
const SQUEEZED = PLAIN_SIZE_STEPS.length;
const EPS = 1e-6;

const compose = (text: string, track = song, viewport = VIEWPORT, area = AREA): PlainSheet => {
  const sheet = composePlainSheet(track, text, faces, viewport, area, measureFor);
  if (sheet === null) throw new Error('expected a lyric sheet');
  return sheet;
};

/** The top of the body's room: under the heading's rule and BODY_GAP. */
const bodyTopOf = (sheet: PlainSheet) => sheet.rule.y + sheet.rule.height + 20;
/** The foot of the body's room: above the meter's room. */
const BODY_FOOT = AREA.bottom - METER_MAX_HEIGHT - 20;

// A room for fitPlainBody of its own: 342 wide, 392 tall (about the stage's).
const ROOM: PlainRoom = { left: AREA.left, right: AREA.right, top: 180, bottom: 572 };
const fit = (text: string, room = ROOM) => {
  const paragraphs = plainParagraphs(text);
  return fitPlainBody(paragraphs, /[぀-ヿ一-鿿]/.test(text) ? 'vertical' : 'horizontal', room, measure, 390);
};
/** Every printed character of the body, in drawing order (spaces dropped). */
const printedOf = (body: PlainBodyFit) => body.runs.map((r) => r.text).join('').replace(/ /g, '');
const textOf = (text: string) => text.replace(/\s/g, '');
/** The body's own box lies inside the room. */
const expectWithin = (body: PlainBodyFit, room: PlainRoom) => {
  const b = body.bounds;
  expect(b.x).toBeGreaterThanOrEqual(room.left - EPS);
  expect(b.x + b.width).toBeLessThanOrEqual(room.right + EPS);
  expect(b.y).toBeGreaterThanOrEqual(room.top - EPS);
  expect(b.y + b.height).toBeLessThanOrEqual(room.bottom + EPS);
};

describe('plainParagraphs', () => {
  test('splits at line breaks, trims, collapses blanks; any run of blank lines is one paragraph break', () => {
    expect(plainParagraphs('\n\n  灯の  ない部屋 \r\n針を下ろす\n\n\n \n　\n回る\r黒い円\n\n')).toEqual([
      ['灯の ない部屋', '針を下ろす'],
      ['回る', '黒い円'],
    ]);
  });

  test('nothing printable is no paragraph at all', () => {
    expect(plainParagraphs('')).toEqual([]);
    expect(plainParagraphs(' \n\n\t\n　')).toEqual([]);
  });

  test('a single line is one paragraph of one line', () => {
    expect(plainParagraphs('ひとつだけ')).toEqual([['ひとつだけ']]);
  });
});

describe('wrapPlainLine (unit extents: limit 5, indent 1)', () => {
  const unit = () => 1;
  const wrap = (line: string) => wrapPlainLine(line, 5, 1, unit);

  test('a line that fits is one row', () => {
    expect(wrap('あいう')).toEqual(['あいう']);
  });

  test('further rows are one shorter (they are indented)', () => {
    expect(wrap('あいうえおかきくけこさし')).toEqual(['あいうえお', 'かきくけ', 'こさし']);
  });

  test('a Latin word is not broken; spaces never start or end a row', () => {
    expect(wrap('ab cd efg')).toEqual(['ab cd', 'efg']);
    expect(wrap('あいうえお かき')).toEqual(['あいうえお', 'かき']);
  });

  test('a word longer than a row is broken by characters', () => {
    expect(wrap('abcdefghij')).toEqual(['abcde', 'fghi', 'j']);
  });

  test('closing punctuation never starts a row: the last character comes down with it', () => {
    expect(wrap('あいうえお。')).toEqual(['あいうえ', 'お。']);
    expect(wrap('あいうえお」かき')).toEqual(['あいうえ', 'お」かき']);
  });

  test('a row of one token keeps it (the punctuation then starts the next row)', () => {
    expect(wrap('abcde。')).toEqual(['abcde', '。']);
  });
});

describe('fillTiers', () => {
  let n = 0;
  const row = () => ({ text: `r${(n += 1)}`, continued: false });
  /** A paragraph of `lines` one-row lines. */
  const para = (lines: number) => Array.from({ length: lines }, () => [row()]);
  const texts = (tiers: ReturnType<typeof fillTiers>) => tiers.map((t) => t.map((s) => s?.text ?? null));
  const flat = (tiers: ReturnType<typeof fillTiers>) =>
    tiers
      .flat()
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => s.text);
  beforeEach(() => {
    n = 0;
  });

  describe('keeping paragraphs', () => {
    test('paragraphs that fit share a tier with one empty slot between them', () => {
      const tiers = fillTiers([para(3), para(3)], 10, true);
      expect(texts(tiers)).toEqual([['r1', 'r2', 'r3', null, 'r4', 'r5', 'r6']]);
    });

    test('a paragraph that does not fit on the rest of a tier starts the next one', () => {
      const tiers = fillTiers([para(8), para(4)], 10, true);
      expect(tiers.map((t) => t.length)).toEqual([8, 4]);
    });

    test('a paragraph longer than a tier breaks between its lines; a line longer than a tier between its rows', () => {
      expect(fillTiers([para(25)], 10, true).map((t) => t.length)).toEqual([10, 10, 5]);
      const longLine = [Array.from({ length: 12 }, (_, i) => ({ text: `w${i}`, continued: i > 0 }))];
      expect(fillTiers([longLine], 10, true).map((t) => t.length)).toEqual([10, 2]);
    });

    test('a wrapped line is kept in one tier when it fits in a fresh one', () => {
      const twoRows = [{ text: 'a', continued: false }, { text: 'b', continued: true }];
      expect(texts(fillTiers([[...para(9), twoRows]], 10, true))).toEqual([
        ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'],
        ['a', 'b'],
      ]);
    });
  });

  describe('flowing', () => {
    test('fills each tier in turn, splitting paragraphs, where keeping them would take one more tier', () => {
      const paragraphs = [para(6), para(6), para(6)];
      expect(fillTiers(paragraphs, 10, true)).toHaveLength(3);
      n = 0;
      expect(texts(fillTiers([para(6), para(6), para(6)], 10, false))).toEqual([
        ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', null, 'r7', 'r8', 'r9'],
        ['r10', 'r11', 'r12', null, 'r13', 'r14', 'r15', 'r16', 'r17', 'r18'],
      ]);
    });

    test('the empty slot between paragraphs never ends a tier', () => {
      expect(texts(fillTiers([para(9), para(2)], 10, false))).toEqual([
        ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'],
        ['r10', 'r11'],
      ]);
    });
  });

  test.each([true, false])(
    'every row appears exactly once, in order, whatever the capacity (even a degenerate one); keep %s',
    (keep) => {
      const paragraphs = [para(2), para(7), para(1), para(13), para(4)];
      const all = paragraphs.flat(2).map((s) => s.text);
      for (const cap of [0, 1, 2, 3, 5, 10, 40]) {
        const tiers = fillTiers(paragraphs, cap, keep);
        expect(flat(tiers)).toEqual(all);
        for (const tier of tiers) {
          expect(tier.length).toBeLessThanOrEqual(Math.max(1, cap));
          expect(tier[0]).not.toBeNull();
          expect(tier[tier.length - 1]).not.toBeNull();
        }
      }
    },
  );
});

describe('fitPlainBody: the whole text on one sheet, as large as it will go', () => {
  test('a short text is set at s in one tier', () => {
    const body = fit('灯のない部屋\n針を下ろす');
    expect(body).toMatchObject({ step: 0, tiers: 1, sizePx: S, leading: PLAIN_SIZE_STEPS[0]!.leading });
    expect(printedOf(body)).toBe('灯のない部屋針を下ろす');
  });

  test('a text too long for s steps down to the first size that holds it all', () => {
    // Twelve columns: s holds 9 across the room, the next step 10, the one after 12.
    const text = Array.from({ length: 12 }, () => 'あいうえおかき').join('\n');
    const body = fit(text);
    expect(body.step).toBe(2);
    expect(body.tiers).toBe(1);
    expect(body.sizePx).toBeCloseTo(390 * PLAIN_SIZE_STEPS[2]!.ratio, 9);
    expect(body.leading).toBe(PLAIN_SIZE_STEPS[2]!.leading);
    expect(printedOf(body)).toBe(textOf(text));
    expectWithin(body, ROOM);
  });

  test('the size steps go down and their leading tightens; the first is s', () => {
    expect(PLAIN_SIZE_STEPS[0]!.ratio).toBe(SIZE_RATIO.s);
    for (let i = 1; i < PLAIN_SIZE_STEPS.length; i += 1) {
      expect(PLAIN_SIZE_STEPS[i]!.ratio).toBeLessThan(PLAIN_SIZE_STEPS[i - 1]!.ratio);
      expect(PLAIN_SIZE_STEPS[i]!.leading).toBeLessThanOrEqual(PLAIN_SIZE_STEPS[i - 1]!.leading);
    }
  });

  test('vertical, past the floor: tiers stacked down the room, each read right to left, paragraphs kept whole', () => {
    // 26 columns (three paragraphs of eight, two empty columns): the floor holds 19 across.
    const text = Array.from({ length: 3 }, (_, p) => Array.from({ length: 8 }, () => `あいう${p}え`).join('\n')).join(
      '\n\n',
    );
    const body = fit(text);
    expect(body).toMatchObject({ step: FLOOR, tiers: 2 });
    expect(body.sizePx).toBeCloseTo(FLOOR_PX, 9);
    expect(printedOf(body)).toBe(textOf(text));
    expectWithin(body, ROOM);
    const gap = FLOOR_PX * PLAIN_TIER_GAP;
    const tierSpan = (ROOM.bottom - ROOM.top - gap) / 2;
    // The third paragraph starts the lower tier, in its rightmost column.
    const thirdStart = body.runs.findIndex((r) => r.text === '2');
    const third = body.runs[thirdStart - 3]!;
    expect(third.text).toBe('あ');
    expect(third.x + FLOOR_PX / 2).toBeCloseTo(ROOM.right - FLOOR_PX / 2, 6);
    expect(third.y).toBeGreaterThan(ROOM.top + tierSpan + gap);
    // The first two share the upper tier.
    const second = body.runs[body.runs.findIndex((r) => r.text === '1') - 3]!;
    expect(second.y).toBeLessThan(ROOM.top + tierSpan);
    expect(second.x).toBeLessThan(body.runs[0]!.x);
  });

  test('horizontal, past the floor: tiers side by side, rows down each', () => {
    // 30 rows: the floor holds 21 down the room.
    const text = Array.from({ length: 30 }, () => 'abc def').join('\n');
    const body = fit(text);
    expect(body).toMatchObject({ step: FLOOR, tiers: 2 });
    expect(body.runs).toHaveLength(30);
    const gap = FLOOR_PX * PLAIN_TIER_GAP;
    const tierSpan = (ROOM.right - ROOM.left - gap) / 2;
    expect(tierSpan).toBeGreaterThanOrEqual(PLAIN_MIN_TIER_EM * FLOOR_PX);
    const lefts = [...new Set(body.runs.map((r) => r.x))];
    expect(lefts).toHaveLength(2);
    expect(lefts[0]).toBeCloseTo(ROOM.left, 6);
    expect(lefts[1]).toBeCloseTo(ROOM.left + tierSpan + gap, 6);
    // The second tier starts again at the top.
    const firstOfSecond = body.runs.find((r) => r.x === lefts[1])!;
    expect(firstOfSecond.y).toBeCloseTo(body.runs[0]!.y, 6);
    expectWithin(body, ROOM);
  });

  test('when keeping paragraphs whole would take another tier, the text flows across tiers instead', () => {
    // Three paragraphs of twelve columns: kept whole they need three tiers of 19, flowing they fill two.
    const text = Array.from({ length: 3 }, () => Array.from({ length: 12 }, () => 'あいう').join('\n')).join('\n\n');
    const body = fit(text);
    expect(body).toMatchObject({ step: FLOOR, tiers: 2 });
    expect(printedOf(body)).toBe(textOf(text));
    expectWithin(body, ROOM);
  });

  test.each([
    ['many lines', Array.from({ length: 100 }, () => 'あいうえおかきくけこ').join('\n')],
    ['one extremely long line', 'あいうえお'.repeat(400)],
    ['a long Latin text', Array.from({ length: 120 }, (_, i) => `line ${i} of the fictional verse`).join('\n')],
  ])('the last resort, %s: smaller than the floor until all of it fits, nothing dropped', (_, text) => {
    const body = fit(text);
    expect(body.step).toBe(SQUEEZED);
    expect(body.sizePx).toBeLessThan(FLOOR_PX);
    expect(body.sizePx).toBeGreaterThan(1);
    expect(printedOf(body)).toBe(textOf(text));
    expectWithin(body, ROOM);
  });

  test('a degenerate room (no height) still sets every character, in order', () => {
    const flatRoom = { ...ROOM, bottom: ROOM.top };
    for (const text of ['あいう\n\nえお', 'abc\ndef']) {
      expect(printedOf(fit(text, flatRoom))).toBe(textOf(text));
    }
  });

  test('a text of blank lines around a few characters is set at s, a blank column between its paragraphs', () => {
    const body = fit('\n\n\n\n　\n\nあ\n\n\n\n\n\nい\n\n');
    expect(body).toMatchObject({ step: 0, tiers: 1 });
    expect(body.runs.map((r) => r.text)).toEqual(['あ', 'い']);
    expect(body.runs[0]!.x - body.runs[1]!.x).toBeCloseTo(2 * PITCH, 6);
  });

  test('one Latin word longer than a row breaks into rows, still at s', () => {
    const body = fit('x'.repeat(40));
    expect(body.step).toBe(0);
    expect(printedOf(body)).toBe('x'.repeat(40));
    expectWithin(body, ROOM);
  });
});

describe('composePlainSheet', () => {
  test('a blank title or a text with nothing printable makes no sheet (the stage keeps the nameplate)', () => {
    expect(composePlainSheet({ title: '  ', artist: 'x' }, 'あ', faces, VIEWPORT, AREA, measureFor)).toBeNull();
    expect(composePlainSheet(song, ' \n\n ', faces, VIEWPORT, AREA, measureFor)).toBeNull();
  });

  test('the heading: the title small (s, one row, still), the artist under it in xs, then the accent rule', () => {
    const sheet = compose('灯のない部屋');
    expect(sheet.title.direction).toEqual(plainTitleDirection(faces));
    expect(sheet.title.direction).toMatchObject({ size: 's', orientation: 'horizontal', hold: 'still', accent: false, ornament: 'none' });
    expect(sheet.title.text).toBe('架空の歌');
    for (const g of sheet.title.layout.glyphs) {
      expect(g.sizePx).toBe(S);
      expect(g.y).toBeCloseTo(AREA.top + S * 0.88, 6);
      expect(g.emphasized).toBe(false);
    }
    expect(sheet.title.layout.bounds.y).toBeCloseTo(AREA.top, 6);
    expect(sheet.artist.text).toBe('架空の人');
    expect(sheet.artist.sizePx).toBe(XS);
    const artistTop = sheet.artist.glyphs[0]!.y - XS * 0.88;
    expect(artistTop).toBeGreaterThan(sheet.title.layout.bounds.y + sheet.title.layout.bounds.height);
    expect(sheet.rule).toMatchObject({ x: AREA.left, width: 12, height: 2 });
    expect(sheet.rule.y).toBeGreaterThan(sheet.artist.glyphs[0]!.y + XS * 0.12);
  });

  test('a long title and artist are cut with the ellipsis to one row each', () => {
    const sheet = compose('あ', { title: 'う'.repeat(40), artist: 'え'.repeat(40) });
    expect(sheet.title.text.endsWith(NAMEPLATE_ELLIPSIS)).toBe(true);
    expect(sheet.artist.text.endsWith(NAMEPLATE_ELLIPSIS)).toBe(true);
    const b = sheet.title.layout.bounds;
    expect(b.x + b.width).toBeLessThanOrEqual(AREA.right + EPS);
    const lastArtist = sheet.artist.glyphs[sheet.artist.glyphs.length - 1]!;
    expect(lastArtist.x + XS).toBeLessThanOrEqual(AREA.right + EPS);
  });

  test('the meter stands on the foot of the print area; the note alone on the caption row (no folio)', () => {
    const sheet = compose('あ');
    expect(sheet.meter).toEqual({ x: AREA.left, width: AREA.right - AREA.left, baseline: AREA.bottom, maxHeight: METER_MAX_HEIGHT });
    expect(sheet.note).toEqual({ x: AREA.left, y: AREA.captionBaseline, sizePx: XS });
    expect(sheet).not.toHaveProperty('folios');
    expect(sheet.body).not.toHaveProperty('pages');
  });

  test('a Latin text lies horizontal: one row run per line, s, the first step’s leading apart, from the left edge', () => {
    const sheet = compose('Lamp low\nNeedle down');
    expect(sheet.body.orientation).toBe('horizontal');
    expect(sheet.body).toMatchObject({ sizePx: S, step: 0, tiers: 1, font: faces.primary });
    const runs = sheet.body.runs;
    expect(runs.map((r) => r.text)).toEqual(['Lamp low', 'Needle down']);
    for (const r of runs) {
      expect(r.x).toBe(AREA.left);
      expect(r.rotateDeg).toBe(0);
    }
    expect(runs[1]!.y - runs[0]!.y).toBeCloseTo(PITCH, 6);
    expect(runs[0]!.y - S * 0.88).toBeCloseTo(bodyTopOf(sheet), 6);
  });

  test('a wrapped horizontal line indents its further rows by one em and keeps its words whole', () => {
    const sheet = compose('aaaa bbbb cccc dddd eeee');
    const runs = sheet.body.runs;
    // 14 glyphs of S fit in a row of 342px, 13 in an indented one.
    expect(runs.map((r) => r.text)).toEqual(['aaaa bbbb cccc', 'dddd eeee']);
    expect(runs[0]!.x).toBe(AREA.left);
    expect(runs[1]!.x).toBeCloseTo(AREA.left + S, 6);
  });

  test('kana or kanji set the body vertical: a glyph per run, columns from the right, a blank column between paragraphs', () => {
    const sheet = compose('\n\n\nあい\n\n\n\n\nうA\n\n');
    expect(sheet.body.orientation).toBe('vertical');
    const runs = sheet.body.runs;
    expect(runs.map((r) => r.text)).toEqual(['あ', 'い', 'う', 'A']);
    const firstCenter = AREA.right - S / 2;
    expect(runs[0]!.x + S / 2).toBeCloseTo(firstCenter, 6);
    // The second paragraph is two pitches to the left (one empty column between).
    expect(runs[2]!.x + S / 2).toBeCloseTo(firstCenter - 2 * PITCH, 6);
    // Down the column one cell at a time; the Latin letter turned as layoutLine turns it.
    expect(runs[1]!.y - runs[0]!.y).toBeCloseTo(S, 6);
    expect(runs[3]!.rotateDeg).toBe(90);
    expect(runs[0]!.rotateDeg).toBe(0);
  });

  test('a single line is set whole at s', () => {
    const sheet = compose('ひとつだけの行');
    expect(sheet.body).toMatchObject({ step: 0, tiers: 1, sizePx: S });
    expect(sheet.body.runs).toHaveLength(7);
  });

  test.each([
    ['vertical', 'あいうえおかきくけこ'],
    ['horizontal', 'abc defg hijk lmno pqrs'],
  ])('a long %s text is set whole on the one sheet, smaller, within the body room and the side margins', (_, line) => {
    const text = Array.from({ length: 12 }, () => Array.from({ length: 4 }, () => line).join('\n')).join('\n\n');
    const sheet = compose(text);
    expect(sheet.body.step).toBeGreaterThan(0);
    expect(sheet.body.sizePx).toBeLessThan(S);
    const b = sheet.body.bounds;
    expect(b.x).toBeGreaterThanOrEqual(AREA.left - EPS);
    expect(b.x + b.width).toBeLessThanOrEqual(AREA.right + EPS);
    expect(b.y).toBeGreaterThanOrEqual(bodyTopOf(sheet) - EPS);
    expect(b.y + b.height).toBeLessThanOrEqual(BODY_FOOT + EPS);
    // Every character of the text printed once, in order.
    expect(printedOf(sheet.body)).toBe(textOf(text));
  });

  test('the same text always sets the same sheet', () => {
    const text = 'あいう\nえお\n\nかき';
    expect(compose(text)).toEqual(compose(text));
  });
});

describe('the body’s opacity: one fade in, then it stays', () => {
  test('0 until the body starts, a fade over PLAIN_BODY_FADE_MS, then 1 for good', () => {
    expect(plainBodyOpacity(-1_500)).toBe(0);
    expect(plainBodyOpacity(0)).toBe(0);
    expect(plainBodyOpacity(Number.NaN)).toBe(0);
    expect(plainBodyOpacity(PLAIN_BODY_FADE_MS / 2)).toBeCloseTo(0.5, 6);
    expect(plainBodyOpacity(PLAIN_BODY_FADE_MS)).toBe(1);
    for (let t = PLAIN_BODY_FADE_MS; t < 3_600_000; t += 7_919) expect(plainBodyOpacity(t)).toBe(1);
  });
});
