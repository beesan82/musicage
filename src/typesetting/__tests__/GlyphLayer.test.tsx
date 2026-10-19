import { Skia } from '@shopify/react-native-skia';
import { render } from '@testing-library/react-native';
import { makeMutable } from 'react-native-reanimated';

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
