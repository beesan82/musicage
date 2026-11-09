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
