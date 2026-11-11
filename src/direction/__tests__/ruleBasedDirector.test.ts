import { PALETTE_FAMILIES, paletteFamilyFor } from '../palettes';
import { directSongByRules } from '../ruleBasedDirector';
import { validateSongDirection } from '../validateDirection';
import { DEFAULT_IDLE_GLYPHS, DEFAULT_PALETTE } from '../types';

const LINES = [
  '夜の底で灯りを数える',
  '走れ！',
  '',
  'tokyo midnight line',
  'ああ',
  '窓辺に残る淡い光',
  '君の名前を呼んだ',
  'もう少しだけ歩こう',
  '風が街を通り過ぎる',
  '駆けろ！',
  '静かな朝を待っている',
  'ララ',
  '遠い海の向こうまで',
  'ララ',
  '雨上がりの空に虹が架かる日まで私は歌い続けていたいと願いながら今日も街の灯りの下を歩いていく',
  '光',
  'ララ',
  '眠れぬ夜の終わりに',
  'さよなら',
  'また会う日まで',
];

describe('directSongByRules', () => {
  test('is deterministic for the same seed', () => {
    expect(directSongByRules(LINES, 'a')).toEqual(directSongByRules(LINES, 'a'));
  });

  test('uses at most two fonts and at most three xl lines', () => {
    const d = directSongByRules(LINES, 'a');
    expect(d.lines).toHaveLength(LINES.length);
    expect(new Set(d.lines.map((l) => l.font)).size).toBeLessThanOrEqual(2);
    // Five short lines compete for xl; only the first three get it.
    expect(d.lines.filter((l) => l.size === 'xl')).toHaveLength(3);
  });

  test('kanji-heavy line gets mincho and short exclamation gets gothic-heavy xl', () => {
    const d = directSongByRules(LINES, 'a');
    expect(d.lines[0]?.font).toBe('mincho');
    expect(d.lines[1]?.font).toBe('gothic-heavy');
    expect(d.lines[1]?.size).toBe('xl');
  });

  test('empty line gets size xs, entrance fade, hold still', () => {
    const l = directSongByRules(LINES, 'a').lines[2];
    expect(l?.size).toBe('xs');
    expect(l?.entrance).toBe('fade');
    expect(l?.hold).toBe('still');
    expect(l?.emphasis).toEqual([]);
  });

  test('latin lines are horizontal, kanji lines vertical, long lines horizontal', () => {
    const d = directSongByRules(LINES, 'a');
    expect(d.lines[3]?.orientation).toBe('horizontal');
    expect(d.lines[0]?.orientation).toBe('vertical');
    expect(d.lines[14]?.orientation).toBe('horizontal');
    expect(d.lines[14]?.size).toBe('xs');
  });

  test('repeated lines are accented; emphasis is the first kanji', () => {
    const d = directSongByRules(LINES, 'a');
    expect(d.lines[11]?.accent).toBe(true);
    expect(d.lines[0]?.accent).toBe(false);
    expect(d.lines[0]?.emphasis).toEqual([0]);
    expect(d.lines[5]?.emphasis).toEqual([0]);
    expect(d.lines[7]?.emphasis).toEqual([2]);
    expect(d.lines[4]?.emphasis).toEqual([]);
  });

  test('a line sung twice is chorus-like: accented and set heavy; a line sung once is not', () => {
    const texts = ['夜の底で灯りを数える', '帰ろう', '風が街を通り過ぎる', '帰ろう'];
    const d = directSongByRules(texts, 'a');
    expect(d.lines[1]?.accent).toBe(true);
    expect(d.lines[3]?.accent).toBe(true);
    expect(d.lines[1]?.font).toBe('gothic-heavy');
    expect(d.lines[0]?.accent).toBe(false);
    expect(d.lines[2]?.accent).toBe(false);
    expect(validateSongDirection(d, texts)).not.toBeNull();
  });

  test('never repeats scatter entrance or shake hold back to back', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const { lines } = directSongByRules(LINES, seed);
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i]?.entrance === 'scatter' && lines[i - 1]?.entrance === 'scatter').toBe(false);
        expect(lines[i]?.hold === 'shake' && lines[i - 1]?.hold === 'shake').toBe(false);
      }
    }
  });

  test('varies with the seed', () => {
    expect(directSongByRules(LINES, 'a')).not.toEqual(directSongByRules(LINES, 'zzz'));
  });

  test('fills song-level defaults', () => {
    const d = directSongByRules(LINES, 'a');
    expect(d.tempoFeel).toBe('sway');
    expect(d.idleGlyphs).toBe(DEFAULT_IDLE_GLYPHS);
  });

  test('takes palette and texture from the colour family the lyrics point to', () => {
    // LINES has 夜 (twice), 窓, 静, 眠 for ai against 光 (twice), 朝 for kohaku.
    const d = directSongByRules(LINES, 'a');
    const ai = PALETTE_FAMILIES.find((f) => f.key === 'ai')!;
    expect(d.palette).toEqual(ai.palette);
    expect(d.texture).toBe('void');
    expect(d.palette).not.toBe(ai.palette);
  });

  test('sea lyrics get umi; the palette follows paletteFamilyFor for any lines', () => {
    const sea = ['遠い海の向こう', '波を数えて', 'さよなら'];
    const d = directSongByRules(sea, 'x');
    const umi = PALETTE_FAMILIES.find((f) => f.key === 'umi')!;
    expect(d.palette).toEqual(umi.palette);
    expect(d.texture).toBe(umi.texture);

    const plain = ['ラララ', 'さよなら'];
    for (const seed of ['a', 'b', 'c', 'd']) {
      const family = paletteFamilyFor(plain, seed);
      const rules = directSongByRules(plain, seed);
      expect(rules.palette).toEqual(family.palette);
      expect(rules.texture).toBe(family.texture);
    }
  });

  test('the palette is no longer fixed to DEFAULT_PALETTE', () => {
    expect(directSongByRules(LINES, 'a').palette).not.toEqual(DEFAULT_PALETTE);
  });

  test('palette choice leaves the line directions untouched', () => {
    // Same lines, same seed: only song-level colour comes from the family.
    const sea = ['遠い海の向こう', '波を数えて'];
    const night = ['遠い夜の向こう', '月を数えて'];
    const a = directSongByRules(sea, 's').lines.map(({ font, size, orientation, entrance, hold }) => ({
      font,
      size,
      orientation,
      entrance,
      hold,
    }));
    const b = directSongByRules(night, 's').lines.map(({ font, size, orientation, entrance, hold }) => ({
      font,
      size,
      orientation,
      entrance,
      hold,
    }));
    expect(a).toEqual(b);
  });

  test('passes its own validator', () => {
    for (const seed of ['a', 'b', 'c']) {
      expect(validateSongDirection(directSongByRules(LINES, seed), LINES)).not.toBeNull();
    }
  });
});

describe('the ways lines come on (design spec §4, 2026-11-11 evening)', () => {
  // A fictional song: two verses and a chorus that comes back.
  const SONG = [
    '古い駅の時計が止まる',
    'ほどけた靴ひもを結ぶ',
    '夜明け前の青い窓',
    'まだ誰も知らない',
    '',
    '灯をともせ',
    'ふたりの影が揺れる',
    '灯をともせ',
    '',
    '線路沿いに咲く花の名を',
    '数えきれずに笑った',
    '風だけが追いかける',
    'ポケットの中の切符',
    '',
    '灯をともせ',
    'ふたりの影が揺れる',
    '灯をともせ',
    'さあ！',
    '灯をともせ',
  ];
  const SEEDS = ['架空の人/架空の歌', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const SIZES = ['xs', 's', 'm', 'l', 'xl'];
  const rank = (size: string) => SIZES.indexOf(size);
  /** The shown (non-empty) lines with their texts and indices. */
  const shownOf = (texts: string[], seed: string) => {
    const { lines } = directSongByRules(texts, seed);
    return lines.flatMap((line, i) => (texts[i]!.trim() === '' ? [] : [{ ...line, i, text: texts[i]!.trim() }]));
  };
  const counts = (texts: string[]) => {
    const map = new Map<string, number>();
    for (const t of texts) if (t.trim()) map.set(t.trim(), (map.get(t.trim()) ?? 0) + 1);
    return map;
  };

  test('is deterministic: the same song and lyrics always get the same directions', () => {
    for (const seed of SEEDS) {
      expect(directSongByRules([...SONG], seed)).toEqual(directSongByRules(SONG, seed));
    }
    // Only the lines and the seed go in: nothing from the room (no volume, no beat).
    expect(directSongByRules.length).toBe(2);
  });

  test('no entrance comes three lines running, nor twice within any three shown lines', () => {
    for (const seed of SEEDS) {
      const shown = shownOf(SONG, seed);
      for (let k = 2; k < shown.length; k++) {
        const window = [shown[k - 2]!.entrance, shown[k - 1]!.entrance, shown[k]!.entrance];
        expect(new Set(window).size).toBe(3);
      }
      // So no entrance takes more than a third of the song (rounded up).
      const tally = new Map<string, number>();
      for (const line of shown) tally.set(line.entrance, (tally.get(line.entrance) ?? 0) + 1);
      for (const n of tally.values()) expect(n).toBeLessThanOrEqual(Math.ceil(shown.length / 3));
    }
  });

  test('the new entrances come from the lines themselves: kanji print, trace or fade; cries drop, cut or slide; Latin slides, cuts or rises', () => {
    const cases: [string[], string[]][] = [
      [['夜明けの駅舎', '古時計の針', '雪解けの川面'], ['print', 'trace', 'fade']],
      [['走れ！', '跳べ！', '叫べ！'], ['drop', 'cut', 'slide']],
      [['neon rain', 'paper moon', 'city lights'], ['slide', 'cut', 'rise']],
    ];
    for (const [texts, expected] of cases) {
      for (const seed of SEEDS) {
        const entrances = directSongByRules(texts, seed).lines.map((l) => l.entrance);
        expect([...entrances].sort()).toEqual([...expected].sort());
      }
    }
  });

  test('a long line never scatters or gathers', () => {
    // Lines 0 and 3 are longer than 20 characters.
    const long = [
      '雨上がりの空に虹が架かる日までずっと歌い続けたいと願う',
      'ほどけた靴ひも',
      'まだ誰も知らない',
      '帰り道の向こうに続く長い長い坂道をのぼっていく',
    ];
    for (const seed of SEEDS) {
      const lines = directSongByRules(long, seed).lines;
      for (const i of [0, 3]) expect(['scatter', 'gather']).not.toContain(lines[i]!.entrance);
    }
  });

  test('holds and placements change from line to line (a returning line keeps its pulse and the centre)', () => {
    const repeated = counts(SONG);
    for (const seed of SEEDS) {
      const shown = shownOf(SONG, seed);
      const seen = new Set<string>();
      const returning = shown.map((line) => {
        const back = seen.has(line.text) && (repeated.get(line.text) ?? 0) >= 2;
        seen.add(line.text);
        return back;
      });
      for (let k = 1; k < shown.length; k++) {
        if (returning[k]) continue;
        expect(shown[k]!.hold).not.toBe(shown[k - 1]!.hold);
        expect(shown[k]!.placement).not.toBe(shown[k - 1]!.placement);
      }
      for (const line of shown) expect(line.placement).toBeDefined();
    }
  });

  test('neighbouring ordinary lines contrast in size, and a third standing line lies down', () => {
    const repeated = counts(SONG);
    for (const seed of SEEDS) {
      const shown = shownOf(SONG, seed);
      for (let k = 1; k < shown.length; k++) {
        const line = shown[k]!;
        const ordinary = (repeated.get(line.text) ?? 0) < 2 && line.size !== 'xl' && [...line.text].length <= 20;
        if (ordinary) expect(line.size).not.toBe(shown[k - 1]!.size);
      }
      for (let k = 2; k < shown.length; k++) {
        const three = [shown[k - 2]!, shown[k - 1]!, shown[k]!];
        const flippable = [...shown[k]!.text].length <= 14;
        if (flippable) expect(three.every((l) => l.orientation === 'vertical')).toBe(false);
      }
      // The song is not all one way round.
      expect(new Set(shown.map((l) => l.orientation)).size).toBe(2);
    }
  });

  test('a repeated line is promoted when it comes back: larger or as large, its own mark, pulse, the centre, wider emphasis', () => {
    for (const seed of SEEDS) {
      const { lines } = directSongByRules(SONG, seed);
      const firstAt = new Map<string, number>();
      const marks = new Map<string, string>();
      SONG.forEach((text, i) => {
        const t = text.trim();
        if (!t) return;
        const first = firstAt.get(t);
        if (first === undefined) {
          firstAt.set(t, i);
          return;
        }
        const before = lines[first]!;
        const now = lines[i]!;
        expect(before.accent).toBe(true);
        expect(now.accent).toBe(true);
        expect(rank(now.size)).toBeGreaterThanOrEqual(rank(before.size));
        expect(['none', 'rule']).toContain(before.ornament);
        expect(['frame', 'circle']).toContain(now.ornament);
        // The same text always comes back with the same mark.
        expect(now.ornament).toBe(marks.get(t) ?? now.ornament);
        marks.set(t, now.ornament);
        expect(now.hold).toBe('pulse');
        expect(now.placement).toBe('center');
        expect(now.emphasis.length).toBeGreaterThanOrEqual(before.emphasis.length);
        expect(['drop', 'gather', 'print']).toContain(now.entrance);
      });
      // The chorus opening its second section (line 14) is set larger than
      // its first appearance (line 5): the structural peak takes the xl budget.
      expect(lines[14]!.size).toBe('xl');
      expect(rank(lines[14]!.size)).toBeGreaterThan(rank(lines[5]!.size));
      expect(lines.filter((l) => l.size === 'xl').length).toBeLessThanOrEqual(3);
      expect(validateSongDirection(directSongByRules(SONG, seed), SONG)).not.toBeNull();
    }
  });
});
