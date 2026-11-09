import { DEFAULT_IDLE_GLYPHS } from '../../direction/types';
import type { LineDirection, SongDirection } from '../../direction/types';
import type { FontKey } from '../fonts';
import { composeIdle, idleFaces, UNRECOGNIZED_IDLE_FACES } from '../idleComposition';
import { SIZE_RATIO } from '../layout';
import type { GlyphMeasure, PlacedGlyph } from '../layout';

const vp = { width: 390, height: 844, insetTop: 59, insetBottom: 34 };
const measure: GlyphMeasure = (_ch, size) => ({ advance: size, ascent: -size * 0.88, descent: size * 0.12 });
const GLYPHS = 'ABC一二三四五六七八九十';
const track = { title: 'Night Drive', artist: 'Kei' };

// Size tiers: xl anchors, l beside them, m two columns away.
const XL = SIZE_RATIO.xl * 390;
const L = SIZE_RATIO.l * 390;
const M = SIZE_RATIO.m * 390;
const XS = SIZE_RATIO.xs * 390;

// Reserved bands, from MusicageApp's layout (independent of the module's constants):
// - wordmark row: paddingTop 12 + one 13pt line (~16px) below the top inset.
const WORDMARK_BOTTOM = 59 + 12 + 16; // 87
// - controls: content paddingBottom 18 + two 48px button rows with a 16px gap, above the bottom inset.
const CONTROLS_TOP = 844 - 34 - (18 + 48 + 16 + 48); // 680
// Caption baseline 12 above the controls; its top is the xs ascent above that.
const CAPTION_Y = CONTROLS_TOP - 12; // 668
const CAPTION_TOP = CAPTION_Y - XS * 0.88;
// Glyph rows: a 24px margin under the wordmark and above the caption, four
// baselines spread so the xl ascent touches the top and the xl descent the bottom.
const FIRST_BASELINE = WORDMARK_BOTTOM + 24 + XL * 0.88;
const LAST_BASELINE = CAPTION_TOP - 24 - XL * 0.12;
const PITCH = (LAST_BASELINE - FIRST_BASELINE) / 3;
const BASELINES = [0, 1, 2, 3].map((row) => FIRST_BASELINE + row * PITCH);
// Columns: left edges on thirds of the 342px usable width from the 24px margin.
const COLUMN_X = [24, 24 + 114, 24 + 228];

const rowOf = (g: PlacedGlyph) => {
  const distances = BASELINES.map((b) => Math.abs(g.y - b));
  return distances.indexOf(Math.min(...distances));
};
const colOf = (g: PlacedGlyph) => COLUMN_X.indexOf(g.x);
const boxOf = (g: PlacedGlyph) => {
  const { advance, ascent, descent } = measure(g.char, g.sizePx);
  return { left: g.x, top: g.y + ascent, right: g.x + advance, bottom: g.y + descent };
};
const compose = (epoch: number, barInEpoch: number, glyphs: string = GLYPHS) =>
  composeIdle(epoch, barInEpoch, glyphs, vp, null, measure);
/** Every (epoch, bar) pair over 16 epochs, with the custom and the default glyph strings. */
function eachComposition(fn: (glyphs: PlacedGlyph[], epoch: number, bar: number) => void) {
  for (let epoch = 0; epoch < 16; epoch++) {
    for (let bar = 0; bar < 8; bar++) {
      fn(compose(epoch, bar).glyphs, epoch, bar);
      fn(compose(epoch, bar, '').glyphs, epoch, bar);
    }
  }
}

test('is deterministic for the same epoch and bar', () => {
  expect(compose(7, 3)).toEqual(compose(7, 3));
  expect(compose(0, 0)).toEqual(compose(0, 0));
});

test('within an epoch the layout and count are fixed; exactly one slot changes char per bar', () => {
  for (let epoch = 0; epoch < 6; epoch++) {
    const base = compose(epoch, 0).glyphs;
    for (let bar = 1; bar < 8; bar++) {
      const prev = compose(epoch, bar - 1).glyphs;
      const next = compose(epoch, bar).glyphs;
      expect(next).toHaveLength(base.length);
      next.forEach((g, slot) => {
        // Position, size and grid phase never move inside an epoch.
        expect(g.x).toBe(base[slot]!.x);
        expect(g.y).toBe(base[slot]!.y);
        expect(g.sizePx).toBe(base[slot]!.sizePx);
        expect(g.phaseOffset).toBe(base[slot]!.phaseOffset);
        expect(g.emphasized).toBe(false);
      });
      const changed = next.filter((g, slot) => g.char !== prev[slot]!.char);
      expect(changed).toHaveLength(1);
      expect(changed[0]).toBe(next[(bar - 1) % next.length]);
    }
  }
});

test('the swapped slot carries a unique index (1000 + absolute bar) so its layer key changes', () => {
  for (let epoch = 0; epoch < 4; epoch++) {
    expect(compose(epoch, 0).glyphs.every((g, slot) => g.index === slot)).toBe(true);
    for (let bar = 1; bar < 8; bar++) {
      const glyphs = compose(epoch, bar).glyphs;
      const unique = glyphs.filter((g) => g.index >= 1000);
      expect(unique).toHaveLength(1);
      expect(unique[0]!.index).toBe(1000 + epoch * 8 + bar);
      expect(unique[0]).toBe(glyphs[(bar - 1) % glyphs.length]);
      glyphs.forEach((g, slot) => {
        if (g !== unique[0]) expect(g.index).toBe(slot);
      });
    }
  }
});

test('never rotates glyphs sideways (digits and the long-vowel mark included)', () => {
  eachComposition((glyphs) => {
    for (const g of glyphs) expect(g.rotateDeg).toBe(0);
  });
});

test('places 5-9 glyphs on distinct cells of the 4-row x 3-column grid, every row occupied', () => {
  eachComposition((glyphs) => {
    expect(glyphs.length).toBeGreaterThanOrEqual(5);
    expect(glyphs.length).toBeLessThanOrEqual(9);
    const cells = glyphs.map((g) => {
      const col = colOf(g);
      expect(col).toBeGreaterThanOrEqual(0);
      return `${col},${rowOf(g)}`;
    });
    expect(new Set(cells).size).toBe(glyphs.length);
    expect(new Set(glyphs.map(rowOf))).toEqual(new Set([0, 1, 2, 3]));
  });
});

test('glyph boxes stay out of the wordmark band, the controls band and the caption line', () => {
  eachComposition((glyphs) => {
    for (const g of glyphs) {
      const box = boxOf(g);
      expect(box.top).toBeGreaterThanOrEqual(WORDMARK_BOTTOM);
      expect(box.bottom).toBeLessThanOrEqual(CONTROLS_TOP);
      expect(box.bottom).toBeLessThanOrEqual(CAPTION_TOP);
      expect(box.left).toBeGreaterThanOrEqual(24);
      expect(box.right).toBeLessThanOrEqual(390 - 24);
    }
  });
});

test('glyphs on the same row share one baseline, and the baselines are the four evenly spaced rows', () => {
  eachComposition((glyphs) => {
    const byRow = new Map<number, PlacedGlyph[]>();
    for (const g of glyphs) byRow.set(rowOf(g), [...(byRow.get(rowOf(g)) ?? []), g]);
    byRow.forEach((members, row) => {
      expect(members[0]!.y).toBeCloseTo(BASELINES[row]!, 6);
      for (const g of members) expect(g.y).toBe(members[0]!.y);
    });
  });
});

test('sizes come from the three tiers: one xl anchor per row, l beside it, m two columns away', () => {
  eachComposition((glyphs) => {
    for (const g of glyphs) expect([XL, L, M]).toContain(g.sizePx);
    for (let row = 0; row < 4; row++) {
      const members = glyphs.filter((g) => rowOf(g) === row);
      const anchors = members.filter((g) => g.sizePx === XL);
      expect(anchors).toHaveLength(1);
      const anchorCol = colOf(anchors[0]!);
      for (const g of members) {
        const distance = Math.abs(colOf(g) - anchorCol);
        expect(g.sizePx).toBe([XL, L, M][distance]);
      }
    }
  });
});

test('odd epochs line the anchors up in one column; even epochs zigzag them across the columns', () => {
  const anchorColumns = (epoch: number) => {
    const glyphs = compose(epoch, 0).glyphs;
    return [0, 1, 2, 3].map((row) => colOf(glyphs.find((g) => rowOf(g) === row && g.sizePx === XL)!));
  };
  const zigzags = [
    [0, 1, 2, 1],
    [1, 2, 1, 0],
    [2, 1, 0, 1],
    [1, 0, 1, 2],
  ];
  const seenAligned = new Set<number>();
  const seenZigzag = new Set<string>();
  // 64 epochs: enough that the hashed column / phase cannot plausibly repeat throughout.
  for (let epoch = 0; epoch < 64; epoch++) {
    const columns = anchorColumns(epoch);
    if (epoch % 2 === 1) {
      expect(new Set(columns).size).toBe(1);
      seenAligned.add(columns[0]!);
    } else {
      expect(zigzags).toContainEqual(columns);
      seenZigzag.add(columns.join(''));
    }
  }
  // The hashed variants are actually used, not one fixed shape.
  expect(seenAligned.size).toBeGreaterThan(1);
  expect(seenZigzag.size).toBeGreaterThan(1);
});

test('phaseOffset is (col + row) / 8 of the glyph grid cell', () => {
  eachComposition((glyphs) => {
    for (const g of glyphs) expect(g.phaseOffset).toBe((colOf(g) + rowOf(g)) / 8);
  });
});

test('the composition changes across epochs', () => {
  expect(compose(0, 0).glyphs).not.toEqual(compose(1, 0).glyphs);
  expect(compose(1, 0).glyphs).not.toEqual(compose(2, 0).glyphs);
  expect(compose(0, 0).glyphs).not.toEqual(compose(2, 0).glyphs);
});

test('uses only characters from the glyph string, also after swaps', () => {
  for (let epoch = 0; epoch < 4; epoch++) {
    for (let bar = 0; bar < 8; bar++) {
      for (const g of compose(epoch, bar).glyphs) {
        expect([...GLYPHS]).toContain(g.char);
      }
    }
  }
});

test('caption is "artist — title" at the left margin just above the controls, size xs; null without a track', () => {
  const { caption, glyphs } = composeIdle(3, 0, GLYPHS, vp, track, measure);
  expect(caption).toEqual({
    text: 'Kei — Night Drive',
    x: 24,
    y: CAPTION_Y,
    sizePx: XS,
  });
  // The caption's box clears the controls, and the rows do not move when a track appears.
  expect(CAPTION_Y + XS * 0.12).toBeLessThanOrEqual(CONTROLS_TOP);
  expect(glyphs).toEqual(compose(3, 0).glyphs);
  expect(compose(3, 0).caption).toBeNull();
});

describe('the print: faces, accent and muted companions (visual overhaul spec §3e)', () => {
  test('anchors take the primary face; companions the secondary', () => {
    eachComposition((glyphs) => {
      for (const g of glyphs) expect(g.face).toBe(g.sizePx === XL ? 'primary' : 'secondary');
    });
  });

  test('each epoch has exactly one accent anchor, on the same row for all its bars', () => {
    const rows = new Set<number>();
    for (let epoch = 0; epoch < 32; epoch++) {
      const accentAnchors = (bar: number) =>
        compose(epoch, bar).glyphs.filter((g) => g.sizePx === XL && g.accent === true);
      const first = accentAnchors(0);
      expect(first).toHaveLength(1);
      const row = rowOf(first[0]!);
      rows.add(row);
      for (let bar = 1; bar < 8; bar++) {
        const anchors = accentAnchors(bar);
        // That row's anchor stays accent; any other accent anchor is the swapped glyph.
        expect(anchors.filter((g) => rowOf(g) === row)).toHaveLength(1);
        for (const g of anchors) if (rowOf(g) !== row) expect(g.index).toBeGreaterThanOrEqual(1000);
      }
    }
    // The accent row is hashed per epoch, so the lamp moves between rows.
    expect(rows.size).toBeGreaterThan(1);
  });

  test('the latest swapped glyph is accent until the next swap; the rest are the accent anchor and ink', () => {
    eachComposition((glyphs, _epoch, bar) => {
      const swapped = glyphs.filter((g) => g.index >= 1000);
      expect(swapped).toHaveLength(bar === 0 ? 0 : 1);
      for (const g of swapped) expect(g.accent).toBe(true);
      const accents = glyphs.filter((g) => g.accent === true);
      const anchorAccents = accents.filter((g) => g.sizePx === XL && g.index < 1000);
      // One accent anchor (unless the swap landed on it) plus the swapped glyph.
      expect(accents.length).toBeGreaterThanOrEqual(1);
      expect(accents.length).toBeLessThanOrEqual(2);
      expect(anchorAccents.length).toBeLessThanOrEqual(1);
      for (const g of accents) expect(g.sizePx === XL || g.index >= 1000).toBe(true);
    });
  });

  test('m-tier companions in the ink are at 0.75; every other glyph has no alpha', () => {
    eachComposition((glyphs) => {
      for (const g of glyphs) {
        expect(g.alpha).toBe(g.sizePx === M && g.accent !== true ? 0.75 : undefined);
      }
    });
  });
});

describe('idleFaces (visual overhaul spec §3e)', () => {
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

test('falls back to DEFAULT_IDLE_GLYPHS when the string is empty', () => {
  for (let epoch = 0; epoch < 3; epoch++) {
    const { glyphs } = compose(epoch, 0, '');
    expect(glyphs.length).toBeGreaterThanOrEqual(5);
    for (const g of glyphs) expect([...DEFAULT_IDLE_GLYPHS]).toContain(g.char);
  }
});
