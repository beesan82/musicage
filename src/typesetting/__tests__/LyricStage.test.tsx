import { act, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { interpolateColor, makeMutable } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { BeatState } from '../../beat/types';
import { directSongByRules } from '../../direction/ruleBasedDirector';
import { INK_TINT_MAX } from '../../direction/surge';
import type { SongDirection } from '../../direction/types';
import type { LyricLine } from '../../recognition/types';
import { dropDip, hexToRgb01 } from '../../textures/textureShader';
import * as fonts from '../fonts';
import { anchoredTime, LyricStage } from '../LyricStage';
import type { LyricStageProps } from '../LyricStage';
import * as motion from '../motion';
import type { BeatSharedValues } from '../useBeatSharedValues';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function inProvider(element: ReactElement) {
  return <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>;
}

const sv = (value: number) => makeMutable(value);
const beatValues: BeatSharedValues = {
  pulse: sv(0),
  phase: sv(0),
  bar: sv(2),
  confidence: sv(0.9),
  energy: sv(0.3),
  lastOnsetAtMs: sv(0),
  nextBeatAtMs: sv(0),
  periodMs: sv(0),
  low: sv(0),
  mid: sv(0),
  high: sv(0),
  surge: sv(0),
  write: () => {},
};

function renderStage(props: Omit<LyricStageProps, 'beatValues'>) {
  return render(inProvider(<LyricStage beatValues={beatValues} {...props} />));
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
  barConfidence: 0,
  nextBeatAtMs: null,
  energy: 0.3,
  silence: false,
};

type Node = { type: unknown; props: Record<string, any>; queryAll: (p: (n: Node) => boolean) => Node[] };
const textsIn = (node: Node) => node.queryAll((n) => n.type === 'skText');

// Reanimated's jest runtime hands its UI-thread work (starting and stopping
// the mappers behind useDerivedValue, the useFrameCallback loop that advances
// the stage clock) to `setTimeout(…, 0)`. On real timers that work lands
// whenever the event loop reaches it: sometimes inside the next render,
// sometimes after the assertions, so a spy on the motion could see a layer
// that had already left the stage, or a clock that had drifted by a frame.
// Fake timers keep it pending until a test flushes it on purpose.
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

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

test('emphasized glyphs of an accent line migrate to the accent colour across the line', async () => {
  const accented: SongDirection = {
    ...direction,
    palette: { background: '#000000', ink: '#EEEEEE', accent: '#FF0000' },
    lines: direction.lines.map((line) => ({ ...line, accent: true, emphasis: [0] })),
  };
  const colorAt = async (nowMonotonicMs: number) => {
    const { getAllByTestId, unmount } = await renderStage({
      source: synced(TEXTS, 0, accented),
      beat,
      nowMonotonicMs,
    });
    const colors = getAllByTestId(/^glyph-/).map(
      (g) => textsIn(g as unknown as Node)[0]?.props.color.value as string,
    );
    await unmount();
    return colors;
  };
  // 100ms into a 4000ms line the migration has barely started: not accent yet.
  const early = await colorAt(100);
  expect(early[0]).not.toBe('#FF0000');
  expect(early[0]).not.toBe('#EEEEEE');
  expect(early.slice(1)).toEqual(['#EEEEEE', '#EEEEEE', '#EEEEEE']);
  // At the line's end the emphasized glyph is fully accent.
  const late = await colorAt(4000);
  expect(late[0]).toBe(interpolateColor(1, [0, 1], ['#EEEEEE', '#FF0000']));
  expect(late.slice(1)).toEqual(['#EEEEEE', '#EEEEEE', '#EEEEEE']);
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
  const colors = getAllByTestId(/^glyph-/).map(
    (g) => textsIn(g as unknown as Node)[0]?.props.color.value,
  );
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

test('keeps the previous line as an exiting layer on a line change, then drops it', async () => {
  const dropDirection: SongDirection = {
    ...direction,
    lines: direction.lines.map((line) => ({
      ...line,
      entrance: 'drop' as const,
      hold: 'still' as const,
    })),
  };
  const stageAt = (index: number, startedAtMs: number) => (
    <LyricStage
      beatValues={beatValues}
      source={{
        kind: 'synced',
        lines: toLines(TEXTS),
        direction: dropDirection,
        scheduled: { index, startedAtMs, isEmpty: false },
        track: null,
      }}
      beat={beat}
      nowMonotonicMs={startedAtMs}
    />
  );
  const view = await render(inProvider(stageAt(0, 0)));
  expect(view.getAllByTestId(/^glyph-/)).toHaveLength(4);
  expect(view.queryAllByTestId(/^exit-glyph-/)).toHaveLength(0);

  await view.rerender(inProvider(stageAt(1, 4000)));
  // The new line ('走れ！', 3 glyphs) is current; the old line ('夜の底で',
  // 4 glyphs) is on its way out underneath.
  expect(view.getAllByTestId(/^glyph-/)).toHaveLength(3);
  expect(view.getAllByTestId(/^exit-glyph-/)).toHaveLength(4);

  // The exit of a drop line runs 320ms (+80ms of slack in the stage's timer).
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(view.queryAllByTestId(/^exit-glyph-/)).toHaveLength(0);
  expect(view.getAllByTestId(/^glyph-/)).toHaveLength(3);
});

test('draws stroke twins only for heavy lines (gothic-heavy face or bold weight)', async () => {
  const heavyDirection: SongDirection = {
    ...direction,
    lines: direction.lines.map((line) => ({
      ...line,
      font: 'gothic-heavy' as const,
      weight: 'regular' as const,
    })),
  };
  const heavy = await renderStage({
    source: synced(TEXTS, 0, heavyDirection),
    beat,
    nowMonotonicMs: 100,
  });
  expect(heavy.getAllByTestId(/^glyph-/)).toHaveLength(4);
  for (const group of heavy.getAllByTestId(/^glyph-/)) {
    expect(textsIn(group as unknown as Node)).toHaveLength(2);
  }
  await heavy.unmount();

  const plain = await renderStage({ source: synced(TEXTS, 0), beat, nowMonotonicMs: 100 });
  for (const group of plain.getAllByTestId(/^glyph-/)) {
    expect(textsIn(group as unknown as Node)).toHaveLength(1);
  }
});

test('passes the scheduler landing through to the line motion', async () => {
  const spy = jest.spyOn(motion, 'glyphTransform');
  const source: LyricStageProps['source'] = {
    kind: 'synced',
    lines: toLines(TEXTS),
    direction,
    scheduled: { index: 0, startedAtMs: 1000, isEmpty: false, landsAtMs: 1200 },
    track: null,
  };
  await renderStage({ source, beat, nowMonotonicMs: 1100 });
  const inputs = spy.mock.calls.map(([input]) => input as motion.MotionInput);
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs.some((i) => i.anticipationMs === 200 && i.elapsedMs === -100)).toBe(true);
});

describe('the recognition drop', () => {
  // Every line xl so no context lines join the glyph inputs; rise so the
  // drop override on the first line is visible.
  const dropDirection: SongDirection = {
    ...direction,
    lines: direction.lines.map((line) => ({
      ...line,
      size: 'xl' as const,
      entrance: 'rise' as const,
      hold: 'still' as const,
    })),
  };
  // A 120 BPM grid whose next head is 300 ms after the fire at 10_000.
  const gridValues: BeatSharedValues = {
    ...beatValues,
    nextBeatAtMs: sv(10_300),
    periodMs: sv(500),
    confidence: sv(0.9),
  };
  const idleSource = { kind: 'idle', direction: null, track: null } as const;
  const track = { title: '架空の歌', artist: '架空の人' };
  const syncedAt = (index: number, startedAtMs: number, dropAtMs: number | null): LyricStageProps['source'] => ({
    kind: 'synced',
    lines: toLines(TEXTS),
    direction: dropDirection,
    scheduled: { index, startedAtMs, isEmpty: index < 0 },
    track,
    dropAtMs,
  });
  const stage = (
    source: LyricStageProps['source'],
    nowMonotonicMs: number,
    extra: Partial<LyricStageProps> = {},
  ) => inProvider(<LyricStage beatValues={gridValues} source={source} beat={beat} nowMonotonicMs={nowMonotonicMs} {...extra} />);
  const inputsOf = (spy: jest.SpyInstance) =>
    spy.mock.calls.map(([input]) => input as motion.MotionInput);
  // Runs the UI-thread work queued by the renders so far, without moving the
  // stage clock: every glyph layer mounted, re-keyed or re-parameterised since
  // the last flush starts its mapper and evaluates `glyphTransform` once with
  // the clock still at the render's `nowMonotonicMs`. (The frame loop this
  // also starts only ticks on a later advance.) Flushing after each render
  // keeps a layer's evaluation out of the next render's spy.
  const flushUI = () =>
    act(async () => {
      jest.advanceTimersByTime(0);
    });
  const settle = () =>
    act(async () => {
      jest.advanceTimersByTime(1000);
    });
  const uniformsOf = (container: Node) => {
    const [shader] = container.queryAll(
      (node) => (node.props as { uniforms?: { value?: unknown } })?.uniforms?.value !== undefined,
    );
    return (shader!.props as { uniforms: { value: Record<string, number> } }).uniforms.value;
  };

  test('scatters the idle glyphs on the next beat head while the first line drops onto it', async () => {
    const spy = jest.spyOn(motion, 'glyphTransform');
    const view = await render(stage(idleSource, 10_000));
    await flushUI();
    const idleCount = view.getAllByTestId(/^glyph-/).length;
    spy.mockClear();

    await view.rerender(stage(syncedAt(0, 10_000, 10_000), 10_000));
    await flushUI();
    expect(view.getAllByTestId(/^exit-idle-glyph-/)).toHaveLength(idleCount);
    expect(view.getAllByTestId(/^glyph-/)).toHaveLength(4);
    const inputs = inputsOf(spy);
    const exits = inputs.filter((i) => i.exiting);
    const line = inputs.filter((i) => !i.exiting);
    expect(exits.length).toBeGreaterThan(0);
    expect(line.length).toBeGreaterThan(0);
    for (const i of exits) {
      expect(i.entrance).toBe('scatter');
      expect(i.elapsedMs).toBe(-300);
    }
    for (const i of line) {
      expect(i.entrance).toBe('drop');
      expect(i.anticipationMs).toBe(300);
      expect(i.elapsedMs).toBe(-300);
    }

    // 300 ms to the head, a 420 ms scatter and 80 ms of slack: then the idle exit is gone.
    await settle();
    expect(view.queryAllByTestId(/^exit-idle-glyph-/)).toHaveLength(0);
    expect(view.getAllByTestId(/^glyph-/)).toHaveLength(4);
  });

  test('fires once: a later line keeps its own entrance and no idle exit reappears', async () => {
    const spy = jest.spyOn(motion, 'glyphTransform');
    const view = await render(stage(idleSource, 10_000));
    await view.rerender(stage(syncedAt(0, 10_000, 10_000), 10_000));
    await settle();
    spy.mockClear();

    // The line layer keeps its glyph components (keyed by glyph index) across
    // the line change, so their motion is re-parameterised, not remounted:
    // the flush is what evaluates it for the new line.
    await view.rerender(stage(syncedAt(1, 14_000, 10_000), 14_000));
    await flushUI();
    expect(view.queryAllByTestId(/^exit-idle-glyph-/)).toHaveLength(0);
    const line = inputsOf(spy).filter((i) => !i.exiting);
    expect(line.length).toBeGreaterThan(0);
    for (const i of line) {
      expect(i.entrance).toBe('rise');
      expect(i.anticipationMs).toBe(0);
    }
  });

  test('when the first line is still ahead, the caption traces in and a fresh idle rises after the scatter', async () => {
    const spy = jest.spyOn(motion, 'glyphTransform');
    const view = await render(stage(idleSource, 10_000));
    await flushUI();
    const idleCount = view.getAllByTestId(/^glyph-/).length;
    spy.mockClear();

    await view.rerender(stage(syncedAt(-1, 10_000, 10_000), 10_000));
    await flushUI();
    expect(view.getAllByTestId(/^exit-idle-glyph-/)).toHaveLength(idleCount);
    expect(view.queryByTestId('idle-caption')).toBeNull();
    const captionText = view
      .getAllByTestId(/^idle-caption-glyph-/)
      .map((g) => textsIn(g as unknown as Node)[0]?.props.text)
      .join('');
    expect(captionText).toBe('架空の人—架空の歌');
    const inputs = inputsOf(spy);
    const caption = inputs.filter((i) => i.entrance === 'trace');
    expect(caption.length).toBeGreaterThan(0);
    for (const i of caption) expect(i.elapsedMs).toBe(-300);
    const rising = inputs.filter((i) => !i.exiting && i.entrance === 'rise');
    expect(rising.length).toBeGreaterThan(0);
    for (const i of rising) expect(i.elapsedMs).toBe(-(300 + 420));
  });

  test('dips the background from the fire time', async () => {
    // 100 ms after the fire (the stage clock starts at nowMonotonicMs).
    const view = await render(stage(syncedAt(0, 10_000, 10_000), 10_100));
    expect(uniformsOf(view.container as unknown as Node).iDrop).toBeCloseTo(dropDip(100), 5);
    await view.unmount();

    const none = await render(stage(syncedAt(0, 10_000, null), 10_100));
    expect(uniformsOf(none.container as unknown as Node).iDrop).toBe(0);
  });

  test('under reduced motion the drop is skipped entirely', async () => {
    const view = await render(stage(idleSource, 10_100, { reducedMotion: true }));
    await view.rerender(stage(syncedAt(-1, 10_000, 10_000), 10_100, { reducedMotion: true }));
    expect(view.queryAllByTestId(/^exit-idle-glyph-/)).toHaveLength(0);
    expect(view.queryAllByTestId(/^idle-caption-glyph-/)).toHaveLength(0);
    expect(view.getByTestId('idle-caption').props.text).toBe('架空の人 — 架空の歌');
    expect(uniformsOf(view.container as unknown as Node).iDrop).toBe(0);
  });
});

describe('the surge: beat-head glow and the palette change', () => {
  const palette = { background: '#000000', ink: '#EEEEEE', accent: '#FF0000', accentHigh: '#FFFF00' };
  // Every line accent with its first glyph emphasized, entered with cut and
  // held still so the glow's motion is identity.
  const accented: SongDirection = {
    ...direction,
    palette,
    lines: direction.lines.map((line) => ({
      ...line,
      accent: true,
      emphasis: [0],
      entrance: 'cut' as const,
      hold: 'still' as const,
    })),
  };
  const withSurge = (surge: number, lastOnsetAtMs: number, confidence = 0.9): BeatSharedValues => ({
    ...beatValues,
    surge: sv(surge),
    lastOnsetAtMs: sv(lastOnsetAtMs),
    confidence: sv(confidence),
  });
  const blurOf = (glow: Node) => glow.queryAll((n) => n.type === 'skBlurImageFilter')[0]!;
  const renderWith = (values: BeatSharedValues, nowMonotonicMs: number, extra: Partial<LyricStageProps> = {}) =>
    render(
      inProvider(
        <LyricStage
          beatValues={values}
          source={synced(TEXTS, 0, accented)}
          beat={beat}
          nowMonotonicMs={nowMonotonicMs}
          {...extra}
        />,
      ),
    );

  test('in a surge, on a beat head, only the emphasized glyph gets a blurred twin within the 10 px limit', async () => {
    // The stage clock starts at 100; the onset was at 100, so the pulse is fresh.
    const view = await renderWith(withSurge(1, 100), 100);
    expect(view.getAllByTestId(/^glyph-/)).toHaveLength(4);
    const glows = view.getAllByTestId(/^glow-/) as unknown as Node[];
    expect(glows).toHaveLength(1);
    expect(glows[0]!.props.testID).toBe('glow-0');
    expect(glows[0]!.props.opacity.value).toBeGreaterThan(0.5);
    const blur = blurOf(glows[0]!);
    expect(blur.props.blur.value).toBeGreaterThan(0);
    expect(blur.props.blur.value).toBeLessThanOrEqual(10);
    // The twin is painted in the surge accent, which at full surge is the high accent.
    const text = textsIn(glows[0]!)[0]!;
    expect(text.props.color.value).toBe(interpolateColor(1, [0, 1], ['#FF0000', '#FFFF00']));
    await view.unmount();
  });

  test('outside a surge the glow is dark even on a beat head', async () => {
    const view = await renderWith(withSurge(0, 100), 100);
    const glow = view.getAllByTestId(/^glow-/)[0] as unknown as Node;
    expect(glow.props.opacity.value).toBe(0);
    expect(blurOf(glow).props.blur.value).toBe(0);
  });

  test('the glow is a one-off decay from the beat head: a second later it is out', async () => {
    const view = await renderWith(withSurge(1, 100), 1100);
    const glow = view.getAllByTestId(/^glow-/)[0] as unknown as Node;
    expect(glow.props.opacity.value).toBeLessThan(0.01);
  });

  test('the glow is quartered while the beat is not trusted', async () => {
    const trusted = await renderWith(withSurge(1, 100, 0.9), 100);
    const full = (trusted.getAllByTestId(/^glow-/)[0] as unknown as Node).props.opacity.value as number;
    await trusted.unmount();
    const doubtful = await renderWith(withSurge(1, 100, 0.3), 100);
    const damped = (doubtful.getAllByTestId(/^glow-/)[0] as unknown as Node).props.opacity.value as number;
    expect(damped).toBeCloseTo(full / 4, 5);
  });

  test('no glow under reduced motion, and none for a line without emphasis', async () => {
    const still = await renderWith(withSurge(1, 100), 100, { reducedMotion: true });
    expect(still.queryAllByTestId(/^glow-/)).toHaveLength(0);
    await still.unmount();

    const plain: SongDirection = {
      ...accented,
      lines: accented.lines.map((line) => ({ ...line, emphasis: [] })),
    };
    const none = await render(
      inProvider(
        <LyricStage
          beatValues={withSurge(1, 100)}
          source={synced(TEXTS, 0, plain)}
          beat={beat}
          nowMonotonicMs={100}
        />,
      ),
    );
    expect(none.queryAllByTestId(/^glow-/)).toHaveLength(0);
    expect(none.getAllByTestId(/^glyph-/)).toHaveLength(4);
  });

  test('the ink and accent of the glyphs move with the surge; the background uniform does not', async () => {
    const view = await renderWith(withSurge(1, 0), 100);
    const colors = view
      .getAllByTestId(/^glyph-/)
      .map((g) => textsIn(g as unknown as Node)[0]!.props.color.value as string);
    // The line ends at 4000 ms, so the emphasized glyph is mid-migration
    // (neither colour exactly); the plain glyphs show the surge ink.
    const inkHigh = interpolateColor(INK_TINT_MAX, [0, 1], ['#EEEEEE', '#FFFF00']);
    expect(colors.slice(1)).toEqual([inkHigh, inkHigh, inkHigh]);
    expect(colors[0]).not.toBe('#EEEEEE');
    const [shader] = (view.container as unknown as Node).queryAll(
      (node) => (node.props as { uniforms?: { value?: unknown } })?.uniforms?.value !== undefined,
    );
    const uniforms = (shader!.props as { uniforms: { value: Record<string, number[]> } }).uniforms.value;
    expect(uniforms.iBackground).toEqual(hexToRgb01('#000000'));
    expect(uniforms.iAccent!.map((v) => +v.toFixed(3))).toEqual([1, 1, 0]);
  });
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
