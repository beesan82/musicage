import type { EarFeatures } from '../../audio/types';
import { scheduleLine } from '../../sync/lineScheduler';
import { createBeatEngine } from '../beatEngine';
import { SILENCE_RMS, type BeatState } from '../types';
import { accentTimes, generateAccentedClicks, generateClicks, weakTimes } from './syntheticClicks';

const pushAll = (engine: ReturnType<typeof createBeatEngine>, samples: EarFeatures[]) =>
  samples.map((sample) => ({ t: sample.timestampMs, state: engine.push(sample) }));

const stateAt = (states: { t: number; state: BeatState }[], t: number) => {
  const found = states.find((entry) => entry.t === t);
  if (!found) throw new Error(`no state at ${t}`);
  return found.state;
};

describe('createBeatEngine', () => {
  test('locks onto 120 BPM clicks within ±3 BPM after 8 seconds', () => {
    const engine = createBeatEngine();
    let state!: BeatState;
    for (const f of generateClicks(120, 10_000)) state = engine.push(f);
    expect(Math.abs(state.bpm! - 120)).toBeLessThanOrEqual(3);
    expect(state.confidence).toBeGreaterThan(0.5);
  });

  test.each([90, 150])('tracks %i BPM within ±3', (bpm) => {
    const engine = createBeatEngine();
    let state!: BeatState;
    for (const f of generateClicks(bpm, 10_000)) state = engine.push(f);
    expect(state.bpm).not.toBeNull();
    expect(Math.abs(state.bpm! - bpm)).toBeLessThanOrEqual(3);
    expect(state.confidence).toBeGreaterThan(0.5);
  });

  test('locks onto 120 BPM from 60 ms meter samples', () => {
    const engine = createBeatEngine();
    let state!: BeatState;
    for (const f of generateClicks(120, 10_000, 60)) state = engine.push(f);
    expect(Math.abs(state.bpm! - 120)).toBeLessThanOrEqual(3);
    expect(state.confidence).toBeGreaterThan(0.5);
  });

  test('nextBeatAtMs stays on the clock of performance.now()-stamped ear frames', () => {
    // Ear frames are stamped with performance.now(); the scheduler compares
    // nextBeatAtMs against the same clock, so a locked beat must land within
    // one period ahead of the latest frame and can hold a forward line switch.
    const baseMs = performance.now() + 50_000;
    const engine = createBeatEngine();
    let state!: BeatState;
    let lastMs = 0;
    for (const f of generateClicks(120, 10_000)) {
      lastMs = baseMs + f.timestampMs;
      state = engine.push({ ...f, timestampMs: lastMs });
    }
    expect(state.confidence).toBeGreaterThan(0.5);
    expect(state.nextBeatAtMs).not.toBeNull();
    const untilBeat = state.nextBeatAtMs! - lastMs;
    expect(untilBeat).toBeGreaterThanOrEqual(0);
    expect(untilBeat).toBeLessThanOrEqual(500 + 1);

    const lines = [
      { startMs: 0, text: 'a' },
      { startMs: 1_000, text: 'b' },
    ];
    const previous = { index: 0, startedAtMs: lastMs - 1_000, isEmpty: false };
    const justBefore = state.nextBeatAtMs! - 40;
    expect(scheduleLine(lines, 1_100, state, justBefore, previous)).toBe(previous);
  });

  test('pulse rises to >= 0.9 within 30ms of a click and decays below 0.3 within 300ms', () => {
    const states = pushAll(createBeatEngine(), generateClicks(120, 10_000));
    for (const click of [4000, 9000]) {
      const nearClick = states.filter((entry) => entry.t >= click && entry.t <= click + 30);
      expect(Math.max(...nearClick.map((entry) => entry.state.pulse))).toBeGreaterThanOrEqual(0.9);
      expect(stateAt(states, click - 20).pulse).toBeLessThan(0.3);
      expect(stateAt(states, click + 300).pulse).toBeLessThan(0.3);
    }
  });

  test('phase is near 0 at a click once locked', () => {
    const states = pushAll(createBeatEngine(), generateClicks(120, 14_000));
    for (let click = 8500; click < 14_000; click += 500) {
      const { phase } = stateAt(states, click);
      expect(phase < 0.08 || phase > 0.92).toBe(true);
      // Half a period later the phase sits mid-beat (240 ms / 500 ms = 0.48).
      expect(Math.abs(stateAt(states, click + 240).phase - 0.48)).toBeLessThan(0.08);
    }
  });

  test('bar increments every four beats', () => {
    const states = pushAll(createBeatEngine(), generateClicks(120, 16_000));
    const bars: number[] = [];
    for (let click = 9000; click < 16_000; click += 500) bars.push(stateAt(states, click + 100).bar);
    for (let i = 0; i + 4 < bars.length; i += 1) {
      expect(bars[i + 4]! - bars[i]!).toBe(1);
      expect(bars[i + 1]! - bars[i]!).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(bars).size).toBeGreaterThanOrEqual(3);
  });

  test('silence: rms below SILENCE_RMS for 500ms sets silence=true, confidence decays and pulse stays 0', () => {
    const quiet: EarFeatures[] = [];
    for (let t = 10_000; t < 12_000; t += 20) {
      quiet.push({ timestampMs: t, rms: SILENCE_RMS / 4, low: SILENCE_RMS / 4, mid: 0, high: 0 });
    }
    const states = pushAll(createBeatEngine(), [...generateClicks(120, 10_000), ...quiet]);
    const before = stateAt(states, 9980);
    expect(before.silence).toBe(false);
    expect(before.confidence).toBeGreaterThan(0.5);

    expect(stateAt(states, 10_400).silence).toBe(false);
    expect(stateAt(states, 10_600).silence).toBe(true);

    const silent = states.filter((entry) => entry.state.silence);
    expect(silent.length).toBeGreaterThan(0);
    for (const entry of silent) expect(entry.state.pulse).toBe(0);

    const last = stateAt(states, 11_980);
    expect(last.silence).toBe(true);
    expect(last.confidence).toBeGreaterThan(0);
    // ~1.5 s of decay with a 1 s time constant leaves ~22 % of the locked confidence.
    expect(last.confidence).toBeLessThan(before.confidence * 0.4);
  });

  test('nextBeatAtMs is about one period after the last click when locked', () => {
    const states = pushAll(createBeatEngine(), generateClicks(120, 10_000));
    expect(Math.abs(stateAt(states, 9500).nextBeatAtMs! - 10_000)).toBeLessThanOrEqual(30);
    expect(Math.abs(stateAt(states, 9800).nextBeatAtMs! - 10_000)).toBeLessThanOrEqual(30);
    expect(Math.abs(stateAt(states, 9980).nextBeatAtMs! - 10_000)).toBeLessThanOrEqual(30);
  });

  test('reports bpm null and confidence 0 before the window fills', () => {
    const states = pushAll(createBeatEngine(), generateClicks(120, 7_900));
    for (const { state } of states) {
      expect(state.bpm).toBeNull();
      expect(state.confidence).toBe(0);
      expect(state.nextBeatAtMs).toBeNull();
    }
    expect(Math.max(...states.map((entry) => entry.state.pulse))).toBe(1);
  });

  test('a one-hour gap restarts the engine instead of interpolating across it', () => {
    const engine = createBeatEngine();
    for (const f of generateClicks(120, 10_000)) engine.push(f);
    const resumeMs = 3_600_000;
    const startedAt = Date.now();
    const afterGap = engine.push({ timestampMs: resumeMs, rms: 0.9, low: 0.9, mid: 0.9, high: 0.9 });
    expect(Date.now() - startedAt).toBeLessThan(50);
    expect(afterGap.bpm).toBeNull();
    expect(afterGap.confidence).toBe(0);
    expect(afterGap.pulse).toBe(0);
    expect(afterGap.bar).toBe(0);
    expect(afterGap.barConfidence).toBe(0);

    let state = afterGap;
    for (const f of generateClicks(120, 7_900)) {
      state = engine.push({ ...f, timestampMs: resumeMs + 20 + f.timestampMs });
      expect(state.bpm).toBeNull();
    }
    for (const f of generateClicks(120, 3_000)) {
      state = engine.push({ ...f, timestampMs: resumeMs + 7_920 + f.timestampMs });
    }
    expect(Math.abs(state.bpm! - 120)).toBeLessThanOrEqual(3);
  });

  test('a clock that moves backwards restarts the engine rather than freezing it', () => {
    const engine = createBeatEngine();
    for (const f of generateClicks(120, 10_000)) engine.push(f);
    let state!: BeatState;
    for (const f of generateClicks(120, 10_000)) state = engine.push(f);
    expect(Math.abs(state.bpm! - 120)).toBeLessThanOrEqual(3);
    expect(state.nextBeatAtMs!).toBeLessThan(10_100);
  });

  test('locks onto 120 BPM with jittered 20–70 ms sample spacing', () => {
    const dense = generateClicks(120, 12_000, 10);
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const engine = createBeatEngine();
    let state!: BeatState;
    for (let index = 0; index < dense.length; index += 2 + Math.floor(random() * 6)) {
      state = engine.push(dense[index]!);
    }
    expect(Math.abs(state.bpm! - 120)).toBeLessThanOrEqual(3);
    expect(state.confidence).toBeGreaterThan(0.5);
  });

  test('reset forgets the lock', () => {
    const engine = createBeatEngine();
    for (const f of generateClicks(120, 10_000)) engine.push(f);
    engine.reset();
    const state = engine.push({ timestampMs: 0, rms: 0.05, low: 0.05, mid: 0, high: 0 });
    expect(state.bpm).toBeNull();
    expect(state.confidence).toBe(0);
    expect(state.bar).toBe(0);
    expect(state.barConfidence).toBe(0);
  });
});

describe('bar head estimation (design spec §3, 2026-11-07)', () => {
  // 100 BPM: a 600 ms period sits on the 20 ms grid and two beats (1200 ms)
  // fall outside the 60–180 BPM lag range, so the tempo lock is unambiguous.
  const BPM = 100;
  const DURATION_MS = 20_000;
  // The tempo locks at 8 s; the head needs two more bars plus a bar to
  // re-align, so the count is inspected over the last four seconds.
  const FROM_MS = 16_000;

  const barSteps = (states: { t: number; state: BeatState }[]) =>
    states.slice(1).map((entry, i) => entry.state.bar - states[i]!.state.bar);

  test.each([0, 1, 2, 3])(
    'counts bars from the accented beat when the accent is beat %i of four',
    (accentBeat) => {
      const states = pushAll(
        createBeatEngine(),
        generateAccentedClicks(BPM, DURATION_MS, { accentBeat }),
      );
      const last = states[states.length - 1]!.state;
      expect(Math.abs(last.bpm! - BPM)).toBeLessThanOrEqual(3);

      // A trusted head: the margin is at least the lock threshold, and it
      // stays trusted through the inspected window.
      expect(last.barConfidence).toBeGreaterThanOrEqual(0.4);
      for (const entry of states.filter((e) => e.t >= FROM_MS)) {
        expect(entry.state.barConfidence).toBeGreaterThan(0);
      }

      // The bar increments at each accented click and at no un-accented one.
      for (const t of accentTimes(BPM, FROM_MS, DURATION_MS, { accentBeat })) {
        expect(stateAt(states, t + 100).bar - stateAt(states, t - 100).bar).toBe(1);
      }
      for (const t of weakTimes(BPM, FROM_MS, DURATION_MS, { accentBeat })) {
        expect(stateAt(states, t + 100).bar - stateAt(states, t - 100).bar).toBe(0);
      }

      // Re-aligning the head never jumps the count: it only ever grows by one.
      for (const step of barSteps(states)) {
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThanOrEqual(1);
      }
    },
  );

  test('equal beats give barConfidence 0 and the bar keeps counting every four beats', () => {
    const states = pushAll(createBeatEngine(), generateClicks(120, DURATION_MS));
    for (const { state } of states) expect(state.barConfidence).toBe(0);

    const bars: number[] = [];
    for (let click = 12_000; click < DURATION_MS; click += 500) {
      bars.push(stateAt(states, click + 100).bar);
    }
    for (let i = 0; i + 4 < bars.length; i += 1) {
      expect(bars[i + 4]! - bars[i]!).toBe(1);
      expect(bars[i + 1]! - bars[i]!).toBeGreaterThanOrEqual(0);
    }
  });

  test('no estimate before the tempo lock and before two bars of beats', () => {
    const states = pushAll(createBeatEngine(), generateAccentedClicks(BPM, 12_000));
    // 8 s of window plus 8 beats at 600 ms: nothing can be trusted before ~12.8 s.
    for (const { state } of states) expect(state.barConfidence).toBe(0);
  });

  test('a 3/4-like accent does not lock a head: barConfidence stays 0 and bars keep counting by four', () => {
    const states = pushAll(
      createBeatEngine(),
      generateAccentedClicks(BPM, 24_000, { beatsPerBar: 3 }),
    );
    const last = states[states.length - 1]!.state;
    expect(Math.abs(last.bpm! - BPM)).toBeLessThanOrEqual(3);
    // The accent walks through all four slots, so no slot stands out.
    for (const { state } of states) expect(state.barConfidence).toBe(0);
    // The fallback count is untouched: monotonic, one at a time, four beats apart.
    for (const step of barSteps(states)) {
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(1);
    }
    const spanBars = stateAt(states, 23_980).bar - stateAt(states, 12_000).bar;
    // 12 s is 20 beats: five bars of four, give or take one at the edges.
    expect(spanBars).toBeGreaterThanOrEqual(4);
    expect(spanBars).toBeLessThanOrEqual(6);
  });

  test('silence keeps the count frozen in place: the head survives and the bar does not jump', () => {
    const quiet: EarFeatures[] = [];
    for (let t = DURATION_MS; t < DURATION_MS + 2_000; t += 20) {
      quiet.push({ timestampMs: t, rms: SILENCE_RMS / 4, low: SILENCE_RMS / 4, mid: 0, high: 0 });
    }
    const states = pushAll(createBeatEngine(), [
      ...generateAccentedClicks(BPM, DURATION_MS, { accentBeat: 2 }),
      ...quiet,
    ]);
    const beforeQuiet = stateAt(states, DURATION_MS - 20);
    expect(beforeQuiet.barConfidence).toBeGreaterThan(0);
    // No onsets in silence, so the histogram only decays uniformly and its
    // margin is unchanged.
    expect(stateAt(states, DURATION_MS + 1_980).barConfidence).toBeCloseTo(
      beforeQuiet.barConfidence,
      6,
    );
    for (const step of barSteps(states)) {
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(1);
    }
  });
});
