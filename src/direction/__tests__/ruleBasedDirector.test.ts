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
    expect(d.palette).toEqual(DEFAULT_PALETTE);
    expect(d.texture).toBe('grain');
    expect(d.tempoFeel).toBe('sway');
    expect(d.idleGlyphs).toBe(DEFAULT_IDLE_GLYPHS);
  });

  test('passes its own validator', () => {
    for (const seed of ['a', 'b', 'c']) {
      expect(validateSongDirection(directSongByRules(LINES, seed), LINES)).not.toBeNull();
    }
  });
});
