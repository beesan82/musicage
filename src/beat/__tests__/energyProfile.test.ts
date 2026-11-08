import {
  createEnergyProfile,
  movingAverage,
  NO_SURGE,
  percentile,
  PROFILE_BINS,
  PROFILE_MAX_WINDOW_MS,
  PROFILE_MIN_WINDOW_MS,
  profileWindowMs,
  smoothSurge,
  SURGE_ATTACK_MS,
  SURGE_MIN_HISTORY_MS,
  SURGE_MIN_SPREAD,
  SURGE_SILENCE_HOLDOFF_MS,
  surgeAllowed,
  surgeStrength,
  type EnergyProfile,
  type EnergySample,
  type Surge,
} from '../energyProfile';

const FRAME_MS = 20;
/** 120 BPM: the 8-bar window is 16 s. */
const PERIOD_MS = 500;
const WINDOW_MS = profileWindowMs(PERIOD_MS);

/** Feeds `level` (as both energy and low) every 20 ms over [fromMs, toMs]; returns the last surge. */
function feed(
  profile: EnergyProfile,
  fromMs: number,
  toMs: number,
  level: number,
  over: Partial<EnergySample> = {},
): Surge {
  let last: Surge = NO_SURGE;
  for (let t = fromMs; t <= toMs; t += FRAME_MS) {
    last = profile.push({
      timestampMs: t,
      energy: level,
      low: level,
      confidence: 0.9,
      silence: false,
      periodMs: PERIOD_MS,
      ...over,
    });
  }
  return last;
}

describe('the pure helpers', () => {
  test('the window is 8 bars of the period, clamped, and 120 BPM without a grid', () => {
    expect(profileWindowMs(500)).toBe(16_000);
    expect(profileWindowMs(null)).toBe(16_000);
    expect(profileWindowMs(1_000)).toBe(PROFILE_MAX_WINDOW_MS);
    expect(profileWindowMs(200)).toBe(PROFILE_MIN_WINDOW_MS);
  });

  test('movingAverage takes the tail of the levels, or all of them while short', () => {
    expect(movingAverage([], 4)).toBe(0);
    expect(movingAverage([0.2, 0.4], 4)).toBeCloseTo(0.3, 10);
    expect(movingAverage([0.9, 0.9, 0.2, 0.4], 2)).toBeCloseTo(0.3, 10);
  });

  test('percentile returns the upper edge of the bin where the cumulative count reaches q', () => {
    const histogram = new Array<number>(PROFILE_BINS).fill(0);
    expect(percentile(histogram, 0, 0.7)).toBe(0);
    histogram[19] = 70;
    histogram[51] = 30;
    expect(percentile(histogram, 100, 0.7)).toBeCloseTo(20 / PROFILE_BINS, 10);
    expect(percentile(histogram, 100, 0.95)).toBeCloseTo(52 / PROFILE_BINS, 10);
  });

  test('surgeStrength ramps from the low quantile to the high one, with a floor on the ramp', () => {
    expect(surgeStrength(0.3, 0.4, 0.8)).toBe(0);
    expect(surgeStrength(0.6, 0.4, 0.8)).toBeCloseTo(0.5, 10);
    expect(surgeStrength(0.9, 0.4, 0.8)).toBe(1);
    // A degenerate distribution still ramps over SURGE_MIN_SPREAD.
    expect(surgeStrength(0.3 + SURGE_MIN_SPREAD / 2, 0.3, 0.3)).toBeCloseTo(0.5, 10);
  });

  test('surgeAllowed needs confidence, the silence hold-off and enough history', () => {
    const ok = { confidence: 0.9, sinceSilenceMs: 20_000, historyMs: 40_000 };
    expect(surgeAllowed(ok)).toBe(true);
    expect(surgeAllowed({ ...ok, confidence: 0.49 })).toBe(false);
    expect(surgeAllowed({ ...ok, sinceSilenceMs: SURGE_SILENCE_HOLDOFF_MS - 1 })).toBe(false);
    expect(surgeAllowed({ ...ok, historyMs: SURGE_MIN_HISTORY_MS - 1 })).toBe(false);
  });

  test('smoothSurge follows the target with a fast attack and a slow release', () => {
    const up = smoothSurge(0, 1, SURGE_ATTACK_MS);
    expect(up).toBeCloseTo(1 - Math.exp(-1), 10);
    const down = smoothSurge(1, 0, SURGE_ATTACK_MS);
    expect(down).toBeGreaterThan(up);
    expect(smoothSurge(0.5, 1, 0)).toBe(0.5);
  });
});

describe('createEnergyProfile', () => {
  // A verse at 0.3 long enough to be a history, then a chorus at 0.8.
  const VERSE_MS = 60_000;

  test('a passage in the top 30% of the song is a surge; the verse before and after is not', () => {
    const profile = createEnergyProfile();
    const verse = feed(profile, 0, VERSE_MS, 0.3);
    expect(verse.active).toBe(false);
    expect(verse.strength).toBe(0);

    const chorus = feed(profile, VERSE_MS + FRAME_MS, VERSE_MS + 20_000, 0.8);
    expect(chorus.active).toBe(true);
    expect(chorus.strength).toBeGreaterThanOrEqual(0.9);

    const back = feed(profile, VERSE_MS + 20_000 + FRAME_MS, VERSE_MS + 40_000, 0.3);
    expect(back.active).toBe(false);
    expect(back.strength).toBe(0);
  });

  test('the detection lags the jump by the moving-average window', () => {
    const profile = createEnergyProfile();
    feed(profile, 0, VERSE_MS, 0.3);
    const T = VERSE_MS + FRAME_MS;
    // Just after the jump the average has barely moved: no surge yet.
    expect(feed(profile, T, T + 200, 0.8).active).toBe(false);
    // One second in it has started to rise but is far from full...
    const early = feed(profile, T + 200 + FRAME_MS, T + 1_000, 0.8);
    expect(early.strength).toBeGreaterThan(0);
    expect(early.strength).toBeLessThan(0.5);
    // ...and it is full once the window has passed.
    const full = feed(profile, T + 1_000 + FRAME_MS, T + WINDOW_MS, 0.8);
    expect(full.strength).toBeCloseTo(1, 5);
  });

  test('no surge within 8 s of silence ending, even in a loud passage', () => {
    const profile = createEnergyProfile();
    feed(profile, 0, VERSE_MS, 0.3);
    const loudEnd = VERSE_MS + 30_000;
    expect(feed(profile, VERSE_MS + FRAME_MS, loudEnd, 0.8).active).toBe(true);

    const silentEnd = loudEnd + 5_000;
    expect(feed(profile, loudEnd + FRAME_MS, silentEnd, 0, { silence: true })).toEqual(NO_SURGE);

    const resumed = silentEnd + FRAME_MS;
    const held = feed(profile, resumed, resumed + 4_000, 0.8);
    expect(held.active).toBe(false);
    expect(held.strength).toBe(0);
    const after = feed(profile, resumed + 4_000 + FRAME_MS, resumed + SURGE_SILENCE_HOLDOFF_MS + 1_000, 0.8);
    expect(after.active).toBe(true);
  });

  test('no surge while the beat confidence is below 0.5; it returns as soon as the beat is trusted', () => {
    const profile = createEnergyProfile();
    feed(profile, 0, VERSE_MS, 0.3);
    const doubtful = feed(profile, VERSE_MS + FRAME_MS, VERSE_MS + 20_000, 0.8, { confidence: 0.3 });
    expect(doubtful.active).toBe(false);
    expect(doubtful.strength).toBe(0);
    const trusted = feed(profile, VERSE_MS + 20_000 + FRAME_MS, VERSE_MS + 20_000 + FRAME_MS, 0.8);
    expect(trusted.active).toBe(true);
  });

  test('a loud start is not a surge while the song has too little history', () => {
    const profile = createEnergyProfile();
    expect(feed(profile, 0, 5_000, 0.1).active).toBe(false);
    // Louder from 5 s to 25 s: the average is the song's maximum, but the
    // distribution is still too shallow to call it the top 30%.
    let anyActive = false;
    for (let t = 5_000 + FRAME_MS; t <= 25_000; t += FRAME_MS) {
      anyActive ||= feed(profile, t, t, 0.8).active;
    }
    expect(anyActive).toBe(false);
  });

  test('silence does not enter the distribution', () => {
    // A song whose first minute is quiet, then a long silence: the silence
    // must not drag the quantiles down and turn the same quiet level into a surge.
    const profile = createEnergyProfile();
    feed(profile, 0, VERSE_MS, 0.3);
    feed(profile, VERSE_MS + FRAME_MS, VERSE_MS + 30_000, 0, { silence: true });
    const resumed = VERSE_MS + 30_000 + FRAME_MS;
    const same = feed(profile, resumed, resumed + 20_000, 0.3);
    expect(same.active).toBe(false);
  });

  test('reset forgets the song and a time jump starts over', () => {
    const profile = createEnergyProfile();
    feed(profile, 0, VERSE_MS, 0.3);
    expect(feed(profile, VERSE_MS + FRAME_MS, VERSE_MS + 20_000, 0.8).active).toBe(true);

    profile.reset();
    expect(feed(profile, 0, 5_000, 0.8).active).toBe(false);

    // A gap longer than a second (the ear paused) also starts over.
    feed(profile, 5_020, 70_000, 0.3);
    expect(feed(profile, 70_020, 90_000, 0.8).active).toBe(true);
    const jumped = feed(profile, 95_000, 96_000, 0.8);
    expect(jumped.active).toBe(false);
  });
});
