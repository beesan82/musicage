import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { BeatState } from '../../beat/types';
import { directSongByRules } from '../../direction/ruleBasedDirector';
import type { SongDirection } from '../../direction/types';
import type { LyricLine } from '../../recognition/types';
import * as fonts from '../fonts';
import { anchoredTime, LyricStage } from '../LyricStage';
import type { LyricStageProps } from '../LyricStage';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function inProvider(element: ReactElement) {
  return <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>;
}

function renderStage(props: LyricStageProps) {
  return render(inProvider(<LyricStage {...props} />));
}

function toLines(texts: string[]): LyricLine[] {
  return texts.map((text, i) => ({ startMs: i * 4000, text }));
}

function synced(texts: string[], index: number, songDirection?: SongDirection): LyricStageProps['source'] {
  return {
    kind: 'synced',
    lines: toLines(texts),
    direction: songDirection ?? directSongByRules(texts, 's'),
    scheduled: { index, startedAtMs: 0, isEmpty: (texts[index] ?? '').trim() === '' },
    track: null,
  };
}

const TEXTS = ['夜の底で', '走れ！'];
const direction = directSongByRules(TEXTS, 's');
const beat: BeatState = {
  bpm: 120,
  confidence: 0.9,
  phase: 0,
  pulse: 0,
  bar: 2,
  nextBeatAtMs: null,
  energy: 0.3,
  silence: false,
};

type Node = { type: unknown; props: Record<string, any>; queryAll: (p: (n: Node) => boolean) => Node[] };
const textsIn = (node: Node) => node.queryAll((n) => n.type === 'skText');

afterEach(() => jest.restoreAllMocks());

test('renders the stage and the texture background in idle', async () => {
  const { getByTestId, getAllByTestId } = await renderStage({
    source: { kind: 'idle', direction: null, track: null },
    beat,
    nowMonotonicMs: 0,
  });
  expect(getByTestId('lyric-stage')).toBeTruthy();
  expect(getByTestId('texture-background')).toBeTruthy();
  expect(getAllByTestId(/^glyph-/).length).toBeGreaterThanOrEqual(5);
});

test('renders one glyph per non-space character of the active synced line', async () => {
  const { getAllByTestId } = await renderStage({
    source: {
      kind: 'synced',
      lines: toLines(TEXTS),
      direction,
      scheduled: { index: 0, startedAtMs: 0, isEmpty: false },
      track: null,
    },
    beat,
    nowMonotonicMs: 100,
  });
  expect(getAllByTestId(/^glyph-/)).toHaveLength(4);
});

test('lays out the trimmed line text so emphasis indices line up, skipping spaces', async () => {
  const { getAllByTestId } = await renderStage({
    source: synced(['  夜の 底で  '], 0),
    beat,
    nowMonotonicMs: 100,
  });
  expect(getAllByTestId(/^glyph-/).map((g) => g.props.testID)).toEqual([
    'glyph-0',
    'glyph-1',
    'glyph-3',
    'glyph-4',
  ]);
});

test('renders idle glyphs when the scheduled line is empty', async () => {
  const source = synced(['夜の底で', ''], 1);
  const { getAllByTestId, getByTestId } = await renderStage({
    source: { ...source, track: { title: 'Song', artist: 'Band' } },
    beat,
    nowMonotonicMs: 100,
  });
  const glyphs = getAllByTestId(/^glyph-/);
  expect(glyphs.length).toBeGreaterThanOrEqual(5);
  expect(glyphs.length).toBeLessThanOrEqual(9);
  expect(getByTestId('idle-caption').props.text).toBe('Band — Song');
});

test('renders idle glyphs before any line is scheduled', async () => {
  const { getAllByTestId } = await renderStage({ source: synced(TEXTS, -1), beat, nowMonotonicMs: 100 });
  expect(getAllByTestId(/^glyph-/).length).toBeGreaterThanOrEqual(5);
});

test('recomposes idle glyphs when the bar changes', async () => {
  const idle = { kind: 'idle', direction: null, track: null } as const;
  const charsAt = async (bar: number) => {
    const { getAllByTestId, unmount } = await renderStage({
      source: idle,
      beat: { ...beat, bar },
      nowMonotonicMs: 0,
    });
    const chars = getAllByTestId(/^glyph-/).map((g) => textsIn(g as unknown as Node)[0]?.props.text);
    await unmount();
    return chars.join('');
  };
  const arrangements: string[] = [];
  for (const bar of [1, 2, 3, 4]) arrangements.push(await charsAt(bar));
  expect(arrangements[1]).toBe(await charsAt(2));
  expect(new Set(arrangements).size).toBeGreaterThan(1);
});

test('renders no glyphs but still the background while typefaces are loading', async () => {
  jest.spyOn(fonts, 'useStageTypefaces').mockReturnValue(null);
  const { getByTestId, queryAllByTestId } = await renderStage({
    source: synced(TEXTS, 0),
    beat,
    nowMonotonicMs: 100,
  });
  expect(getByTestId('lyric-stage')).toBeTruthy();
  expect(getByTestId('texture-background')).toBeTruthy();
  expect(queryAllByTestId(/^glyph-/)).toHaveLength(0);
});

test('uses the accent colour for emphasized glyphs of an accent line', async () => {
  const accented: SongDirection = {
    ...direction,
    palette: { background: '#000000', ink: '#EEEEEE', accent: '#FF0000' },
    lines: direction.lines.map((line) => ({ ...line, accent: true, emphasis: [0] })),
  };
  const { getAllByTestId } = await renderStage({
    source: synced(TEXTS, 0, accented),
    beat,
    nowMonotonicMs: 100,
  });
  const colors = getAllByTestId(/^glyph-/).map((g) => textsIn(g as unknown as Node)[0]?.props.color);
  expect(colors).toEqual(['#FF0000', '#EEEEEE', '#EEEEEE', '#EEEEEE']);
});

test('uses the ink colour for emphasized glyphs of a line without accent', async () => {
  const plain: SongDirection = {
    ...direction,
    lines: direction.lines.map((line) => ({ ...line, accent: false, emphasis: [0] })),
  };
  const { getAllByTestId } = await renderStage({
    source: synced(TEXTS, 0, plain),
    beat,
    nowMonotonicMs: 100,
  });
  const colors = getAllByTestId(/^glyph-/).map((g) => textsIn(g as unknown as Node)[0]?.props.color);
  expect(new Set(colors)).toEqual(new Set([direction.palette.ink]));
});

test('renders the previous and next lines small and faint, and hides them for an xl line', async () => {
  const texts = ['夜の底で', 'もう一度だけ走ってみる', '走れ！'];
  const threeDirection = directSongByRules(texts, 's');
  expect(threeDirection.lines[0]?.size).toBe('xl');
  expect(threeDirection.lines[1]?.size).not.toBe('xl');

  const middle = await renderStage({ source: synced(texts, 1, threeDirection), beat, nowMonotonicMs: 100 });
  const prev = middle.getByTestId('context-prev') as unknown as Node;
  const next = middle.getByTestId('context-next') as unknown as Node;
  expect(prev.props.opacity).toBe(0.35);
  expect(next.props.opacity).toBe(0.35);
  expect(textsIn(prev).map((n) => n.props.text)).toEqual([...'夜の底で']);
  expect(textsIn(next).map((n) => n.props.text)).toEqual([...'走れ！']);
  // Context lines are gothic xs: 0.045 of the 390px-wide viewport, never enlarged for emphasis.
  const sizes = [...textsIn(prev), ...textsIn(next)].map((n) => n.props.font.getSize());
  expect(new Set(sizes)).toEqual(new Set([390 * 0.045]));
  await middle.unmount();

  const first = await renderStage({ source: synced(texts, 0, threeDirection), beat, nowMonotonicMs: 100 });
  expect(first.queryByTestId('context-prev')).toBeNull();
  expect(first.queryByTestId('context-next')).toBeNull();
});

test('hides a context line whose neighbour text is empty', async () => {
  const { queryByTestId } = await renderStage({
    source: synced(['', 'もう一度だけ走ってみる', '走れ！'], 1),
    beat,
    nowMonotonicMs: 100,
  });
  expect(queryByTestId('context-prev')).toBeNull();
  expect(queryByTestId('context-next')).not.toBeNull();
});

test('draws each line ornament, and nothing for none', async () => {
  const withOrnament = (ornament: SongDirection['lines'][number]['ornament']): SongDirection => ({
    ...direction,
    lines: direction.lines.map((line) => ({ ...line, ornament })),
  });

  const numeral = await renderStage({
    source: synced(TEXTS, 0, withOrnament('numeral')),
    beat: { ...beat, bar: 123 },
    nowMonotonicMs: 100,
  });
  expect(numeral.getByTestId('ornament-numeral').props.text).toBe('23');
  await numeral.unmount();

  const grid = await renderStage({
    source: synced(TEXTS, 0, withOrnament('grid')),
    beat,
    nowMonotonicMs: 100,
  });
  expect(grid.getByTestId('ornament-grid').props.opacity).toBe(0.18);
  await grid.unmount();

  for (const ornament of ['rule', 'frame', 'circle'] as const) {
    const view = await renderStage({
      source: synced(TEXTS, 0, withOrnament(ornament)),
      beat,
      nowMonotonicMs: 100,
    });
    expect(view.getByTestId(`ornament-${ornament}`)).toBeTruthy();
    await view.unmount();
  }

  const none = await renderStage({
    source: synced(TEXTS, 0, withOrnament('none')),
    beat,
    nowMonotonicMs: 100,
  });
  expect(none.queryAllByTestId(/^ornament-/)).toHaveLength(0);
});

test('renders a still stage with reducedMotion', async () => {
  const { getAllByTestId } = await renderStage({
    source: synced(TEXTS, 0),
    beat,
    nowMonotonicMs: 100,
    reducedMotion: true,
  });
  expect(getAllByTestId(/^glyph-/)).toHaveLength(4);
});

describe('anchoredTime', () => {
  test('starts at the anchor on the frame that pins it and advances with frame time', () => {
    expect(anchoredTime(5000, 900, 900, 0)).toBe(5000);
    expect(anchoredTime(5000, 900, 916, 5000)).toBe(5016);
  });

  test('does not add a paused gap on top of a fresh anchor', () => {
    // Frames paused for 60 s; JS re-anchors to the real clock and the first frame after
    // the pause pins it, so time lands on the real clock instead of now + gap.
    const beforePause = anchoredTime(1000, 0, 100, 1000);
    expect(beforePause).toBe(1100);
    expect(anchoredTime(61_100, 60_100, 60_100, beforePause)).toBe(61_100);
    expect(anchoredTime(61_100, 60_100, 60_116, 61_100)).toBe(61_116);
  });

  test('never moves backwards when a later anchor lags the clock', () => {
    expect(anchoredTime(2000, 500, 500, 2010)).toBe(2010);
    expect(anchoredTime(2000, 500, 530, 2010)).toBe(2030);
  });
});
