import { parseLrc } from '../../../recognition/lrc';
import { validateSongDirection } from '../../../direction/validateDirection';
import { FIXTURE_DIRECTION, FIXTURE_LRC, FIXTURE_TRACK } from '../fixtureSong';

const lines = parseLrc(FIXTURE_LRC);

test('fixture LRC parses to 20 lines spanning about 70 seconds', () => {
  expect(lines).toHaveLength(20);
  const last = lines[lines.length - 1]!;
  expect(last.startMs).toBeGreaterThanOrEqual(65_000);
  expect(last.startMs).toBeLessThanOrEqual(80_000);
});

test('fixture LRC has a shout, an English line, two empty lines and a repeated line', () => {
  const texts = lines.map((l) => l.text);
  expect(texts.filter((t) => t === '')).toHaveLength(2);
  expect(texts.some((t) => t !== '' && [...t].length <= 4)).toBe(true);
  expect(texts.some((t) => /^[A-Za-z ]+$/.test(t))).toBe(true);
  const nonEmpty = texts.filter((t) => t !== '');
  expect(new Set(nonEmpty).size).toBeLessThan(nonEmpty.length);
});

test('fixture direction validates against the fixture lines', () => {
  expect(
    validateSongDirection(
      FIXTURE_DIRECTION,
      lines.map((l) => l.text),
    ),
  ).not.toBeNull();
});

test('fixture direction uses every entrance and every hold at least once', () => {
  const dirs = FIXTURE_DIRECTION.lines;
  expect(new Set(dirs.map((d) => d.entrance))).toEqual(
    new Set(['cut', 'drop', 'rise', 'scatter', 'trace', 'fade']),
  );
  expect(new Set(dirs.map((d) => d.hold))).toEqual(
    new Set(['still', 'pulse', 'drift', 'shake', 'breathe']),
  );
});

test('fixture direction has two fonts, three xl lines and mixed orientation', () => {
  const dirs = FIXTURE_DIRECTION.lines;
  expect(new Set(dirs.map((d) => d.font)).size).toBe(2);
  expect(dirs.filter((d) => d.size === 'xl')).toHaveLength(3);
  expect(new Set(dirs.map((d) => d.orientation)).size).toBe(2);
});

test('fixture track is the placeholder title', () => {
  expect(FIXTURE_TRACK).toEqual({ title: '仮題', artist: 'MUSICAGE' });
});
