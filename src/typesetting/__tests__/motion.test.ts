import {
  derivePhase,
  derivePulse,
  DROP_MAX_WAIT_MS,
  dropHeadMs,
  ENTRANCE_DURATION_MS,
  entranceDone,
  exitDurationMs,
  exitForEntrance,
  glyphTransform,
  TEMPO_FEEL_FACTOR,
  type MotionInput,
} from '../motion';

const base: MotionInput = {
  entrance: 'cut',
  hold: 'still',
  elapsedMs: 0,
  glyphIndex: 0,
  glyphCount: 5,
  emphasized: false,
  timeMs: 0,
  lastOnsetAtMs: 0,
  nextBeatAtMs: 0,
  periodMs: 0,
  low: 0,
  feel: 1,
  bar: 0,
  confidence: 1,
  reducedMotion: false,
  seed: 1,
  phaseOffset: 0,
  anticipationMs: 0,
  exiting: false,
};
const identity = { dx: 0, dy: 0, scale: 1, opacity: 1, rotateDeg: 0 };
const at = (o: Partial<MotionInput>) => glyphTransform({ ...base, ...o });

/** Input whose derived phase is `phase` on a 1000 ms grid, at time `timeMs`. */
const withPhase = (phase: number, timeMs = 10_000): Partial<MotionInput> => ({
  timeMs,
  periodMs: 1000,
  nextBeatAtMs: timeMs + (1 - phase) * 1000,
});
/** Input whose derived pulse is fresh (an onset exactly at `timeMs`). */
const withOnset = (timeMs = 10_000): Partial<MotionInput> => ({ timeMs, lastOnsetAtMs: timeMs });

test('cut is identity from the first frame', () => expect(glyphTransform(base)).toEqual(identity));

test('drop starts 40px above with opacity 0 and settles within 420ms', () => {
  const t0 = at({ entrance: 'drop', elapsedMs: 0 });
  expect(t0.dy).toBe(-40);
  expect(t0.opacity).toBe(0);
  const end = at({ entrance: 'drop', elapsedMs: ENTRANCE_DURATION_MS.drop });
  expect(Math.abs(end.dy)).toBeLessThan(0.01);
  expect(end.opacity).toBeCloseTo(1, 2);
  expect(at({ entrance: 'drop', elapsedMs: 5000 })).toEqual(identity);
});

test('rise starts 24px below', () => {
  const t0 = at({ entrance: 'rise', elapsedMs: 0 });
  expect(t0.dy).toBe(24);
  expect(t0.opacity).toBe(0);
  expect(at({ entrance: 'rise', elapsedMs: 420 })).toEqual(identity);
});

test('scatter staggers glyphs by 40ms: glyph 3 is still invisible at 100ms, visible at 400ms', () => {
  expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 100 }).opacity).toBe(0);
  expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 120 }).opacity).toBe(0);
  expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 400 }).opacity).toBeGreaterThan(0.5);
  const start = at({ entrance: 'scatter', glyphIndex: 2, elapsedMs: 80 });
  expect(Math.abs(start.dx)).toBeLessThanOrEqual(30);
  expect(Math.abs(start.dy)).toBeLessThanOrEqual(30);
  expect(Math.abs(start.rotateDeg)).toBeLessThanOrEqual(12);
  expect(Math.abs(start.dx) + Math.abs(start.dy)).toBeGreaterThan(0);
  expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 120 + 600 })).toEqual(identity);
});

test('trace reveals glyphs in order, 60ms each', () => {
  const op = (i: number, ms: number) => at({ entrance: 'trace', glyphIndex: i, elapsedMs: ms }).opacity;
  expect(op(0, 0)).toBe(0);
  expect(op(2, 119)).toBe(0);
  expect(op(2, 120)).toBe(0);
  expect(op(2, 180)).toBeCloseTo(0.5, 5);
  expect(op(2, 240)).toBe(1);
  expect(op(0, 60)).toBeCloseTo(0.5, 5);
});

test('fade is opacity-only', () => {
  const t = at({ entrance: 'fade', elapsedMs: 150 });
  expect(t).toEqual({ ...identity, opacity: 0.5 });
  expect(at({ entrance: 'fade', elapsedMs: 300 })).toEqual(identity);
});

test('reducedMotion returns identity regardless of elapsed', () => {
  for (const entrance of ['drop', 'rise', 'scatter', 'trace', 'fade'] as const) {
    expect(
      at({ entrance, elapsedMs: 0, reducedMotion: true, hold: 'pulse', ...withOnset() }),
    ).toEqual(identity);
    expect(at({ entrance, elapsedMs: 77, reducedMotion: true })).toEqual(identity);
  }
});

describe('continuous beat derivation', () => {
  test('derivePulse is 1 at the onset and 1/e after 120 ms', () => {
    expect(derivePulse(10_000, 10_000)).toBe(1);
    expect(derivePulse(10_120, 10_000)).toBeCloseTo(Math.exp(-1), 10);
    expect(derivePulse(10_240, 10_000)).toBeCloseTo(Math.exp(-2), 10);
  });

  test('derivePulse is 0 before the onset and when there has been none', () => {
    expect(derivePulse(9_999, 10_000)).toBe(0);
    expect(derivePulse(10_000, 0)).toBe(0);
  });

  test('derivePhase reads the position inside the beat from the next beat time', () => {
    expect(derivePhase(10_000, 10_500, 1000)).toBeCloseTo(0.5, 10);
    expect(derivePhase(10_000, 10_250, 1000)).toBeCloseTo(0.75, 10);
    expect(derivePhase(10_000, 10_000, 1000)).toBe(0);
    // A stale prediction one period behind still lands on the same phase.
    expect(derivePhase(10_000, 9_500, 1000)).toBeCloseTo(0.5, 10);
  });

  test('derivePhase is 0 without a beat grid', () => {
    expect(derivePhase(10_000, 0, 1000)).toBe(0);
    expect(derivePhase(10_000, 10_500, 0)).toBe(0);
  });
});

describe('hold pulse on the continuous pulse', () => {
  test('scales by 1 + (0.06 + 0.06·low)·feel·pulse at the onset', () => {
    expect(at({ hold: 'pulse', ...withOnset() }).scale).toBeCloseTo(1.06, 10);
    expect(at({ hold: 'pulse', ...withOnset(), low: 1 }).scale).toBeCloseTo(1.12, 10);
    expect(at({ hold: 'pulse', ...withOnset(), feel: 1.6 }).scale).toBeCloseTo(1.096, 10);
  });

  test('decays with the pulse: 120 ms after the onset the lift is 1/e of full', () => {
    const t = at({ hold: 'pulse', timeMs: 10_120, lastOnsetAtMs: 10_000 });
    expect(t.scale).toBeCloseTo(1 + 0.06 * Math.exp(-1), 10);
  });

  test('emphasized glyphs get 1.6x the amplitude', () => {
    expect(at({ hold: 'pulse', ...withOnset(), emphasized: true }).scale).toBeCloseTo(
      1 + 0.06 * 1.6,
      10,
    );
  });

  test('the feel coefficient scales the amplitude (tempoFeel table)', () => {
    expect(TEMPO_FEEL_FACTOR).toEqual({ still: 0.5, sway: 1.0, march: 1.3, drive: 1.6 });
    const lift = (feel: number) => at({ hold: 'pulse', ...withOnset(), feel }).scale - 1;
    expect(lift(TEMPO_FEEL_FACTOR.still)).toBeCloseTo(0.03, 10);
    expect(lift(TEMPO_FEEL_FACTOR.drive)).toBeCloseTo(0.096, 10);
  });

  test('the last 15% of the phase pulls back (anticipation) before the beat lands', () => {
    // No onset: the pulse contributes nothing, so the scale is pure anticipation.
    expect(at({ hold: 'pulse', ...withPhase(0.925) }).scale).toBeCloseTo(0.98, 10);
    expect(at({ hold: 'pulse', ...withPhase(0.5) }).scale).toBe(1);
    expect(at({ hold: 'pulse', ...withPhase(0.85) }).scale).toBe(1);
  });
});

test('hold does not apply before the entrance is done', () => {
  const early = at({ entrance: 'fade', elapsedMs: 100, hold: 'pulse', ...withOnset(100) });
  expect(early.scale).toBe(1);
  const done = at({ entrance: 'fade', elapsedMs: 300, hold: 'pulse', ...withOnset(300) });
  expect(done.scale).toBeCloseTo(1.06, 10);
});

test('hold shake moves at most 1.5px, steps with the beat phase, and only while the pulse is hot', () => {
  // Pulse long decayed: no shake even on a grid.
  expect(at({ hold: 'shake', timeMs: 10_000, lastOnsetAtMs: 9_000, ...withPhase(0.5) })).toEqual(
    identity,
  );
  let moved = false;
  for (let step = 0; step < 16; step += 1) {
    const t = at({
      hold: 'shake',
      ...withOnset(),
      ...withPhase(step / 16),
      glyphIndex: 2,
    });
    expect(Math.abs(t.dx)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(t.dy)).toBeLessThanOrEqual(1.5);
    if (t.dx !== 0 || t.dy !== 0) moved = true;
  }
  expect(moved).toBe(true);
  const a = at({ hold: 'shake', ...withOnset(), ...withPhase(0.25), glyphIndex: 0 });
  const b = at({ hold: 'shake', ...withOnset(), ...withPhase(0.25), glyphIndex: 1 });
  expect([a.dx, a.dy]).not.toEqual([b.dx, b.dy]);
});

test('hold breathe rides the continuous phase over a two-bar cycle, 2% + 2%·low', () => {
  const s = (bar: number, phase: number, o: Partial<MotionInput> = {}) =>
    at({ hold: 'breathe', bar, ...withPhase(phase), ...o }).scale;
  expect(s(0, 0)).toBeCloseTo(1, 10);
  expect(s(0, 0.5)).toBeCloseTo(1.02, 10);
  expect(s(1, 0)).toBeCloseTo(1, 10);
  expect(s(1, 0.5)).toBeCloseTo(0.98, 10);
  expect(s(2, 0.5)).toBeCloseTo(s(0, 0.5), 10);
  expect(s(3, 0.5)).toBeCloseTo(s(1, 0.5), 10);
  // low lifts the breathing amplitude to 4%.
  expect(s(0, 0.5, { low: 1 })).toBeCloseTo(1.04, 10);
  // A per-glyph phase offset (the idle grid wave) shifts the cycle.
  expect(s(0, 0, { phaseOffset: 0.25 })).toBeCloseTo(1.02, 10);
  expect(s(0, 0.5, { phaseOffset: 0.25 })).toBeCloseTo(1, 10);
});

test('hold drift amplitude is 2px + 4px·low', () => {
  const maxAt = (low: number) => {
    let max = 0;
    let moved = false;
    for (let ms = 0; ms < 20000; ms += 250) {
      const t = at({ hold: 'drift', elapsedMs: ms, glyphIndex: 2, low });
      max = Math.max(max, Math.abs(t.dx), Math.abs(t.dy));
      if (t.dx !== 0) moved = true;
    }
    expect(moved).toBe(true);
    return max;
  };
  expect(maxAt(0)).toBeLessThanOrEqual(2);
  expect(maxAt(0)).toBeGreaterThan(1.9);
  expect(maxAt(1)).toBeLessThanOrEqual(6);
  expect(maxAt(1)).toBeGreaterThan(5);
});

test('low confidence (< 0.5) damps beat-derived motion to a quarter', () => {
  expect(at({ hold: 'pulse', ...withOnset(), confidence: 0.4 }).scale).toBeCloseTo(1.015, 10);
  expect(at({ hold: 'pulse', ...withOnset(), confidence: 0.5 }).scale).toBeCloseTo(1.06, 10);
  // The anticipation pull-back is beat-derived too.
  expect(at({ hold: 'pulse', ...withPhase(0.925), confidence: 0.4 }).scale).toBeCloseTo(0.995, 10);
  // And so is the breathe wave.
  expect(at({ hold: 'breathe', ...withPhase(0.5), confidence: 0.4 }).scale).toBeCloseTo(1.005, 10);
  for (let step = 0; step < 16; step += 1) {
    const full = at({ hold: 'shake', ...withOnset(), ...withPhase(step / 16) });
    const low = at({ hold: 'shake', ...withOnset(), ...withPhase(step / 16), confidence: 0.1 });
    expect(low.dx).toBeCloseTo(full.dx * 0.25, 10);
    expect(low.dy).toBeCloseTo(full.dy * 0.25, 10);
  }
});

test('entranceDone is true after duration (+ stagger for scatter/trace)', () => {
  expect(entranceDone('cut', 5, 0)).toBe(true);
  expect(entranceDone('drop', 5, 419)).toBe(false);
  expect(entranceDone('drop', 5, 420)).toBe(true);
  expect(entranceDone('fade', 5, 300)).toBe(true);
  expect(entranceDone('scatter', 5, 600 + 160 - 1)).toBe(false);
  expect(entranceDone('scatter', 5, 600 + 160)).toBe(true);
  expect(entranceDone('trace', 5, 500 + 240 - 1)).toBe(false);
  expect(entranceDone('trace', 5, 500 + 240)).toBe(true);
});

describe('anticipation (entrance anchored to a beat head)', () => {
  const drop = (elapsedMs: number, anticipationMs = 200) =>
    at({ entrance: 'drop', elapsedMs, anticipationMs });

  test('before the landing the glyph is on its way in and crouches below scale 1', () => {
    const mid = drop(-100);
    expect(mid.scale).toBeLessThan(1);
    expect(mid.scale).toBeCloseTo(0.92, 5);
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThan(1);
    expect(mid.dy).toBeLessThan(0);
    expect(mid.dy).toBeGreaterThan(-40);
  });

  test('at the landing (elapsed 0) the glyph is home: no offset, fully opaque', () => {
    const landed = drop(0);
    expect(Math.abs(landed.dy)).toBeLessThan(0.01);
    expect(landed.opacity).toBeCloseTo(1, 5);
    expect(landed.scale).toBe(1);
  });

  test('at the start of the anticipation window the glyph is still invisible', () => {
    expect(drop(-200).opacity).toBe(0);
    expect(drop(-200).dy).toBe(-40);
  });

  test('rise lands the same way, from below', () => {
    const landed = at({ entrance: 'rise', elapsedMs: 0, anticipationMs: 250 });
    expect(Math.abs(landed.dy)).toBeLessThan(0.01);
    expect(landed.opacity).toBeCloseTo(1, 5);
    const mid = at({ entrance: 'rise', elapsedMs: -125, anticipationMs: 250 });
    expect(mid.dy).toBeGreaterThan(0);
    expect(mid.dy).toBeLessThan(24);
    expect(mid.scale).toBeLessThan(1);
  });

  test('after the landing the spring settles and the transform reaches identity', () => {
    expect(drop(420)).toEqual(identity);
    expect(at({ entrance: 'rise', elapsedMs: 420, anticipationMs: 250 })).toEqual(identity);
  });

  test('without anticipation a negative elapsed is the old behaviour (not yet there)', () => {
    const t = at({ entrance: 'drop', elapsedMs: -100, anticipationMs: 0 });
    expect(t.opacity).toBe(0);
    expect(t.dy).toBe(-40);
    expect(t.scale).toBe(1);
  });
});

describe('scatter stagger on the beat grid', () => {
  const scatterAt = (glyphIndex: number, elapsedMs: number, glyphCount = 4, periodMs = 1000) =>
    at({ entrance: 'scatter', glyphIndex, glyphCount, elapsedMs, periodMs });

  test('glyphs appear on sixteenth-note delays spread over one beat', () => {
    // 4 glyphs on a 1000ms grid: delays 0 / 250 / 500 / 750.
    expect(scatterAt(1, 249).opacity).toBe(0);
    expect(scatterAt(1, 250).opacity).toBe(0);
    expect(scatterAt(1, 300).opacity).toBeGreaterThan(0);
    expect(scatterAt(3, 749).opacity).toBe(0);
    expect(scatterAt(3, 800).opacity).toBeGreaterThan(0);
    expect(scatterAt(0, 1).opacity).toBeGreaterThan(0);
  });

  test('more than 8 glyphs spread over two beats', () => {
    // 10 glyphs: glyph 5 sits at (5/10)*2 beats = 1000ms.
    expect(scatterAt(5, 999, 10).opacity).toBe(0);
    expect(scatterAt(5, 1050, 10).opacity).toBeGreaterThan(0);
  });

  test('entranceDone accounts for the beat-grid stagger', () => {
    expect(entranceDone('scatter', 4, 600 + 750 - 1, 1000)).toBe(false);
    expect(entranceDone('scatter', 4, 600 + 750, 1000)).toBe(true);
  });

  test('without a grid the fixed 40ms stagger remains', () => {
    expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 119, periodMs: 0 }).opacity).toBe(0);
    expect(at({ entrance: 'scatter', glyphIndex: 3, elapsedMs: 400, periodMs: 0 }).opacity).toBeGreaterThan(0.5);
  });
});

describe('the character wave on hold pulse', () => {
  test('the pulse reaches later glyphs later, travelling over one beat', () => {
    const wave = (glyphIndex: number, timeMs: number) =>
      at({
        hold: 'pulse',
        glyphIndex,
        glyphCount: 4,
        timeMs,
        lastOnsetAtMs: 10_000,
        periodMs: 1000,
      }).scale;
    // At the onset only the first glyph has the pulse.
    expect(wave(0, 10_000)).toBeCloseTo(1.06, 10);
    expect(wave(1, 10_000)).toBe(1);
    expect(wave(2, 10_000)).toBe(1);
    expect(wave(3, 10_000)).toBe(1);
    // 300ms later the wave is on the second glyph, past the first.
    expect(wave(1, 10_300)).toBeGreaterThan(wave(0, 10_300));
    expect(wave(0, 10_300)).toBeGreaterThan(wave(2, 10_300));
    expect(wave(2, 10_300)).toBe(1);
  });

  test('without a grid there is no wave (all glyphs share the pulse)', () => {
    const plain = (glyphIndex: number) =>
      at({ hold: 'pulse', glyphIndex, glyphCount: 4, ...withOnset(), periodMs: 0 }).scale;
    expect(plain(0)).toBeCloseTo(plain(3), 10);
  });
});

describe('exits (derived from the entrance)', () => {
  test('exit kind is derived deterministically from the entrance', () => {
    expect(exitForEntrance('drop')).toBe('fall');
    expect(exitForEntrance('rise')).toBe('rise');
    expect(exitForEntrance('scatter')).toBe('scatter');
    expect(exitForEntrance('trace')).toBe('trace');
    expect(exitForEntrance('fade')).toBe('fade');
    expect(exitForEntrance('cut')).toBe('cut');
  });

  test('cut exits instantly', () => {
    expect(exitDurationMs('cut', 5, 1000)).toBe(0);
    expect(at({ entrance: 'cut', exiting: true, elapsedMs: 0 }).opacity).toBe(0);
  });

  test('a drop line falls downward and fades within the duration', () => {
    const mid = at({ entrance: 'drop', exiting: true, elapsedMs: 160, periodMs: 1000 });
    expect(mid.dy).toBeGreaterThan(0);
    expect(mid.opacity).toBeCloseTo(0.5, 5);
    expect(at({ entrance: 'drop', exiting: true, elapsedMs: 320, periodMs: 1000 }).opacity).toBe(0);
  });

  test('a rise line leaves upward', () => {
    const mid = at({ entrance: 'rise', exiting: true, elapsedMs: 160, periodMs: 1000 });
    expect(mid.dy).toBeLessThan(0);
    expect(mid.opacity).toBeCloseTo(0.5, 5);
  });

  test('a scatter line scatters outward', () => {
    const mid = at({ entrance: 'scatter', exiting: true, elapsedMs: 210, glyphIndex: 2, periodMs: 1000 });
    expect(Math.abs(mid.dx) + Math.abs(mid.dy)).toBeGreaterThan(0);
    expect(mid.opacity).toBeCloseTo(0.5, 5);
    expect(at({ entrance: 'scatter', exiting: true, elapsedMs: 420, periodMs: 1000 }).opacity).toBe(0);
  });

  test('a trace line disappears from the tail first', () => {
    const ops = [0, 1, 2, 3, 4].map(
      (i) => at({ entrance: 'trace', exiting: true, elapsedMs: 100, glyphIndex: i, glyphCount: 5 }).opacity,
    );
    expect(ops[4]).toBeLessThan(1);
    expect(ops[0]).toBe(1);
    for (let i = 1; i < ops.length; i += 1) expect(ops[i]!).toBeLessThanOrEqual(ops[i - 1]!);
    const total = exitDurationMs('trace', 5, 0);
    expect(at({ entrance: 'trace', exiting: true, elapsedMs: total, glyphIndex: 0, glyphCount: 5 }).opacity).toBe(0);
  });

  test('a fade line just fades', () => {
    const mid = at({ entrance: 'fade', exiting: true, elapsedMs: 150, periodMs: 1000 });
    expect(mid).toEqual({ ...identity, opacity: 0.5 });
    expect(at({ entrance: 'fade', exiting: true, elapsedMs: 300, periodMs: 1000 }).opacity).toBe(0);
  });

  test('every exit converges within one beat when a grid exists', () => {
    for (const entrance of ['drop', 'rise', 'scatter', 'trace', 'fade'] as const) {
      expect(exitDurationMs(entrance, 12, 400)).toBeLessThanOrEqual(400);
      expect(exitDurationMs(entrance, 12, 400)).toBeGreaterThan(0);
    }
  });

  test('an exit ignores the entrance and hold entirely', () => {
    const t = at({
      entrance: 'fade',
      hold: 'pulse',
      exiting: true,
      elapsedMs: 150,
      periodMs: 1000,
      ...withOnset(150),
    });
    expect(t.scale).toBe(1);
    expect(t.opacity).toBeCloseTo(0.5, 5);
  });

  test('reduced motion makes an exiting glyph invisible at once', () => {
    expect(
      at({ entrance: 'drop', exiting: true, elapsedMs: 0, reducedMotion: true }).opacity,
    ).toBe(0);
  });
});

describe('the recognition drop', () => {
  test('dropHeadMs is the first beat head at or after the fire time', () => {
    expect(dropHeadMs(10_000, 10_300, 500, 0.9)).toBe(10_300);
    expect(dropHeadMs(10_000, 10_000, 500, 0.9)).toBe(10_000);
    // A stale prediction is carried forward by whole periods.
    expect(dropHeadMs(10_000, 9_400, 500, 0.9)).toBe(10_400);
  });

  test('without a grid, or with low confidence, the drop is immediate', () => {
    expect(dropHeadMs(10_000, 0, 0, 1)).toBe(10_000);
    expect(dropHeadMs(10_000, 10_300, 500, 0.3)).toBe(10_000);
  });

  test('the wait for the head is capped so the whole drop stays inside two seconds', () => {
    expect(DROP_MAX_WAIT_MS).toBeLessThanOrEqual(1000);
    expect(dropHeadMs(10_000, 10_000 + DROP_MAX_WAIT_MS, 1500, 0.9)).toBe(10_000 + DROP_MAX_WAIT_MS);
    expect(dropHeadMs(10_000, 10_000 + DROP_MAX_WAIT_MS + 1, 1500, 0.9)).toBe(10_000);
  });

  test('the idle exit holds still until the beat head, then scatters', () => {
    // The exit clock is anchored at the head: before it (negative elapsed)
    // the glyphs are exactly where they were, fully opaque.
    expect(at({ entrance: 'scatter', exiting: true, elapsedMs: -200, periodMs: 500 })).toEqual(identity);
    expect(at({ entrance: 'scatter', exiting: true, elapsedMs: -1, periodMs: 500, glyphIndex: 3 })).toEqual(identity);
    const mid = at({ entrance: 'scatter', exiting: true, elapsedMs: 210, periodMs: 500, glyphIndex: 2 });
    expect(mid.opacity).toBeCloseTo(0.5, 5);
    expect(Math.abs(mid.dx) + Math.abs(mid.dy)).toBeGreaterThan(0);
    expect(at({ entrance: 'scatter', exiting: true, elapsedMs: 420, periodMs: 500 }).opacity).toBe(0);
  });
});
