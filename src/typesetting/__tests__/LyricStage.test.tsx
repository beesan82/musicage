import { act, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { interpolateColor, makeMutable } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { BeatState } from '../../beat/types';
import { lightHexFor, rgbaOf } from '../../direction/palettes';
import { directSongByRules } from '../../direction/ruleBasedDirector';
import { INK_TINT_MAX } from '../../direction/surge';
import { DEFAULT_IDLE_GLYPHS } from '../../direction/types';
import type { SongDirection } from '../../direction/types';
import { unsyncedNote } from '../../recognition/recognitionCopy';
import type { LyricLine, UnsyncedKind } from '../../recognition/types';
import { IDLE_FOCUS } from '../../textures/surfaceModel';
import * as textureBackground from '../../textures/TextureBackground';
import { dropDip, hexToRgb01 } from '../../textures/textureShader';
import { METER_BASE_HEIGHT, METER_RULE_COUNT, METER_RULE_WIDTH } from '../bandMeter';
import * as fonts from '../fonts';
import { composeIdle } from '../idleComposition';
import { layoutLine, printArea, SIZE_RATIO } from '../layout';
import { anchoredTime, LyricStage } from '../LyricStage';
import type { LyricStageProps } from '../LyricStage';
import * as motion from '../motion';
import { lineArea } from '../Ornaments';
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
  silence: sv(0),
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

// The stage's own layout of a line: in the print area less the room of the
// line's ornament (visual overhaul spec §3d). The jest Font makes every glyph
// sizePx wide, ascent −0.88, descent 0.12; the caption row is gothic xs and the
// numeral gothic s.
const STAGE_VIEWPORT = { width: 390, height: 844, insetTop: 47, insetBottom: 34 };
const jestMeasure = (_char: string, sizePx: number) => ({ advance: sizePx, ascent: -sizePx * 0.88, descent: sizePx * 0.12 });
const STAGE_AREA = printArea(STAGE_VIEWPORT, -390 * 0.045 * 0.88);
const NUMERAL_METRICS = { ascent: -390 * 0.06 * 0.88, descent: 390 * 0.06 * 0.12 };
const stageLayout = (text: string, line: SongDirection['lines'][number]) =>
  layoutLine(text, line, STAGE_VIEWPORT, jestMeasure, lineArea(STAGE_AREA, line, NUMERAL_METRICS));

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

describe("the lamp's focus (focusTarget)", () => {
  const VIEWPORT = STAGE_VIEWPORT;
  const centreOf = (index: number) => {
    const { bounds } = stageLayout(TEXTS[index]!, direction.lines[index]!);
    return { x: (bounds.x + bounds.width / 2) / VIEWPORT.width, y: (bounds.y + bounds.height / 2) / VIEWPORT.height };
  };
  const focusOf = (spy: jest.SpyInstance) => {
    const props = spy.mock.calls.at(-1)![0] as { focus?: { value: { x: number; y: number } } };
    return props.focus!.value;
  };
  const at = (index: number) => (
    <LyricStage beatValues={beatValues} source={synced(TEXTS, index)} beat={beat} nowMonotonicMs={100} />
  );

  test('the background gets the line on stage’s bounds centre, in uv, and follows a line change', async () => {
    const spy = jest.spyOn(textureBackground, 'TextureBackground');
    const view = await render(inProvider(at(0)));
    const first = focusOf(spy);
    expect(first.x).toBeCloseTo(centreOf(0).x, 5);
    expect(first.y).toBeCloseTo(centreOf(0).y, 5);

    await view.rerender(inProvider(at(1)));
    const second = focusOf(spy);
    expect(second.x).toBeCloseTo(centreOf(1).x, 5);
    expect(second.y).toBeCloseTo(centreOf(1).y, 5);
  });

  test("in idle the focus is the centre of the epoch's accent anchor (spec §3e)", async () => {
    const spy = jest.spyOn(textureBackground, 'TextureBackground');
    await renderStage({ source: { kind: 'idle', direction: null, track: null }, beat, nowMonotonicMs: 0 });
    // beat.bar 2: epoch 0, bar 2 of it. The jest font: advance sizePx, ascent −0.88, descent 0.12.
    const { glyphs } = composeIdle(0, 2, DEFAULT_IDLE_GLYPHS, VIEWPORT, null, jestMeasure);
    const anchor = glyphs.find((g) => g.face === 'primary' && g.accent === true)!;
    const focus = focusOf(spy);
    expect(focus.x).toBeCloseTo((anchor.x + anchor.sizePx / 2) / VIEWPORT.width, 5);
    expect(focus.y).toBeCloseTo((anchor.y - anchor.sizePx * 0.38) / VIEWPORT.height, 5);
    expect(focus).not.toEqual(IDLE_FOCUS);
  });

  test('the lamp moves to the next accent anchor when the epoch changes', async () => {
    const spy = jest.spyOn(textureBackground, 'TextureBackground');
    const idleAt = (bar: number) => (
      <LyricStage
        beatValues={beatValues}
        source={{ kind: 'idle', direction: null, track: null }}
        beat={{ ...beat, bar }}
        nowMonotonicMs={0}
      />
    );
    const view = await render(inProvider(idleAt(2)));
    const seen = [focusOf(spy)];
    for (const bar of [10, 18, 26, 34]) {
      await view.rerender(inProvider(idleAt(bar)));
      seen.push(focusOf(spy));
    }
    expect(new Set(seen.map((f) => `${f.x.toFixed(4)},${f.y.toFixed(4)}`)).size).toBeGreaterThan(1);
  });

  test('without typefaces (no anchor yet) the focus rests a little above the centre', async () => {
    jest.spyOn(fonts, 'useStageTypefaces').mockReturnValue(null);
    const spy = jest.spyOn(textureBackground, 'TextureBackground');
    await renderStage({ source: { kind: 'idle', direction: null, track: null }, beat, nowMonotonicMs: 0 });
    expect(focusOf(spy)).toEqual(IDLE_FOCUS);
  });

  test('the focus is written only when it moves, not on every render', async () => {
    const spy = jest.spyOn(textureBackground, 'TextureBackground');
    const view = await render(inProvider(at(0)));
    const written = focusOf(spy);
    // A new beat re-renders the stage; the line, and so the focus, stay.
    await view.rerender(
      inProvider(
        <LyricStage
          beatValues={beatValues}
          source={synced(TEXTS, 0)}
          beat={{ ...beat, pulse: 0.8 }}
          nowMonotonicMs={100}
        />,
      ),
    );
    expect(focusOf(spy)).toBe(written);
  });

  test('the stage hands the silence flag to the background', async () => {
    const spy = jest.spyOn(textureBackground, 'TextureBackground');
    await renderStage({ source: synced(TEXTS, 0), beat, nowMonotonicMs: 100 });
    expect((spy.mock.calls.at(-1)![0] as { silence?: unknown }).silence).toBe(beatValues.silence);
  });
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
  expect(prev.props.opacity).toBe(0.5);
  expect(next.props.opacity).toBe(0.5);
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

describe('context lines beside the line on stage (visual overhaul spec §3c.3)', () => {
  const XS = 390 * 0.045;
  const AREA = STAGE_AREA;
  // Fictional lines; the middle one is on stage.
  const texts = ['遠い灯の下で', '窓のむこうに朝を数えている', '名前のない歌'];
  const withLines = (overrides: Partial<SongDirection['lines'][number]>): SongDirection => {
    const base = directSongByRules(texts, 's');
    return { ...base, lines: base.lines.map((line) => ({ ...line, size: 'm' as const, emphasis: [], ...overrides })) };
  };
  const boxOf = (node: Node) => {
    const glyphs = textsIn(node).map((n) => ({ x: n.props.x as number, y: n.props.y as number }));
    return {
      left: Math.min(...glyphs.map((g) => g.x)),
      right: Math.max(...glyphs.map((g) => g.x + XS)),
      top: Math.min(...glyphs.map((g) => g.y - XS * 0.88)),
      bottom: Math.max(...glyphs.map((g) => g.y + XS * 0.12)),
    };
  };
  const ruleOf = (view: Awaited<ReturnType<typeof renderStage>>, side: 'prev' | 'next') =>
    view.getByTestId(`context-${side}-rule`).props as { x: number; y: number; width: number; height: number };

  test('beside a horizontal line: prev right-aligned 28px above it, next left-aligned 28px below it', async () => {
    const songDirection = withLines({ orientation: 'horizontal' });
    const { bounds } = stageLayout(texts[1]!, songDirection.lines[1]!);
    const view = await renderStage({ source: synced(texts, 1, songDirection), beat, nowMonotonicMs: 100 });
    const prev = boxOf(view.getByTestId('context-prev') as unknown as Node);
    const next = boxOf(view.getByTestId('context-next') as unknown as Node);
    expect(prev.bottom).toBeCloseTo(bounds.y - 28, 5);
    expect(next.top).toBeCloseTo(bounds.y + bounds.height + 28, 5);
    // prev ends, rule included, at the line's right edge; next starts, rule included, at its left edge.
    const prevRule = ruleOf(view, 'prev');
    expect(prevRule.x + prevRule.width).toBeCloseTo(bounds.x + bounds.width, 5);
    expect(prevRule.x).toBeGreaterThan(prev.right);
    const nextRule = ruleOf(view, 'next');
    expect(nextRule.x).toBeCloseTo(bounds.x, 5);
    expect(nextRule.x + nextRule.width).toBeLessThan(next.left);
  });

  test('beside a vertical column block: prev to its upper right, next to its lower left', async () => {
    const songDirection = withLines({ orientation: 'vertical' });
    const { bounds } = stageLayout(texts[1]!, songDirection.lines[1]!);
    const view = await renderStage({ source: synced(texts, 1, songDirection), beat, nowMonotonicMs: 100 });
    const prev = boxOf(view.getByTestId('context-prev') as unknown as Node);
    const next = boxOf(view.getByTestId('context-next') as unknown as Node);
    expect(prev.left).toBeGreaterThanOrEqual(bounds.x + bounds.width + 28 - 1e-6);
    expect(prev.top).toBeLessThan(bounds.y + bounds.height / 2);
    expect(next.right).toBeLessThanOrEqual(bounds.x - 28 + 1e-6);
    expect(next.bottom).toBeGreaterThan(bounds.y + bounds.height / 2);
  });

  test('context lines stay inside the print area, never behind the controls (the old bottom-right defect)', async () => {
    // A long vertical line reaches the foot of the stage; its next line is
    // pulled up above the caption row and the controls.
    const long = ['遠い灯の下で', '窓のむこうに朝を数えているまだ名前のない歌をひとつ', '名前のない歌'];
    const base = directSongByRules(long, 's');
    const songDirection: SongDirection = {
      ...base,
      lines: base.lines.map((line) => ({
        ...line,
        size: 'm' as const,
        emphasis: [],
        orientation: 'vertical' as const,
      })),
    };
    const view = await renderStage({ source: synced(long, 1, songDirection), beat, nowMonotonicMs: 100 });
    for (const side of ['prev', 'next'] as const) {
      const box = boxOf(view.getByTestId(`context-${side}`) as unknown as Node);
      expect(box.top).toBeGreaterThanOrEqual(AREA.top - 1e-6);
      expect(box.bottom).toBeLessThanOrEqual(AREA.bottom + 1e-6);
      expect(box.left).toBeGreaterThanOrEqual(AREA.left - 1e-6);
      expect(box.right).toBeLessThanOrEqual(AREA.right + 1e-6);
    }
  });

  test('a context line is the ink leaned toward the lamp, flat, with a 10×2 accent rule', async () => {
    const songDirection = withLines({ orientation: 'horizontal' });
    const view = await renderStage({ source: synced(texts, 1, songDirection), beat, nowMonotonicMs: 100 });
    const prev = view.getByTestId('context-prev') as unknown as Node;
    const light = lightHexFor(songDirection.palette);
    for (const text of textsIn(prev)) {
      expect(text.props.color.value).toBe(interpolateColor(0.3, [0, 1], [songDirection.palette.ink, light]));
      expect(text.queryAll((n) => n.type === 'skLinearGradient')).toHaveLength(0);
    }
    const rule = view.getByTestId('context-prev-rule').props;
    expect(rule.width).toBe(10);
    expect(rule.height).toBe(2);
    expect(rule.color.value).toBe(songDirection.palette.accent);
  });
});

describe('the grounding shadow and the ink body (visual overhaul spec §3c.1, §3c.2)', () => {
  const texts = ['遠い灯の下で', '窓のむこうに朝を数えている', '名前のない歌'];
  const shadowsIn = (node: Node) => node.queryAll((n) => n.type === 'skDropShadowImageFilter');

  test('one shadow for the whole line on stage, in the background at 0.6, and none on context lines', async () => {
    const base = directSongByRules(texts, 's');
    const songDirection: SongDirection = {
      ...base,
      lines: base.lines.map((line) => ({ ...line, size: 'm' as const })),
    };
    const view = await renderStage({ source: synced(texts, 1, songDirection), beat, nowMonotonicMs: 100 });
    const shadows = shadowsIn(view.container as unknown as Node);
    expect(shadows).toHaveLength(1);
    expect(shadows[0]!.props).toMatchObject({ dx: 0, dy: 2, blur: 3 });
    expect(shadows[0]!.props.color).toBe(rgbaOf(songDirection.palette.background, 0.6));
    const shadowed = view.getByTestId('line-shadow') as unknown as Node;
    const lineGlyphs = view.getAllByTestId(/^glyph-/) as unknown as Node[];
    expect(shadowed.queryAll((n) => /^glyph-/.test(n.props.testID ?? ''))).toHaveLength(lineGlyphs.length);
    expect(shadowed.queryAll((n) => /^context-/.test(n.props.testID ?? ''))).toHaveLength(0);
    expect(view.getByTestId('context-prev')).toBeTruthy();
  });

  test('idle: one shadow over all the idle glyphs, not over the caption or its rule (spec §3e)', async () => {
    const view = await renderStage({
      source: { kind: 'idle', direction: null, track: { title: '架空の歌', artist: '架空の人' } },
      beat,
      nowMonotonicMs: 0,
    });
    const shadows = shadowsIn(view.container as unknown as Node);
    expect(shadows).toHaveLength(1);
    expect(shadows[0]!.props).toMatchObject({ dx: 0, dy: 2, blur: 3 });
    const shadowed = view.getByTestId('idle-shadow') as unknown as Node;
    const idleGlyphs = view.getAllByTestId(/^glyph-/) as unknown as Node[];
    expect(idleGlyphs.length).toBeGreaterThanOrEqual(5);
    expect(shadowed.queryAll((n) => /^glyph-/.test(n.props.testID ?? ''))).toHaveLength(idleGlyphs.length);
    expect(shadowed.queryAll((n) => /^idle-caption/.test(n.props.testID ?? ''))).toHaveLength(0);
    expect(view.getByTestId('idle-caption')).toBeTruthy();
  });

  test('the line on stage is filled with the shared ink body, one draw per glyph', async () => {
    const songDirection = directSongByRules(texts, 's');
    const plain: SongDirection = {
      ...songDirection,
      lines: songDirection.lines.map((line) => ({ ...line, emphasis: [], accent: false })),
    };
    const view = await renderStage({ source: synced(texts, 1, plain), beat, nowMonotonicMs: 100 });
    const { palette } = plain;
    const expected = [
      interpolateColor(0.12, [0, 1], [palette.ink, lightHexFor(palette)]),
      interpolateColor(0.1, [0, 1], [palette.ink, palette.background]),
    ];
    for (const group of view.getAllByTestId(/^glyph-/) as unknown as Node[]) {
      const draws = textsIn(group);
      expect(draws.filter((t) => t.props.style !== 'stroke')).toHaveLength(1);
      for (const text of draws) {
        const gradients = text.queryAll((n) => n.type === 'skLinearGradient');
        expect(gradients).toHaveLength(1);
        expect(gradients[0]!.props.colors.value).toEqual(expected);
      }
    }
  });
});

describe('ornaments are printed marks, and everything keeps to the print area (visual overhaul spec §3d)', () => {
  // Fictional lines; the middle one is on stage.
  const texts = ['遠い灯の下で', '窓のむこうに朝を数えている', '名前のない歌'];
  type LineDirection = SongDirection['lines'][number];
  const withLines = (overrides: Partial<LineDirection>, lineTexts: string[] = texts): SongDirection => {
    const base = directSongByRules(lineTexts, 's');
    return {
      ...base,
      lines: base.lines.map((line) => ({ ...line, size: 'm' as const, emphasis: [], accent: false, ...overrides })),
    };
  };
  const stageWith = (songDirection: SongDirection, lineTexts: string[] = texts, bar = beat.bar) =>
    renderStage({ source: synced(lineTexts, 1, songDirection), beat: { ...beat, bar }, nowMonotonicMs: 100 });
  const props = (view: Awaited<ReturnType<typeof renderStage>>, id: string) =>
    view.getByTestId(id).props as Record<string, any>;

  test('rule: 3px, 12px past each end, ink at 0.7 or the accent on an accent line', async () => {
    const songDirection = withLines({ orientation: 'horizontal', ornament: 'rule' });
    const { palette } = songDirection;
    const { bounds } = stageLayout(texts[1]!, songDirection.lines[1]!);
    const view = await stageWith(songDirection);
    const rule = props(view, 'ornament-rule');
    expect(rule.strokeWidth).toBe(3);
    expect(rule.p1).toEqual({ x: bounds.x - 12, y: bounds.y + bounds.height + 8 });
    expect(rule.p2).toEqual({ x: bounds.x + bounds.width + 12, y: bounds.y + bounds.height + 8 });
    expect(rule.color.value).toBe(palette.ink);
    expect(rule.opacity).toBe(0.7);
    await view.unmount();

    const accented = await stageWith(withLines({ orientation: 'horizontal', ornament: 'rule', accent: true }));
    const accentRule = props(accented, 'ornament-rule');
    expect(accentRule.color.value).toBe(palette.accent);
    expect(accentRule.opacity).toBe(1);
  });

  test('frame: ink at 0.6, 1.5px 8px outside the line, and a 0.5px hairline 4px further out', async () => {
    const songDirection = withLines({ orientation: 'horizontal', ornament: 'frame' });
    const { bounds } = stageLayout(texts[1]!, songDirection.lines[1]!);
    const view = await stageWith(songDirection);
    expect(props(view, 'ornament-frame').opacity).toBe(0.6);
    const around = (gap: number) => ({
      x: bounds.x - gap,
      y: bounds.y - gap,
      width: bounds.width + 2 * gap,
      height: bounds.height + 2 * gap,
    });
    const inner = props(view, 'ornament-frame-inner');
    const outer = props(view, 'ornament-frame-outer');
    expect(inner).toMatchObject({ ...around(8), strokeWidth: 1.5, style: 'stroke' });
    expect(outer).toMatchObject({ ...around(12), strokeWidth: 0.5, style: 'stroke' });
    expect(inner.color.value).toBe(songDirection.palette.ink);
    expect(outer.color.value).toBe(songDirection.palette.ink);
  });

  test('circle: the accent at 0.7, 1.5px, radius 0.6 of the line height', async () => {
    const songDirection = withLines({ orientation: 'horizontal', ornament: 'circle' });
    const { bounds } = stageLayout(texts[1]!, songDirection.lines[1]!);
    const view = await stageWith(songDirection);
    const circle = props(view, 'ornament-circle');
    expect(circle.r).toBeCloseTo(bounds.height * 0.6, 5);
    expect(circle.strokeWidth).toBe(1.5);
    expect(circle.opacity).toBe(0.7);
    expect(circle.color.value).toBe(songDirection.palette.accent);
  });

  test('grid: 1px ink lines at 0.10 over the print area', async () => {
    const view = await stageWith(withLines({ orientation: 'horizontal', ornament: 'grid' }));
    const grid = view.getByTestId('ornament-grid') as unknown as Node;
    expect(grid.props.opacity).toBe(0.1);
    const lines = grid.queryAll((n) => n.props.p1 !== undefined);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.props.strokeWidth).toBe(1);
  });

  test('numeral: gothic s in the accent at the top right of the print area, a 24×2 ink rule under it', async () => {
    const songDirection = withLines({ orientation: 'horizontal', ornament: 'numeral' });
    const view = await stageWith(songDirection, texts, 123);
    const numeral = props(view, 'ornament-numeral');
    const S = 390 * 0.06;
    expect(numeral.text).toBe('23');
    expect(numeral.font.getSize()).toBeCloseTo(S);
    expect(numeral.color.value).toBe(songDirection.palette.accent);
    expect(numeral.x + 2 * S).toBeCloseTo(STAGE_AREA.right, 5);
    expect(numeral.y - S * 0.88).toBeCloseTo(STAGE_AREA.top, 5);
    const rule = props(view, 'ornament-numeral-rule');
    expect(rule).toMatchObject({ width: 24, height: 2 });
    expect(rule.x + rule.width).toBeCloseTo(STAGE_AREA.right, 5);
    expect(rule.y).toBeGreaterThan(numeral.y);
    expect(rule.color.value).toBe(songDirection.palette.ink);
  });

  test('none draws nothing', async () => {
    const view = await stageWith(withLines({ ornament: 'none' }));
    expect(view.queryAllByTestId(/^ornament-/)).toHaveLength(0);
  });

  test('the line, its context lines and its ornament stay inside the print area, for every ornament', async () => {
    // A long middle line fills the area (two columns, or two rows a size down).
    const long = ['遠い灯の下で', '窓のむこうに朝を数えているまだ名前のない歌をひとつ', '名前のない歌'];
    type Box = { left: number; top: number; right: number; bottom: number };
    // The jest Font: each character sizePx wide, ascent −0.88, descent 0.12.
    const textBox = (p: Record<string, any>): Box => {
      const size = p.font.getSize() as number;
      const width = size * [...(p.text as string)].length;
      return { left: p.x, top: p.y - size * 0.88, right: p.x + width, bottom: p.y + size * 0.12 };
    };
    const glyphBoxes = (node: Node): Box[] => textsIn(node).map((n) => textBox(n.props));
    const strokeBox = (p: Record<string, any>): Box => {
      const half = (p.strokeWidth ?? 0) / 2;
      if (p.p1 !== undefined) {
        // A line's butt ends stop at its points; its width runs across it.
        const flat = p.p1.y === p.p2.y;
        return {
          left: Math.min(p.p1.x, p.p2.x) - (flat ? 0 : half),
          right: Math.max(p.p1.x, p.p2.x) + (flat ? 0 : half),
          top: Math.min(p.p1.y, p.p2.y) - (flat ? half : 0),
          bottom: Math.max(p.p1.y, p.p2.y) + (flat ? half : 0),
        };
      }
      if (p.r !== undefined) {
        return { left: p.cx - p.r - half, right: p.cx + p.r + half, top: p.cy - p.r - half, bottom: p.cy + p.r + half };
      }
      if (p.text !== undefined) return textBox(p);
      const pad = p.style === 'stroke' ? half : 0;
      return { left: p.x - pad, top: p.y - pad, right: p.x + p.width + pad, bottom: p.y + p.height + pad };
    };
    const expectInside = (box: Box, label: string) => {
      const inside =
        box.left >= STAGE_AREA.left - 1e-6 &&
        box.right <= STAGE_AREA.right + 1e-6 &&
        box.top >= STAGE_AREA.top - 1e-6 &&
        box.bottom <= STAGE_AREA.bottom + 1e-6;
      expect({ label, box, inside }).toEqual({ label, box, inside: true });
    };

    for (const orientation of ['horizontal', 'vertical'] as const) {
      for (const ornament of ['rule', 'frame', 'circle', 'grid', 'numeral', 'none'] as const) {
        const label = `${orientation} ${ornament}`;
        const view = await stageWith(withLines({ orientation, ornament }, long), long, 99);
        const lineGlyphs = (view.getAllByTestId(/^glyph-/) as unknown as Node[]).flatMap(glyphBoxes);
        expect(lineGlyphs.length).toBeGreaterThan(0);
        for (const box of lineGlyphs) expectInside(box, `${label}: line`);
        for (const side of ['prev', 'next'] as const) {
          for (const box of glyphBoxes(view.getByTestId(`context-${side}`) as unknown as Node)) {
            expectInside(box, `${label}: context-${side}`);
          }
          expectInside(strokeBox(props(view, `context-${side}-rule`)), `${label}: context-${side}-rule`);
        }
        const marks = (view.queryAllByTestId(/^ornament-/) as unknown as Node[]).flatMap((node) =>
          node.props.testID === 'ornament-frame' || node.props.testID === 'ornament-grid'
            ? node.queryAll((n) => n !== node && (n.props.p1 !== undefined || n.props.width !== undefined))
            : [node],
        );
        if (ornament !== 'none') expect(marks.length).toBeGreaterThan(0);
        for (const mark of marks) expectInside(strokeBox(mark.props), `${label}: ${mark.props.testID ?? 'grid line'}`);
        await view.unmount();
      }
    }
  });

  test('idle glyphs share the same print area', async () => {
    const view = await renderStage({ source: { kind: 'idle', direction: null, track: null }, beat, nowMonotonicMs: 0 });
    const glyphs = view.getAllByTestId(/^glyph-/) as unknown as Node[];
    expect(glyphs.length).toBeGreaterThan(0);
    for (const node of glyphs) {
      for (const text of textsIn(node)) {
        const size = text.props.font.getSize() as number;
        expect(text.props.y - size * 0.88).toBeGreaterThanOrEqual(STAGE_AREA.top - 1e-6);
        expect(text.props.y + size * 0.12).toBeLessThanOrEqual(STAGE_AREA.bottom + 1e-6);
        expect(text.props.x).toBeGreaterThanOrEqual(STAGE_AREA.left - 1e-6);
        expect(text.props.x + size).toBeLessThanOrEqual(STAGE_AREA.right + 1e-6);
      }
    }
  });
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

describe('the idle print: faces, accent and the caption rule (visual overhaul spec §3e)', () => {
  const XL = 390 * SIZE_RATIO.xl;
  const XS = 390 * SIZE_RATIO.xs;
  const track = { title: '架空の歌', artist: '架空の人' };

  // Typefaces tagged by face and file, and fonts that carry the tag, so a
  // drawn Text tells which face and weight set it.
  function tagFonts() {
    const keys = Object.keys(fonts.FONT_SOURCES) as fonts.FontKey[];
    jest.spyOn(fonts, 'useStageTypefaces').mockReturnValue(
      Object.fromEntries(
        keys.map((key) => [
          key,
          { regular: { key, file: 'regular' }, bold: { key, file: key === 'gothic' ? 'bold' : 'regular' } },
        ]),
      ) as never,
    );
    jest.spyOn(fonts, 'createStageFont').mockImplementation(((typeface: { key: string; file: string }, size: number) => ({
      measureText: (t: string) => ({ width: size * [...t].length, height: size }),
      getMetrics: () => ({ ascent: -size * 0.88, descent: size * 0.12 }),
      getSize: () => size,
      face: `${typeface.key}:${typeface.file}`,
    })) as never);
  }
  const songWith = (faces: fonts.FontKey[]): SongDirection => ({
    ...direction,
    lines: faces.map((font) => ({ ...direction.lines[0]!, font })),
  });
  async function facesOnStage(songDirection: SongDirection | null) {
    tagFonts();
    const view = await renderStage({ source: { kind: 'idle', direction: songDirection, track }, beat, nowMonotonicMs: 0 });
    const glyphTexts = (view.getAllByTestId(/^glyph-/) as unknown as Node[]).flatMap(textsIn);
    const anchors = glyphTexts.filter((t) => t.props.font.getSize() === XL).map((t) => t.props.font.face as string);
    const rest = glyphTexts.filter((t) => t.props.font.getSize() !== XL).map((t) => t.props.font.face as string);
    const caption = view.getByTestId('idle-caption').props.font.face as string;
    const all = textsIn(view.container as unknown as Node).map((t) => t.props.font.face as string);
    return { anchors: new Set(anchors), rest: new Set([...rest, caption]), all: new Set(all), view };
  }

  test('before a song is recognised: anchors in mincho-old, the rest and the caption in gothic', async () => {
    const { anchors, rest, all } = await facesOnStage(null);
    expect(anchors).toEqual(new Set(['mincho-old:regular']));
    expect(rest).toEqual(new Set(['gothic:regular']));
    expect(all.size).toBe(2);
  });

  test("a recognised song: anchors in its most used face, the rest in its other face", async () => {
    const { anchors, rest, all } = await facesOnStage(songWith(['brush', 'gothic-round', 'brush']));
    expect(anchors).toEqual(new Set(['brush:regular']));
    expect(rest).toEqual(new Set(['gothic-round:regular']));
    expect(all.size).toBe(2);
  });

  test('a gothic primary sets the anchors bold, the rest regular', async () => {
    const { anchors, rest, all } = await facesOnStage(songWith(['gothic', 'mincho', 'gothic']));
    expect(anchors).toEqual(new Set(['gothic:bold']));
    expect(rest).toEqual(new Set(['mincho:regular']));
    expect(all.size).toBe(2);
  });

  test('one anchor is in the accent, and so is the swapped glyph; the rest in the ink', async () => {
    const view = await renderStage({ source: { kind: 'idle', direction: null, track }, beat, nowMonotonicMs: 0 });
    const accentNow = view.getByTestId('idle-caption-rule').props.color.value as string;
    const fills = (view.getAllByTestId(/^glyph-/) as unknown as Node[]).map((g) => ({
      testID: g.props.testID as string,
      fill: textsIn(g).find((t) => t.props.style !== 'stroke')!,
    }));
    const accents = fills.filter(({ fill }) => fill.props.color.value === accentNow);
    // beat.bar 2: two swaps into the epoch, so one swapped glyph (index ≥ 1000).
    const swapped = fills.filter(({ testID }) => Number(testID.replace('glyph-', '')) >= 1000);
    expect(swapped).toHaveLength(1);
    expect(accents.map(({ testID }) => testID)).toContain(swapped[0]!.testID);
    expect(accents.filter(({ fill }) => fill.props.font.getSize() === XL).length).toBeGreaterThanOrEqual(1);
    expect(accents.length).toBeLessThanOrEqual(2);
    expect(fills.length - accents.length).toBeGreaterThanOrEqual(3);
  });

  test('the caption: secondary face xs at 0.6, under a 12×2 accent rule, where it was', async () => {
    const view = await renderStage({ source: { kind: 'idle', direction: null, track }, beat, nowMonotonicMs: 0 });
    const caption = view.getByTestId('idle-caption');
    expect(caption.props).toMatchObject({ x: 24, y: STAGE_AREA.captionBaseline, opacity: 0.6 });
    expect(caption.props.font.getSize()).toBe(XS);
    const rule = view.getByTestId('idle-caption-rule');
    expect(rule.props).toMatchObject({ x: 24, width: 12, height: 2 });
    // The rule's foot sits 6px above the caption's top (its ascent above the baseline).
    expect(rule.props.y + 2).toBeCloseTo(STAGE_AREA.captionBaseline - XS * 0.88 - 6, 6);
    // Inside the margin between the glyph rows and the caption.
    expect(rule.props.y).toBeGreaterThanOrEqual(STAGE_AREA.bottom);
  });

  test('no caption rule without a track', async () => {
    const view = await renderStage({ source: { kind: 'idle', direction: null, track: null }, beat, nowMonotonicMs: 0 });
    expect(view.queryByTestId('idle-caption-rule')).toBeNull();
  });
});

describe('a recognised song without synced lyrics: the nameplate', () => {
  const track = { title: '架空の歌', artist: '架空の人' };
  // A song without lines: the rules still give it a palette from the seed.
  const songDirection = directSongByRules([], 'u');
  const { palette } = songDirection;
  const XL = 390 * SIZE_RATIO.xl;
  const XS = 390 * SIZE_RATIO.xs;
  const unsynced = (
    reason: UnsyncedKind = 'lyrics_unavailable',
    dropAtMs: number | null = null,
  ): LyricStageProps['source'] => ({ kind: 'unsynced', track, direction: songDirection, reason, dropAtMs });
  type Box = { x: number; y: number; width: number; height: number };
  const rectOf = (node: { props: Record<string, any> }) => node.props.rect.value as Box;
  const textBox = (p: Record<string, any>) => {
    const size = p.font.getSize() as number;
    return { left: p.x as number, top: p.y - size * 0.88, right: p.x + size, bottom: p.y + size * 0.12 };
  };
  const expectInside = (box: { left: number; top: number; right: number; bottom: number }) => {
    expect(box.left).toBeGreaterThanOrEqual(STAGE_AREA.left - 1e-6);
    expect(box.right).toBeLessThanOrEqual(STAGE_AREA.right + 1e-6);
    expect(box.top).toBeGreaterThanOrEqual(STAGE_AREA.top - 1e-6);
    expect(box.bottom).toBeLessThanOrEqual(STAGE_AREA.bottom + 1e-6);
  };

  test('prints the title as the line on stage under the grounding shadow, the artist small beside it, and no idle print', async () => {
    const view = await renderStage({ source: unsynced(), beat, nowMonotonicMs: 100 });
    const title = view.getAllByTestId(/^glyph-/) as unknown as Node[];
    expect(title).toHaveLength(4);
    for (const glyph of title) expect(textsIn(glyph)[0]!.props.font.getSize()).toBe(XL);
    const shadowed = view.getByTestId('line-shadow') as unknown as Node;
    expect(shadowed.queryAll((n) => /^glyph-/.test(n.props.testID ?? ''))).toHaveLength(4);

    const artist = view.getAllByTestId(/^nameplate-artist-glyph-/) as unknown as Node[];
    expect(artist).toHaveLength(4);
    expect(view.getByTestId('nameplate-artist').props.opacity).toBe(0.6);
    const rule = view.getByTestId('nameplate-artist-rule').props;
    expect(rule).toMatchObject({ x: 24, width: 12, height: 2 });
    expect(rule.color.value).toBe(palette.accent);
    for (const glyph of artist) {
      expect(textsIn(glyph)[0]!.props.font.getSize()).toBe(390 * SIZE_RATIO.s);
      // Flat, like the caption: no body gradient.
      expect(glyph.queryAll((n) => n.type === 'skLinearGradient')).toHaveLength(0);
    }

    expect(view.queryByTestId('idle-caption')).toBeNull();
    expect(view.queryByTestId('idle-caption-rule')).toBeNull();
    expect(view.queryByTestId('idle-shadow')).toBeNull();
    expect(view.queryAllByTestId(/^exit-/)).toHaveLength(0);
    expect(view.queryAllByTestId(/^ornament-/)).toHaveLength(0);
  });

  test('the title rises and holds pulse (it breathes on the beat heads); the artist fades in and stands still', async () => {
    const spy = jest.spyOn(motion, 'glyphTransform');
    await renderStage({ source: unsynced(), beat, nowMonotonicMs: 100 });
    const inputs = spy.mock.calls.map(([input]) => input as motion.MotionInput).filter((i) => !i.exiting);
    const title = inputs.filter((i) => i.hold === 'pulse');
    const artist = inputs.filter((i) => i.hold === 'still');
    expect(title.length).toBeGreaterThan(0);
    expect(artist.length).toBeGreaterThan(0);
    for (const i of title) expect(i.entrance).toBe('rise');
    for (const i of artist) expect(i.entrance).toBe('fade');
    expect(inputs.filter((i) => i.hold !== 'pulse' && i.hold !== 'still')).toHaveLength(0);
  });

  test.each(['lyrics_unavailable', 'plain', 'instrumental'] as const)(
    'the note on the caption row for %s says what was not found, gothic xs in the ink at 0.6',
    async (reason) => {
      const view = await renderStage({ source: unsynced(reason), beat, nowMonotonicMs: 100 });
      const note = view.getByTestId('unsynced-note').props;
      expect(note.text).toBe(unsyncedNote(reason));
      expect(note).toMatchObject({ x: 24, y: STAGE_AREA.captionBaseline, opacity: 0.6 });
      expect(note.font.getSize()).toBe(XS);
      expect(note.color.value).toBe(palette.ink);
      expect(note.text).not.toContain('同期歌詞');
    },
  );

  test('the band meter: 24 two-pixel rules on the foot of the print area, in the ink at 0.7, at the printed base before any sound', async () => {
    const view = await renderStage({ source: unsynced(), beat, nowMonotonicMs: 100 });
    const rules = view.getAllByTestId(/^band-rule-/);
    expect(rules).toHaveLength(METER_RULE_COUNT);
    const xs = rules.map((rule) => rectOf(rule).x);
    for (const rule of rules) {
      const rect = rectOf(rule);
      expect(rect.width).toBe(METER_RULE_WIDTH);
      expect(rect.height).toBe(METER_BASE_HEIGHT);
      expect(rect.y + rect.height).toBeCloseTo(STAGE_AREA.bottom, 6);
      expect(rule.props.color.value).toBe(palette.ink);
      expect(rule.props.opacity).toBe(0.7);
    }
    expect(Math.min(...xs)).toBe(STAGE_AREA.left);
    expect(Math.max(...xs)).toBeCloseTo(STAGE_AREA.right - METER_RULE_WIDTH, 6);
    expect(new Set(xs).size).toBe(METER_RULE_COUNT);
  });

  test('under reduced motion the meter is a still base scale and the stage still prints the nameplate', async () => {
    const view = await renderStage({ source: unsynced(), beat, nowMonotonicMs: 100, reducedMotion: true });
    for (const rule of view.getAllByTestId(/^band-rule-/)) expect(rectOf(rule).height).toBe(METER_BASE_HEIGHT);
    expect(view.getAllByTestId(/^glyph-/)).toHaveLength(4);
    expect(view.getByTestId('unsynced-note').props.text).toBe(unsyncedNote('lyrics_unavailable'));
  });

  test('the title, the artist with its rule and the meter all keep to the print area', async () => {
    const view = await renderStage({ source: unsynced(), beat, nowMonotonicMs: 100 });
    const glyphs = [
      ...(view.getAllByTestId(/^glyph-/) as unknown as Node[]),
      ...(view.getAllByTestId(/^nameplate-artist-glyph-/) as unknown as Node[]),
    ];
    for (const glyph of glyphs) for (const text of textsIn(glyph)) expectInside(textBox(text.props));
    const rule = view.getByTestId('nameplate-artist-rule').props;
    expectInside({ left: rule.x, top: rule.y, right: rule.x + rule.width, bottom: rule.y + rule.height });
    for (const node of view.getAllByTestId(/^band-rule-/)) {
      const rect = rectOf(node);
      expectInside({ left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height });
    }
  });

  test('the lamp settles on the title', async () => {
    const spy = jest.spyOn(textureBackground, 'TextureBackground');
    await renderStage({ source: unsynced(), beat, nowMonotonicMs: 100 });
    const props = spy.mock.calls.at(-1)![0] as { focus?: { value: { x: number; y: number } } };
    const focus = props.focus!.value;
    expect(focus).not.toEqual(IDLE_FOCUS);
    expect(focus.x).toBeGreaterThan(0.3);
    expect(focus.x).toBeLessThan(0.7);
  });

  test('the recognition drop fires for a song without lyrics: the idle glyphs scatter on the head and the title drops onto it', async () => {
    // The nameplate's own start is read from performance.now(); pin it to the
    // fire time (and hand the clock back before the fake timers are removed).
    const nowSpy = jest.spyOn(performance, 'now').mockReturnValue(10_000);
    const gridValues: BeatSharedValues = { ...beatValues, nextBeatAtMs: sv(10_300), periodMs: sv(500), confidence: sv(0.9) };
    const stage = (source: LyricStageProps['source'], nowMonotonicMs: number) =>
      inProvider(<LyricStage beatValues={gridValues} source={source} beat={beat} nowMonotonicMs={nowMonotonicMs} />);
    const flushUI = () =>
      act(async () => {
        jest.advanceTimersByTime(0);
      });
    const spy = jest.spyOn(motion, 'glyphTransform');
    const view = await render(stage({ kind: 'idle', direction: null, track: null }, 10_000));
    await flushUI();
    const idleCount = view.getAllByTestId(/^glyph-/).length;
    spy.mockClear();

    await view.rerender(stage(unsynced('plain', 10_000), 10_000));
    await flushUI();
    expect(view.getAllByTestId(/^exit-idle-glyph-/)).toHaveLength(idleCount);
    expect(view.getAllByTestId(/^glyph-/)).toHaveLength(4);
    const inputs = spy.mock.calls.map(([input]) => input as motion.MotionInput);
    const exits = inputs.filter((i) => i.exiting);
    const title = inputs.filter((i) => !i.exiting && i.hold === 'pulse');
    const artist = inputs.filter((i) => !i.exiting && i.hold === 'still');
    expect(exits.length).toBeGreaterThan(0);
    expect(title.length).toBeGreaterThan(0);
    expect(artist.length).toBeGreaterThan(0);
    for (const i of exits) {
      expect(i.entrance).toBe('scatter');
      expect(i.elapsedMs).toBe(-300);
    }
    for (const i of title) {
      expect(i.entrance).toBe('drop');
      expect(i.anticipationMs).toBe(300);
      expect(i.elapsedMs).toBe(-300);
    }
    // The artist lands with the title: hidden until the head, then it fades in.
    for (const i of artist) expect(i.elapsedMs).toBe(-300);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(view.queryAllByTestId(/^exit-idle-glyph-/)).toHaveLength(0);
    expect(view.getAllByTestId(/^glyph-/)).toHaveLength(4);
    nowSpy.mockRestore();
  });

  test('a nameplate leaving for idle (its song was lost) keeps its title as an exiting layer, then drops it', async () => {
    const nowSpy = jest.spyOn(performance, 'now').mockReturnValue(100);
    const at = (source: LyricStageProps['source']) => (
      <LyricStage beatValues={beatValues} source={source} beat={beat} nowMonotonicMs={100} />
    );
    const view = await render(inProvider(at(unsynced())));
    expect(view.getAllByTestId(/^glyph-/)).toHaveLength(4);

    await view.rerender(inProvider(at({ kind: 'idle', direction: null, track: null })));
    expect(view.getAllByTestId(/^exit-glyph-/)).toHaveLength(4);
    expect(view.getAllByTestId(/^glyph-/).length).toBeGreaterThanOrEqual(5);
    expect(view.queryAllByTestId(/^band-rule-/)).toHaveLength(0);
    expect(view.queryByTestId('unsynced-note')).toBeNull();

    // A rise exit runs 320 ms (+80 ms of slack in the stage's timer).
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(view.queryAllByTestId(/^exit-glyph-/)).toHaveLength(0);
    nowSpy.mockRestore();
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
