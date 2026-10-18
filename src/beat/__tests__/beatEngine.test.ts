import type { EarFeatures } from '../../audio/types';
import { createBeatEngine } from '../beatEngine';
import { SILENCE_RMS, type BeatState } from '../types';
import { generateClicks } from './syntheticClicks';

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
  });
});
