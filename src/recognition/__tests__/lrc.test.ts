import { activeLyricIndex, parseLrc } from '../lrc';

describe('parseLrc', () => {
  it('parses timestamps, ignores metadata, retains repeats, and stable-sorts by time', () => {
    const lines = parseLrc(
      '[ar:Example Artist]\n[00:03.50]first\n[01:02.00]second\n[00:01.250]earlier\n[00:03.50]repeat',
    );

    expect(lines).toEqual([
      { startMs: 1250, text: 'earlier' },
      { startMs: 3500, text: 'first' },
      { startMs: 3500, text: 'repeat' },
      { startMs: 62000, text: 'second' },
    ]);
  });

  it('selects the active line for a supplied playback position', () => {
    const lines = parseLrc('[00:03.50]first\n[01:02.00]second');

    expect(activeLyricIndex(lines, 3499)).toBe(-1);
    expect(activeLyricIndex(lines, 3500)).toBe(0);
    expect(activeLyricIndex(lines, 62001)).toBe(1);
  });
});
