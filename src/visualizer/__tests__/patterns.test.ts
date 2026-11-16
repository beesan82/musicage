import {
  clearOfLine,
  crossfadeIn,
  DEFAULT_PATTERN,
  isVisualizerKey,
  lineClearance,
  PATTERN_CROSSFADE_MS,
  planStageVisualizer,
  stagePatternKey,
  VISUALIZER_KEYS,
  VISUALIZER_PLACE,
} from '../patterns';
import type { VisualizerKey, VisualizerStage } from '../patterns';
import { isDrawable, PATTERN_RENDERERS, rendererFor } from '../registry';

const STAGES: VisualizerStage[] = ['clock', 'nameplate', 'sheet', 'synced'];
const all = () => true;

describe('the patterns of the first set (design spec §9.1)', () => {
  test('eight keys, `bars` first; foot and back as the spec’s table', () => {
    expect(VISUALIZER_KEYS).toEqual(['bars', 'bars-bold', 'wave', 'ripple', 'stipple', 'curtain', 'ring', 'landscape']);
    expect(DEFAULT_PATTERN).toBe('bars');
    const foot = VISUALIZER_KEYS.filter((k) => VISUALIZER_PLACE[k] === 'foot');
    expect(foot).toEqual(['bars', 'bars-bold', 'wave']);
  });

  test('isVisualizerKey accepts the keys only', () => {
    for (const key of VISUALIZER_KEYS) expect(isVisualizerKey(key)).toBe(true);
    for (const value of ['', 'mandala', 'BARS', null, undefined, 3, {}]) expect(isVisualizerKey(value)).toBe(false);
  });
});

describe('which pattern each stage shows (decided 2026-11-16)', () => {
  test('the clock: always `bars`', () => {
    for (const song of [null, ...VISUALIZER_KEYS]) expect(stagePatternKey('clock', song)).toBe('bars');
  });

  test('the nameplate and the synced stage: the song’s pattern, `bars` until it is chosen', () => {
    for (const stage of ['nameplate', 'synced'] as const) {
      expect(stagePatternKey(stage, null)).toBe('bars');
      for (const key of VISUALIZER_KEYS) expect(stagePatternKey(stage, key)).toBe(key);
    }
  });

  test('the lyric sheet: always `bars-bold`, never a back pattern', () => {
    for (const song of [null, ...VISUALIZER_KEYS]) {
      expect(stagePatternKey('sheet', song)).toBe('bars-bold');
      expect(planStageVisualizer('sheet', song, all).place).toBe('foot');
    }
  });

  test('on the synced stage a back pattern is at 0.6 × its opacity and keeps clear of the line', () => {
    for (const key of VISUALIZER_KEYS) {
      const plan = planStageVisualizer('synced', key, all);
      if (VISUALIZER_PLACE[key] === 'back') {
        expect(plan).toMatchObject({ key, place: 'back', opacityScale: 0.6, clearsLine: true });
      } else {
        // A foot pattern stays where it is, at its own opacity.
        expect(plan).toMatchObject({ key, place: 'foot', opacityScale: 1, clearsLine: false });
      }
    }
  });

  test('elsewhere every pattern keeps its own opacity and draws everywhere it may', () => {
    for (const stage of ['clock', 'nameplate', 'sheet'] as const) {
      for (const key of VISUALIZER_KEYS) {
        const plan = planStageVisualizer(stage, key, all);
        expect(plan.opacityScale).toBe(1);
        expect(plan.clearsLine).toBe(false);
      }
    }
  });

  test('a pattern without a renderer is drawn as `bars` (the request is kept)', () => {
    const only = (keys: VisualizerKey[]) => (k: VisualizerKey) => keys.includes(k);
    const plan = planStageVisualizer('nameplate', 'landscape', only(['bars']));
    expect(plan).toMatchObject({ requested: 'landscape', key: 'bars', place: 'foot', opacityScale: 1, clearsLine: false });
    for (const stage of STAGES) {
      for (const key of VISUALIZER_KEYS) {
        expect(planStageVisualizer(stage, key, only(['bars'])).key).toBe('bars');
      }
    }
  });
});

describe('the registry (build 15a draws `bars` and `bars-bold`; 15b fills in the rest)', () => {
  test('bars and bars-bold have renderers; the rest fall back to bars’s', () => {
    expect(isDrawable('bars')).toBe(true);
    expect(isDrawable('bars-bold')).toBe(true);
    for (const key of ['wave', 'ripple', 'stipple', 'curtain', 'ring', 'landscape'] as const) {
      expect(isDrawable(key)).toBe(false);
      expect(rendererFor(key)).toBe(PATTERN_RENDERERS.bars);
    }
    expect(rendererFor('bars-bold')).toBe(PATTERN_RENDERERS['bars-bold']);
  });

  test('with the real registry, what each stage draws today', () => {
    const drawn = (stage: VisualizerStage, song: VisualizerKey | null) => planStageVisualizer(stage, song, isDrawable).key;
    expect(drawn('clock', 'bars-bold')).toBe('bars');
    expect(drawn('nameplate', 'bars-bold')).toBe('bars-bold');
    expect(drawn('nameplate', 'ripple')).toBe('bars');
    expect(drawn('sheet', 'ripple')).toBe('bars-bold');
    expect(drawn('synced', 'landscape')).toBe('bars');
    expect(drawn('synced', null)).toBe('bars');
  });
});

describe('the line’s clearance', () => {
  test('the line’s bounds grown by 16 px on every side', () => {
    expect(lineClearance({ x: 100, y: 200, width: 50, height: 80 })).toEqual({ x: 84, y: 184, width: 82, height: 112 });
  });

  test('nothing is drawn inside it, everything outside', () => {
    const c = lineClearance({ x: 100, y: 200, width: 50, height: 80 });
    expect(clearOfLine(c, 120, 240)).toBe(false);
    expect(clearOfLine(c, 90, 190)).toBe(false); // within the 16 px margin
    expect(clearOfLine(c, 83, 240)).toBe(true);
    expect(clearOfLine(c, 120, 297)).toBe(true);
    expect(clearOfLine(null, 120, 240)).toBe(true);
  });
});

describe('crossfadeIn', () => {
  test('0 → 1 linearly over PATTERN_CROSSFADE_MS (1.2 s), clamped, a broken time as 0', () => {
    expect(PATTERN_CROSSFADE_MS).toBe(1200);
    expect(crossfadeIn(0)).toBe(0);
    expect(crossfadeIn(-50)).toBe(0);
    expect(crossfadeIn(600)).toBeCloseTo(0.5);
    expect(crossfadeIn(1200)).toBe(1);
    expect(crossfadeIn(5000)).toBe(1);
    expect(crossfadeIn(Number.NaN)).toBe(0);
  });
});
