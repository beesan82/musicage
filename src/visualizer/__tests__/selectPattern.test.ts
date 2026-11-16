import { fnv1a } from '../../direction/hash';
import { VISUALIZER_KEYS } from '../patterns';
import {
  choosePattern,
  createPatternObserver,
  OBSERVE_AUDIBLE_MS,
  OBSERVE_LIMIT_MS,
  patternCandidates,
  quantize,
} from '../selectPattern';
import type { AcousticSummary, PatternSample } from '../selectPattern';

// Synthetic feature streams only: no audio, no song.

const FRAME_MS = 20;

const summary = (over: Partial<AcousticSummary> = {}): AcousticSummary => ({
  bpm: 110,
  bpmSpread: 0.05,
  tempoCoverage: 1,
  confidence: 0.45,
  energy: 0.08,
  low: 0.3,
  mid: 0.4,
  high: 0.3,
  ...over,
});

const FAST_LOUD_STEADY = summary({ bpm: 140, bpmSpread: 0.01, confidence: 0.8, energy: 0.2 });
const LOW_STEADY = summary({ bpm: 110, bpmSpread: 0.01, confidence: 0.8, low: 0.6, mid: 0.25, high: 0.15 });
const BRIGHT = summary({ low: 0.15, mid: 0.4, high: 0.45 });
const LOOSE = summary({ confidence: 0.2, bpmSpread: 0.2 });
const SLOW_QUIET = summary({ bpm: 80, energy: 0.02 });
const PLAIN = summary();

const sample = (timestampMs: number, over: Partial<PatternSample> = {}): PatternSample => ({
  timestampMs,
  bpm: 140,
  confidence: 0.8,
  energy: 0.2,
  low: 0.3,
  mid: 0.4,
  high: 0.3,
  silence: false,
  ...over,
});

/** Feeds `count` frames FRAME_MS apart from `from`; returns the last verdict. */
function feed(observer: ReturnType<typeof createPatternObserver>, from: number, count: number, over: Partial<PatternSample> = {}) {
  let verdict = observer.push(sample(from, over));
  for (let i = 1; i < count; i += 1) verdict = observer.push(sample(from + i * FRAME_MS, over));
  return verdict;
}

describe('quantize: the coarse classes', () => {
  test('tempo: fast at 130 BPM and above, slow below 90, unknown without one', () => {
    expect(quantize(summary({ bpm: 130 })).tempo).toBe('fast');
    expect(quantize(summary({ bpm: 129.9 })).tempo).toBe('mid');
    expect(quantize(summary({ bpm: 89.9 })).tempo).toBe('slow');
    expect(quantize(summary({ bpm: null, bpmSpread: null })).tempo).toBe('unknown');
  });

  test('a broken summary still quantizes (never throws, never NaN classes)', () => {
    const c = quantize(summary({ energy: Number.NaN, low: Infinity, mid: -1, high: Number.NaN, confidence: Number.NaN }));
    expect(['low', 'mid', 'high']).toContain(c.energy);
    expect(['low', 'even', 'high']).toContain(c.balance);
    expect(['steady', 'fair', 'loose']).toContain(c.stability);
  });

  test('without a tempo over most of the heard time the beat is loose', () => {
    expect(quantize(summary({ bpmSpread: 0.01, confidence: 0.9, tempoCoverage: 0.2 })).stability).toBe('loose');
  });
});

describe('the table (design spec §9.1), first matching row', () => {
  test.each([
    ['fast, loud and steady', FAST_LOUD_STEADY, ['landscape']],
    ['the low end leads, steady', LOW_STEADY, ['ripple', 'bars-bold']],
    ['the top leads', BRIGHT, ['stipple', 'ring']],
    ['a loose beat', LOOSE, ['wave', 'curtain']],
    ['everything else', PLAIN, ['ring', 'bars-bold', 'bars']],
  ] as const)('%s', (_name, s, candidates) => {
    expect(patternCandidates(quantize(s))).toEqual(candidates);
  });

  test('slow and quiet: a slow, quiet song with a steady beat gets the curtain row', () => {
    const steadySlow = { ...SLOW_QUIET, bpmSpread: 0.01, confidence: 0.8 };
    expect(patternCandidates(quantize(steadySlow))).toEqual(['curtain', 'wave']);
  });

  test('every candidate is a known pattern', () => {
    for (const s of [FAST_LOUD_STEADY, LOW_STEADY, BRIGHT, LOOSE, SLOW_QUIET, PLAIN]) {
      for (const key of patternCandidates(quantize(s))) expect(VISUALIZER_KEYS).toContain(key);
    }
  });
});

describe('choosePattern: deterministic', () => {
  test('the same summary and seed always give the same pattern', () => {
    for (const s of [FAST_LOUD_STEADY, LOW_STEADY, BRIGHT, LOOSE, PLAIN]) {
      const first = choosePattern(s, '架空の人/架空の歌');
      for (let i = 0; i < 5; i += 1) expect(choosePattern({ ...s }, '架空の人/架空の歌')).toBe(first);
    }
  });

  test('the seed (fnv1a) picks among the row’s candidates', () => {
    const candidates = patternCandidates(quantize(PLAIN));
    for (const seed of ['架空の人/架空の歌', '架空の組/夜の別歌', 'a/b', 'x/y']) {
      expect(choosePattern(PLAIN, seed)).toBe(candidates[fnv1a(seed) % candidates.length]);
    }
    // Different seeds reach more than one candidate.
    const picks = new Set(Array.from({ length: 40 }, (_, i) => choosePattern(PLAIN, `架空の人/歌${i}`)));
    expect(picks.size).toBeGreaterThan(1);
  });

  test('a single-candidate row ignores the seed', () => {
    for (const seed of ['a/b', 'c/d', '架空の人/架空の歌']) expect(choosePattern(FAST_LOUD_STEADY, seed)).toBe('landscape');
  });

  test('summaries in the same classes give the same pattern (quantized, not raw values)', () => {
    const near = { ...BRIGHT, high: 0.46, mid: 0.39, energy: 0.081 };
    expect(choosePattern(near, 'a/b')).toBe(choosePattern(BRIGHT, 'a/b'));
  });
});

describe('createPatternObserver: the observation window', () => {
  const frames = (ms: number) => Math.round(ms / FRAME_MS);

  test('decides once OBSERVE_AUDIBLE_MS of sound is heard, then keeps that verdict', () => {
    const observer = createPatternObserver('架空の人/架空の歌');
    expect(feed(observer, 0, frames(OBSERVE_AUDIBLE_MS - 200)).status).toBe('observing');
    const verdict = feed(observer, OBSERVE_AUDIBLE_MS - 200, frames(400));
    expect(verdict).toEqual({ status: 'chosen', key: 'landscape' });
    // Later frames of another character do not change it.
    expect(feed(observer, OBSERVE_AUDIBLE_MS + 400, frames(9000), { bpm: 80, energy: 0.01, confidence: 0.1 })).toEqual(verdict);
  });

  test('silent frames do not count toward the window, nor into the summary', () => {
    const observer = createPatternObserver('a/b');
    // 5 s of silence (with values that would read as another class), then sound.
    expect(feed(observer, 0, frames(5000), { silence: true, bpm: 80, energy: 0.01 }).status).toBe('observing');
    expect(feed(observer, 5000, frames(OBSERVE_AUDIBLE_MS - 100)).status).toBe('observing');
    expect(feed(observer, 5000 + OBSERVE_AUDIBLE_MS - 100, frames(200))).toEqual({ status: 'chosen', key: 'landscape' });
  });

  test('gives up (the song keeps `bars`) when OBSERVE_LIMIT_MS passes without enough sound', () => {
    const observer = createPatternObserver('a/b');
    // Sound one frame in three: about a third of the time is heard.
    let verdict = observer.push(sample(0));
    for (let i = 1; i <= frames(OBSERVE_LIMIT_MS) + 5; i += 1) {
      verdict = observer.push(sample(i * FRAME_MS, { silence: i % 3 !== 0 }));
    }
    expect(verdict).toEqual({ status: 'gave-up' });
  });

  test('a hitch between frames counts at most 100 ms (a stall is not sound heard)', () => {
    const observer = createPatternObserver('a/b');
    observer.push(sample(0));
    // One frame 9 s later: without the cap this alone would fill the window.
    expect(observer.push(sample(9000)).status).toBe('observing');
  });

  test('the same feature stream and seed give the same pattern every time (a re-recognition observes the same)', () => {
    const run = () => {
      const observer = createPatternObserver('架空の組/夜の別歌');
      let verdict = observer.push(sample(0, { low: 0.15, high: 0.45, bpm: 110, confidence: 0.4 }));
      for (let i = 1; i < frames(OBSERVE_AUDIBLE_MS) + 10; i += 1) {
        verdict = observer.push(
          sample(i * FRAME_MS, { low: 0.15, high: 0.45, bpm: 110 + (i % 3), confidence: 0.4, energy: 0.05 + (i % 7) / 100 }),
        );
      }
      return verdict;
    };
    const first = run();
    expect(first.status).toBe('chosen');
    expect(run()).toEqual(first);
  });
});
