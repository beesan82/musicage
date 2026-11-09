import { METER_MAX_HEIGHT } from '../bandMeter';
import { UNRECOGNIZED_IDLE_FACES } from '../idleComposition';
import { printArea, SIZE_RATIO } from '../layout';
import type { GlyphMeasure } from '../layout';
import { NAMEPLATE_ELLIPSIS } from '../nameplate';
import {
  composePlainSheet,
  paginatePlain,
  PLAIN_LEADING,
  PLAIN_PAGE_FADE_MS,
  PLAIN_PAGE_MS,
  plainNextTurnInMs,
  plainPageIndex,
  plainPageOpacity,
  plainParagraphs,
  plainTitleDirection,
  wrapPlainLine,
} from '../plainSheet';
import type { PlainSheet } from '../plainSheet';

// The jest Font: every glyph sizePx wide, ascent −0.88, descent 0.12.
// Every text here is fictional, written for these tests.
const VIEWPORT = { width: 390, height: 844, insetTop: 47, insetBottom: 34 };
const measure: GlyphMeasure = (_char, sizePx) => ({ advance: sizePx, ascent: -sizePx * 0.88, descent: sizePx * 0.12 });
const measureFor = () => measure;
const XS = 390 * SIZE_RATIO.xs;
const S = 390 * SIZE_RATIO.s;
const AREA = printArea(VIEWPORT, -XS * 0.88);
const faces = UNRECOGNIZED_IDLE_FACES;
const song = { title: '架空の歌', artist: '架空の人' };
const PITCH = S * PLAIN_LEADING;
const EPS = 1e-6;

const compose = (text: string, track = song, viewport = VIEWPORT, area = AREA): PlainSheet => {
  const sheet = composePlainSheet(track, text, faces, viewport, area, measureFor);
  if (sheet === null) throw new Error('expected a lyric sheet');
  return sheet;
};

/** The top of the body's room: under the heading's rule. */
const bodyTopOf = (sheet: PlainSheet) => sheet.rule.y + sheet.rule.height;
/** The foot of the body's room: above the meter's room. */
const BODY_FOOT = AREA.bottom - METER_MAX_HEIGHT;

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

describe('paginatePlain', () => {
  let n = 0;
  const row = () => ({ text: `r${(n += 1)}`, continued: false });
  /** A paragraph of `lines` one-row lines. */
  const para = (lines: number) => Array.from({ length: lines }, () => [row()]);
  const flat = (pages: ReturnType<typeof paginatePlain>) =>
    pages
      .flat()
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => s.text);
  beforeEach(() => {
    n = 0;
  });

  test('paragraphs that fit share a page with one empty slot between them', () => {
    const pages = paginatePlain([para(3), para(3)], 10);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.map((s) => s?.text ?? null)).toEqual(['r1', 'r2', 'r3', null, 'r4', 'r5', 'r6']);
  });

  test('a paragraph that does not fit on the rest of a page starts the next one; no page starts or ends empty', () => {
    const pages = paginatePlain([para(8), para(4)], 10);
    expect(pages.map((p) => p.length)).toEqual([8, 4]);
    for (const page of pages) {
      expect(page[0]).not.toBeNull();
      expect(page[page.length - 1]).not.toBeNull();
    }
  });

  test('a paragraph longer than a page breaks between its lines; a line longer than a page between its rows', () => {
    expect(paginatePlain([para(25)], 10).map((p) => p.length)).toEqual([10, 10, 5]);
    const longLine = [Array.from({ length: 12 }, (_, i) => ({ text: `w${i}`, continued: i > 0 }))];
    expect(paginatePlain([longLine], 10).map((p) => p.length)).toEqual([10, 2]);
  });

  test('a wrapped line is kept on one page when it fits on a fresh one', () => {
    const twoRows = [{ text: 'a', continued: false }, { text: 'b', continued: true }];
    const pages = paginatePlain([[...para(9), twoRows]], 10);
    expect(pages.map((p) => p.map((s) => s?.text))).toEqual([
      ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'],
      ['a', 'b'],
    ]);
  });

  test('every row appears exactly once, in order, whatever the capacity (even a degenerate one)', () => {
    const paragraphs = [para(2), para(7), para(1), para(13), para(4)];
    const all = paragraphs.flat(2).map((s) => s.text);
    for (const cap of [0, 1, 2, 3, 5, 10, 40]) {
      const pages = paginatePlain(paragraphs, cap);
      expect(flat(pages)).toEqual(all);
      for (const page of pages) {
        expect(page.length).toBeLessThanOrEqual(Math.max(1, cap));
        expect(page[0]).not.toBeNull();
      }
    }
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

  test('the meter stands on the foot of the print area; the note and the folio share the caption row', () => {
    const sheet = compose('あ');
    expect(sheet.meter).toEqual({ x: AREA.left, width: AREA.right - AREA.left, baseline: AREA.bottom, maxHeight: METER_MAX_HEIGHT });
    expect(sheet.note).toEqual({ x: AREA.left, y: AREA.captionBaseline, sizePx: XS });
  });

  test('a Latin text lies horizontal: one row run per line, s, PLAIN_LEADING apart, from the left edge', () => {
    const sheet = compose('Lamp low\nNeedle down');
    expect(sheet.body.orientation).toBe('horizontal');
    expect(sheet.body.sizePx).toBe(S);
    expect(sheet.body.font).toBe(faces.primary);
    expect(sheet.body.pages).toHaveLength(1);
    const runs = sheet.body.pages[0]!.runs;
    expect(runs.map((r) => r.text)).toEqual(['Lamp low', 'Needle down']);
    for (const r of runs) {
      expect(r.x).toBe(AREA.left);
      expect(r.rotateDeg).toBe(0);
    }
    expect(runs[1]!.y - runs[0]!.y).toBeCloseTo(PITCH, 6);
    expect(runs[0]!.y - S * 0.88).toBeCloseTo(bodyTopOf(sheet) + 20, 6);
    expect(sheet.folios).toEqual([]);
  });

  test('a wrapped horizontal line indents its further rows by one em and keeps its words whole', () => {
    const sheet = compose('aaaa bbbb cccc dddd eeee');
    const runs = sheet.body.pages[0]!.runs;
    // 14 glyphs of S fit in a row of 342px, 13 in an indented one.
    expect(runs.map((r) => r.text)).toEqual(['aaaa bbbb cccc', 'dddd eeee']);
    expect(runs[0]!.x).toBe(AREA.left);
    expect(runs[1]!.x).toBeCloseTo(AREA.left + S, 6);
  });

  test('kana or kanji set the body vertical: a glyph per run, columns from the right, a blank column between paragraphs', () => {
    const sheet = compose('\n\n\nあい\n\n\n\n\nうA\n\n');
    expect(sheet.body.orientation).toBe('vertical');
    const runs = sheet.body.pages[0]!.runs;
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

  test('a single line is a single page without a folio', () => {
    const sheet = compose('ひとつだけの行');
    expect(sheet.body.pages).toHaveLength(1);
    expect(sheet.body.pages[0]!.runs).toHaveLength(7);
    expect(sheet.folios).toEqual([]);
  });

  test.each([
    ['vertical', 'あいうえおかきくけこ'],
    ['horizontal', 'abc defg hijk lmno pqrs'],
  ])('a long %s text pages, every page within the body room and the side margins, with a folio per page', (_, line) => {
    const text = Array.from({ length: 12 }, () => Array.from({ length: 4 }, () => line).join('\n')).join('\n\n');
    const sheet = compose(text);
    const pages = sheet.body.pages;
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) {
      expect(page.runs.length).toBeGreaterThan(0);
      const b = page.bounds;
      expect(b.x).toBeGreaterThanOrEqual(AREA.left - EPS);
      expect(b.x + b.width).toBeLessThanOrEqual(AREA.right + EPS);
      expect(b.y).toBeGreaterThan(bodyTopOf(sheet));
      expect(b.y + b.height).toBeLessThanOrEqual(BODY_FOOT + EPS);
    }
    expect(sheet.folios.map((f) => f.text)).toEqual(pages.map((_, i) => `${i + 1} / ${pages.length}`));
    for (const f of sheet.folios) {
      expect(f.y).toBe(AREA.captionBaseline);
      expect(f.sizePx).toBe(XS);
      expect(f.x + [...f.text].length * XS).toBeCloseTo(AREA.right, 6);
    }
    // The folio and the note do not meet.
    const noteRight = AREA.left + '同期情報のない歌詞です'.length * XS;
    for (const f of sheet.folios) expect(f.x).toBeGreaterThan(noteRight);
    // One size on every page, and every character of the text printed once.
    const printed = pages.flatMap((p) => p.runs.map((r) => r.text)).join('').replace(/ /g, '');
    expect(printed).toBe(text.replace(/\s/g, ''));
  });

  test('a text of blank lines around one character is a one-glyph page', () => {
    const sheet = compose('\n\n\n\n　\n\nあ\n\n\n\n');
    expect(sheet.body.pages).toHaveLength(1);
    expect(sheet.body.pages[0]!.runs.map((r) => r.text)).toEqual(['あ']);
  });

  test('the body bounds cover every page (the lamp centre, which page turns do not move)', () => {
    const sheet = compose(Array.from({ length: 30 }, () => 'あいうえお').join('\n\n'));
    const b = sheet.body.bounds;
    for (const page of sheet.body.pages) {
      expect(page.bounds.x).toBeGreaterThanOrEqual(b.x - EPS);
      expect(page.bounds.y).toBeGreaterThanOrEqual(b.y - EPS);
      expect(page.bounds.x + page.bounds.width).toBeLessThanOrEqual(b.x + b.width + EPS);
      expect(page.bounds.y + page.bounds.height).toBeLessThanOrEqual(b.y + b.height + EPS);
    }
  });

  test('the same text always sets the same sheet', () => {
    const text = 'あいう\nえお\n\nかき';
    expect(compose(text)).toEqual(compose(text));
  });
});

describe('the page timing: a fixed interval, nothing from the music', () => {
  test('page 0 until the body starts, then one page per PLAIN_PAGE_MS, round and round', () => {
    expect(plainPageIndex(-1_500, 3)).toBe(0);
    expect(plainPageIndex(0, 3)).toBe(0);
    expect(plainPageIndex(PLAIN_PAGE_MS - 1, 3)).toBe(0);
    expect(plainPageIndex(PLAIN_PAGE_MS, 3)).toBe(1);
    expect(plainPageIndex(2 * PLAIN_PAGE_MS + 5, 3)).toBe(2);
    expect(plainPageIndex(3 * PLAIN_PAGE_MS + 5, 3)).toBe(0);
    expect(plainPageIndex(10 * PLAIN_PAGE_MS, 1)).toBe(0);
  });

  test('a single page fades in once and stays; it never turns', () => {
    expect(plainPageOpacity(-1, 1)).toBe(0);
    expect(plainPageOpacity(PLAIN_PAGE_FADE_MS / 2, 1)).toBeCloseTo(0.5, 6);
    expect(plainPageOpacity(PLAIN_PAGE_FADE_MS, 1)).toBe(1);
    expect(plainPageOpacity(3_600_000, 1)).toBe(1);
    expect(plainNextTurnInMs(0, 1)).toBeNull();
    expect(plainNextTurnInMs(50_000, 1)).toBeNull();
  });

  test('with more pages each fades in, holds, and fades out before the next; they never overlap', () => {
    const fade = PLAIN_PAGE_FADE_MS;
    expect(plainPageOpacity(0, 2)).toBe(0);
    expect(plainPageOpacity(fade / 2, 2)).toBeCloseTo(0.5, 6);
    expect(plainPageOpacity(PLAIN_PAGE_MS / 2, 2)).toBe(1);
    expect(plainPageOpacity(PLAIN_PAGE_MS - fade / 2, 2)).toBeCloseTo(0.5, 6);
    expect(plainPageOpacity(PLAIN_PAGE_MS, 2)).toBe(0);
    for (let t = -2_000; t < 5 * PLAIN_PAGE_MS; t += 37) {
      const o = plainPageOpacity(t, 4);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(1);
    }
  });

  test('the next turn is at the next PLAIN_PAGE_MS boundary of the body clock', () => {
    expect(plainNextTurnInMs(-1_500, 3)).toBe(PLAIN_PAGE_MS + 1_500);
    expect(plainNextTurnInMs(100, 3)).toBe(PLAIN_PAGE_MS - 100);
    expect(plainNextTurnInMs(PLAIN_PAGE_MS + 1, 3)).toBe(PLAIN_PAGE_MS - 1);
  });
});
