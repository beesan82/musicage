import { Skia } from '@shopify/react-native-skia';
import { render } from '@testing-library/react-native';
import { interpolateColor, makeMutable } from 'react-native-reanimated';

import { DEFAULT_PALETTE } from '../../direction/types';
import type { LineDirection } from '../../direction/types';
import { GlyphLayer } from '../GlyphLayer';
import { layoutLine } from '../layout';
import type { GlyphMeasure } from '../layout';
import * as motion from '../motion';
import type { GlyphTransform, MotionInput } from '../motion';
import type { BeatSharedValues } from '../useBeatSharedValues';

const vp = { width: 390, height: 844, insetTop: 59, insetBottom: 34 };
const measure: GlyphMeasure = (_ch, size) => ({ advance: size, ascent: -size * 0.88, descent: size * 0.12 });
const direction: LineDirection = {
  font: 'mincho',
  weight: 'regular',
  size: 'm',
  orientation: 'horizontal',
  entrance: 'scatter',
  hold: 'still',
  emphasis: [],
  accent: false,
  ornament: 'none',
};
const shared = (value: number) => makeMutable(value);
const beat: BeatSharedValues = {
  pulse: shared(0),
  phase: shared(0),
  bar: shared(0),
  confidence: shared(0),
  energy: shared(0),
  lastOnsetAtMs: shared(0),
  nextBeatAtMs: shared(0),
  periodMs: shared(0),
  low: shared(0),
  mid: shared(0),
  high: shared(0),
  surge: shared(0),
  write: () => {},
};

afterEach(() => jest.restoreAllMocks());

async function renderAt(elapsedMs: number) {
  const spy = jest.spyOn(motion, 'glyphTransform');
  const layout = layoutLine('夜 の 底', direction, vp, measure);
  await render(
    <GlyphLayer
      glyphs={layout.glyphs}
      fontFor={(sizePx) => Skia.Font(undefined as never, sizePx)}
      time={shared(elapsedMs)}
      lineStartedAtMs={0}
      entrance="scatter"
      hold="still"
      palette={DEFAULT_PALETTE}
      accent={false}
      beat={beat}
      reducedMotion={false}
      seed={7}
      feel={1}
    />,
  );
  const calls = spy.mock.calls.map(([input], i) => ({
    input: input as MotionInput,
    output: spy.mock.results[i]!.value as GlyphTransform,
  }));
  return { layout, calls };
}

test('stagger counts placed glyphs, not spaces, so the last glyph has entered when the entrance is done', async () => {
  const count = 3;
  // scatter: 600 ms + 40 ms stagger per glyph before the last one.
  const doneAt = motion.ENTRANCE_DURATION_MS.scatter + 40 * (count - 1);
  expect(motion.entranceDone('scatter', count, doneAt)).toBe(true);

  const { layout, calls } = await renderAt(doneAt);
  // Code-point indices include the spaces...
  expect(layout.glyphs.map((g) => g.index)).toEqual([0, 2, 4]);
  // ...but the motion sees positions among the placed glyphs.
  const last = calls.filter((c) => c.input.glyphIndex === count - 1).at(-1)!;
  expect(calls.map((c) => c.input.glyphIndex)).not.toContain(4);
  expect(last.input.glyphCount).toBe(count);
  expect(last.output).toEqual({ dx: 0, dy: 0, scale: 1, opacity: 1, rotateDeg: 0 });
});

test('neighbouring glyphs still get different scatter offsets', async () => {
  const { calls } = await renderAt(100);
  const byIndex = new Map(calls.map((c) => [c.input.glyphIndex, c.output]));
  expect(byIndex.size).toBe(3);
  expect(byIndex.get(0)!.dx).not.toBeCloseTo(byIndex.get(1)!.dx);
  expect(byIndex.get(1)!.dx).not.toBeCloseTo(byIndex.get(2)!.dx);
});

type Node = { type: unknown; props: Record<string, any>; queryAll: (p: (n: Node) => boolean) => Node[] };
const textsIn = (node: Node) => node.queryAll((n) => n.type === 'skText');

interface LayerOptions {
  timeMs?: number;
  lineStartedAtMs?: number;
  lineLandsAtMs?: number | null;
  lineEndsAtMs?: number | null;
  heavy?: boolean;
  exiting?: boolean;
  accent?: boolean;
  emphasis?: number[];
}

async function renderLayer(directionOverrides: Partial<LineDirection>, opts: LayerOptions = {}) {
  const dir: LineDirection = { ...direction, entrance: 'fade', hold: 'still', ...directionOverrides };
  const layout = layoutLine('夜の底', dir, vp, measure);
  const view = await render(
    <GlyphLayer
      glyphs={layout.glyphs}
      fontFor={(sizePx) => Skia.Font(undefined as never, sizePx)}
      time={shared(opts.timeMs ?? 0)}
      lineStartedAtMs={opts.lineStartedAtMs ?? 0}
      lineLandsAtMs={opts.lineLandsAtMs ?? null}
      lineEndsAtMs={opts.lineEndsAtMs ?? null}
      entrance={dir.entrance}
      hold={dir.hold}
      palette={DEFAULT_PALETTE}
      accent={opts.accent ?? false}
      heavy={opts.heavy ?? false}
      exiting={opts.exiting ?? false}
      beat={beat}
      reducedMotion={false}
      seed={7}
      feel={1}
    />,
  );
  return { view, layout };
}

describe('the stroke twin on heavy lines', () => {
  test('a heavy layer draws a stroke twin under each glyph fill', async () => {
    const { view } = await renderLayer({}, { heavy: true });
    const groups = view.getAllByTestId(/^glyph-/);
    expect(groups).toHaveLength(3);
    for (const group of groups) {
      const texts = textsIn(group as unknown as Node);
      expect(texts).toHaveLength(2);
      expect(texts.filter((t) => t.props.style === 'stroke')).toHaveLength(1);
    }
  });

  test('a regular layer draws fills only', async () => {
    const { view } = await renderLayer({}, { heavy: false });
    for (const group of view.getAllByTestId(/^glyph-/)) {
      const texts = textsIn(group as unknown as Node);
      expect(texts).toHaveLength(1);
      expect(texts[0]!.props.style).toBeUndefined();
    }
  });
});

describe('the landing hand-off', () => {
  test('elapsed is anchored at landsAtMs and the anticipation window is passed on', async () => {
    const spy = jest.spyOn(motion, 'glyphTransform');
    await renderLayer(
      { entrance: 'drop' },
      { timeMs: 1100, lineStartedAtMs: 1000, lineLandsAtMs: 1200 },
    );
    const inputs = spy.mock.calls.map(([input]) => input as MotionInput);
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.elapsedMs).toBe(-100);
      expect(input.anticipationMs).toBe(200);
      expect(input.exiting).toBe(false);
    }
  });

  test('without landsAtMs the clock stays at the line start and there is no anticipation', async () => {
    const spy = jest.spyOn(motion, 'glyphTransform');
    await renderLayer({ entrance: 'drop' }, { timeMs: 1100, lineStartedAtMs: 1000 });
    const inputs = spy.mock.calls.map(([input]) => input as MotionInput);
    for (const input of inputs) {
      expect(input.elapsedMs).toBe(100);
      expect(input.anticipationMs).toBe(0);
    }
  });

  test('an exiting layer passes exiting through to the motion', async () => {
    const spy = jest.spyOn(motion, 'glyphTransform');
    await renderLayer({ entrance: 'drop' }, { exiting: true, timeMs: 100 });
    const inputs = spy.mock.calls.map(([input]) => input as MotionInput);
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) expect(input.exiting).toBe(true);
  });
});

describe('the emphasis colour migration', () => {
  const palette = { background: '#000000', ink: '#EEEEEE', accent: '#FF0000' };

  async function renderAccent(timeMs: number, lineEndsAtMs: number | null) {
    const dir: LineDirection = {
      ...direction,
      entrance: 'fade',
      hold: 'still',
      emphasis: [0, 2],
      accent: true,
    };
    const layout = layoutLine('夜の底', dir, vp, measure);
    const view = await render(
      <GlyphLayer
        glyphs={layout.glyphs}
        fontFor={(sizePx) => Skia.Font(undefined as never, sizePx)}
        time={shared(timeMs)}
        lineStartedAtMs={0}
        lineEndsAtMs={lineEndsAtMs}
        entrance="fade"
        hold="still"
        palette={palette}
        accent
        beat={beat}
        reducedMotion={false}
        seed={7}
        feel={1}
      />,
    );
    return view
      .getAllByTestId(/^glyph-/)
      .map((g) => textsIn(g as unknown as Node)[0]!.props.color.value as string);
  }

  test('emphasized glyphs take the accent colour one after another across the line', async () => {
    // Glyph 0 ramps over progress 0..0.5, glyph 2 over 0.5..1 (two emphasized).
    const start = await renderAccent(0, 4000);
    expect(start[0]).not.toBe(palette.accent);
    expect(start[2]).not.toBe(palette.accent);
    const fullAccent = interpolateColor(1, [0, 1], [palette.ink, palette.accent]);
    const mid = await renderAccent(2000, 4000);
    expect(mid[0]).toBe(fullAccent);
    expect(mid[2]).not.toBe(fullAccent);
    const end = await renderAccent(4000, 4000);
    expect(end[0]).toBe(fullAccent);
    expect(end[2]).toBe(fullAccent);
    // The unemphasized middle glyph stays ink throughout.
    expect(start[1]).toBe(palette.ink);
    expect(end[1]).toBe(palette.ink);
  });

  test('without a line end the accent colour is static, as before', async () => {
    const colors = await renderAccent(100, null);
    expect(colors[0]).toBe(palette.accent);
    expect(colors[2]).toBe(palette.accent);
    expect(colors[1]).toBe(palette.ink);
  });
});

describe('the surge-interpolated ink and accent', () => {
  const palette = { background: '#000000', ink: '#EEEEEE', accent: '#FF0000' };

  test('shared ink and accent values replace the palette strings when given', async () => {
    const dir: LineDirection = {
      ...direction,
      entrance: 'fade',
      hold: 'still',
      emphasis: [0],
      accent: true,
    };
    const layout = layoutLine('夜の底', dir, vp, measure);
    const inkValue = makeMutable('#112233');
    const accentValue = makeMutable('#445566');
    const view = await render(
      <GlyphLayer
        glyphs={layout.glyphs}
        fontFor={(sizePx) => Skia.Font(undefined as never, sizePx)}
        time={shared(100)}
        lineStartedAtMs={0}
        lineEndsAtMs={null}
        entrance="fade"
        hold="still"
        palette={palette}
        inkValue={inkValue}
        accentValue={accentValue}
        accent
        beat={beat}
        reducedMotion={false}
        seed={7}
        feel={1}
      />,
    );
    const colors = view
      .getAllByTestId(/^glyph-/)
      .map((g) => textsIn(g as unknown as Node)[0]!.props.color.value as string);
    expect(colors).toEqual(['#445566', '#112233', '#112233']);
  });
});

