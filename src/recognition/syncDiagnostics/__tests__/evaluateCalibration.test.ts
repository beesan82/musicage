import {
  deriveDecision,
  evaluateAllDurations,
  evaluateDuration,
  isClipDurationMs,
  selectPreferredCalibration,
  validateDiagnosticSample,
} from '../evaluateCalibration';
import {
  ClipDurationMs,
  GroundTruth,
  SyncDiagnosticSample,
} from '../types';

type SampleOverrides = Omit<
  Partial<SyncDiagnosticSample>,
  'capture' | 'audd' | 'lrclib' | 'groundTruth'
> & {
  capture?: Partial<SyncDiagnosticSample['capture']>;
  audd?: Partial<SyncDiagnosticSample['audd']>;
  lrclib?: Partial<SyncDiagnosticSample['lrclib']>;
  groundTruth?: GroundTruth | null;
};

function sample(overrides: SampleOverrides = {}): SyncDiagnosticSample {
  const base: SyncDiagnosticSample = {
    schemaVersion: 1,
    id: 'sample-1',
    capture: {
      requestedDurationMs: 3_000,
      startedMonotonicMs: 1_000,
      endedMonotonicMs: 4_020,
    },
    audd: {
      timecodeRaw: '00:14',
      timecodeMs: 14_000,
      responseMonotonicMs: 4_600,
      title: 'Track 1',
      artist: 'Artist 1',
    },
    lrclib: {
      recordId: 42,
      syncedLineCount: 12,
      syncedLyricsHash: 'sha256:sample',
    },
    groundTruth: {
      method: 'video-timed-controlled-playback',
      songPositionAtCaptureStartMs: 10_000,
      observedPrecisionMs: 0,
    },
  };

  return {
    ...base,
    ...overrides,
    capture: { ...base.capture, ...overrides.capture },
    audd: { ...base.audd, ...overrides.audd },
    lrclib: { ...base.lrclib, ...overrides.lrclib },
    groundTruth: overrides.groundTruth === undefined
      ? base.groundTruth
      : overrides.groundTruth,
  };
}

function samplesAtDuration(
  durationMs: ClipDurationMs,
  offsets: readonly number[],
  options: {
    trackCount?: number;
    precisionMs?: number;
    titlePrefix?: string;
  } = {},
): SyncDiagnosticSample[] {
  const trackCount = options.trackCount ?? 3;
  const precisionMs = options.precisionMs ?? 0;
  const titlePrefix = options.titlePrefix ?? 'Track';

  return offsets.map((offset, index) => {
    const songPositionAtCaptureStartMs = 10_000 + (index % 3) * 20_000;
    const trackNumber = index % trackCount;

    return sample({
      id: `${durationMs}-${titlePrefix}-${index}`,
      capture: {
        requestedDurationMs: durationMs,
        startedMonotonicMs: 1_000 + index * 50_000,
        endedMonotonicMs: 1_000 + index * 50_000 + durationMs,
      },
      audd: {
        timecodeMs: songPositionAtCaptureStartMs + offset,
        title: `${titlePrefix} ${trackNumber}`,
        artist: `Artist ${trackNumber}`,
      },
      groundTruth: {
        method: 'video-timed-controlled-playback',
        songPositionAtCaptureStartMs,
        observedPrecisionMs: precisionMs,
      },
    });
  });
}

describe('evaluateCalibration', () => {
  it('uses a median anchor offset and the defined p90 index for an eligible duration', () => {
    const samples = samplesAtDuration(3_000, [
      4_000, 4_100, 3_900, 4_000, 4_050, 3_950, 4_000, 4_000, 4_000,
    ]);

    const summary = evaluateDuration(samples, 3_000);

    expect(summary).toMatchObject({
      clipDurationMs: 3_000,
      status: 'passed',
      validSampleCount: 9,
      medianAnchorOffsetMs: 4_000,
    });
    expect(summary.p90AbsoluteResidualMs).toBe(100);
    expect(summary.maxAbsoluteResidualMs).toBe(100);
  });

  it('validates only supported selected recording durations', () => {
    expect(isClipDurationMs(3_000)).toBe(true);
    expect(isClipDurationMs(4_000)).toBe(false);
    expect(isClipDurationMs('3000')).toBe(false);

    const malformed = sample({
      capture: {
        requestedDurationMs: 4_000 as ClipDurationMs,
      },
    });

    expect(validateDiagnosticSample(malformed)).toContain('unsupported_clip_duration');
  });

  it('requires video ground truth, safe evidence, and sane numeric capture fields', () => {
    expect(validateDiagnosticSample(sample({
      audd: { timecodeMs: null },
    }))).toContain('missing_timecode');

    expect(validateDiagnosticSample(sample({
      groundTruth: {
        method: 'manual-estimate',
        songPositionAtCaptureStartMs: 10_000,
        observedPrecisionMs: 100,
      },
    }))).toContain('ground_truth_not_video_timed');

    expect(validateDiagnosticSample(sample({
      capture: {
        startedMonotonicMs: 100,
        endedMonotonicMs: 99,
      },
    }))).toContain('invalid_capture_range');

    expect(validateDiagnosticSample(sample({
      capture: { startedMonotonicMs: Number.NaN },
    }))).toContain('invalid_capture_start');

    expect(validateDiagnosticSample(sample({
      capture: { endedMonotonicMs: Number.POSITIVE_INFINITY },
    }))).toContain('invalid_capture_end');

    expect(validateDiagnosticSample(sample({
      groundTruth: {
        method: 'video-timed-controlled-playback',
        songPositionAtCaptureStartMs: -1,
        observedPrecisionMs: 0,
      },
    }))).toContain('invalid_ground_truth_position');

    expect(validateDiagnosticSample(sample({
      groundTruth: {
        method: 'video-timed-controlled-playback',
        songPositionAtCaptureStartMs: 10_000,
        observedPrecisionMs: Number.NaN,
      },
    }))).toContain('invalid_observed_precision');

    expect(validateDiagnosticSample(sample({
      audd: { title: ' ', artist: null },
      lrclib: { syncedLineCount: 0, syncedLyricsHash: null },
      groundTruth: null,
    }))).toEqual(expect.arrayContaining([
      'missing_track',
      'missing_synced_lyrics',
      'missing_ground_truth',
    ]));
  });

  it('allows exactly 90 percent of valid residuals within their individual tolerance', () => {
    const summary = evaluateDuration(samplesAtDuration(3_000, [
      4_000, 4_000, 4_000, 4_000, 4_000,
      4_000, 4_000, 4_000, 4_000, 4_700,
    ]), 3_000);

    expect(summary).toMatchObject({
      status: 'passed',
      validSampleCount: 10,
      withinToleranceCount: 9,
      hardLimitViolationCount: 0,
    });
  });

  it('rejects an eligible duration when a residual exceeds its hard limit', () => {
    const summary = evaluateDuration(samplesAtDuration(3_000, [
      4_000, 4_000, 4_000, 4_000, 4_000,
      4_000, 4_000, 4_000, 5_200,
    ]), 3_000);

    expect(summary).toMatchObject({
      status: 'failed',
      hardLimitViolationCount: 1,
      maxAbsoluteResidualMs: 1_200,
    });
  });

  it('leaves a duration insufficient until it has nine valid samples over three tracks and three positions', () => {
    const insufficient = evaluateDuration(
      samplesAtDuration(3_000, Array(9).fill(4_000), { trackCount: 2 }),
      3_000,
    );
    const eligible = evaluateDuration(
      samplesAtDuration(3_000, Array(9).fill(4_000), { trackCount: 3 }),
      3_000,
    );

    expect(insufficient).toMatchObject({
      status: 'insufficient',
      validSampleCount: 9,
      uniqueTrackCount: 2,
      uniquePositionCount: 3,
    });
    expect(eligible).toMatchObject({
      status: 'passed',
      validSampleCount: 9,
      uniqueTrackCount: 3,
      uniquePositionCount: 3,
    });
  });

  it('excludes retained invalid samples from residual math', () => {
    const samples = [
      ...samplesAtDuration(3_000, Array(8).fill(4_000)),
      sample({
        id: 'missing-timecode',
        audd: { timecodeMs: null },
      }),
    ];

    const summary = evaluateDuration(samples, 3_000);

    expect(summary).toMatchObject({
      status: 'insufficient',
      totalSampleCount: 9,
      validSampleCount: 8,
      medianAnchorOffsetMs: null,
    });
  });

  it('chooses the shortest passing duration and rejects only after every duration is eligible and failed', () => {
    const evaluations = evaluateAllDurations([
      ...samplesAtDuration(5_000, Array(9).fill(4_100), { titlePrefix: 'Five' }),
      ...samplesAtDuration(7_000, Array(9).fill(4_200), { titlePrefix: 'Seven' }),
      ...samplesAtDuration(12_000, Array(9).fill(4_300), { titlePrefix: 'Twelve' }),
    ]);

    expect(selectPreferredCalibration(evaluations)).toEqual({
      schemaVersion: 1,
      clipDurationMs: 5_000,
      anchorOffsetMs: 4_100,
      acceptedSampleCount: 9,
    });
    expect(deriveDecision(evaluations)).toEqual({ kind: 'undecided' });

    const allEligibleFailures = evaluateAllDurations(
      ([3_000, 5_000, 7_000, 12_000] as const).flatMap((durationMs) =>
        samplesAtDuration(durationMs, [
          4_000, 4_000, 4_000, 4_000, 4_000,
          4_000, 4_000, 4_000, 5_200,
        ], { titlePrefix: `Failed ${durationMs}` }),
      ),
    );

    expect(selectPreferredCalibration(allEligibleFailures)).toBeNull();
    expect(deriveDecision(allEligibleFailures)).toEqual({ kind: 'rejected' });
  });
});
