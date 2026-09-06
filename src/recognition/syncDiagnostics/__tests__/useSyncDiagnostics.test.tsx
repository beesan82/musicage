import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { SyncDiagnosticStore, SyncDiagnosticsSnapshot } from '../diagnosticStore';
import { validateDiagnosticSample } from '../evaluateCalibration';
import type { ClipDurationMs, GroundTruth, SyncDiagnosticSample } from '../types';
import { useSyncDiagnostics } from '../useSyncDiagnostics';

function sample(
  id: string,
  durationMs: ClipDurationMs,
  offsetMs: number,
  index: number,
  groundTruth: GroundTruth | null = {
    method: 'video-timed-controlled-playback',
    songPositionAtCaptureStartMs: 10_000 + (index % 3) * 20_000,
    observedPrecisionMs: 0,
  },
): SyncDiagnosticSample {
  const songPositionAtCaptureStartMs = groundTruth?.songPositionAtCaptureStartMs ?? 10_000;

  return {
    schemaVersion: 1,
    id,
    capture: {
      requestedDurationMs: durationMs,
      startedMonotonicMs: 1_000 + index * 20_000,
      endedMonotonicMs: 1_000 + index * 20_000 + durationMs,
    },
    audd: {
      timecodeRaw: '01:00',
      timecodeMs: songPositionAtCaptureStartMs + offsetMs,
      responseMonotonicMs: 2_000 + index * 20_000,
      title: `Track ${index % 3}`,
      artist: `Artist ${index % 3}`,
    },
    lrclib: {
      recordId: index,
      syncedLineCount: 2,
      syncedLyricsHash: `hash-${id}`,
    },
    groundTruth,
  };
}

function samplesFor(
  durationMs: ClipDurationMs,
  offsets: readonly number[],
): SyncDiagnosticSample[] {
  return offsets.map((offsetMs, index) => sample(`${durationMs}-${index}`, durationMs, offsetMs, index));
}

function snapshot(
  samples: readonly SyncDiagnosticSample[] = [],
): SyncDiagnosticsSnapshot {
  return {
    schemaVersion: 1,
    samples: [...samples],
    calibrations: [],
    decision: { kind: 'undecided' },
  };
}

function fakeStore(initial: SyncDiagnosticsSnapshot) {
  let current = initial;
  const store: SyncDiagnosticStore = {
    load: jest.fn(async () => ({ ok: true as const, snapshot: current })),
    appendSample: jest.fn(async (nextSample) => {
      current = {
        ...current,
        samples: [...current.samples, nextSample],
        calibrations: [],
        decision: { kind: 'undecided' },
      };
      return { ok: true as const, snapshot: current };
    }),
    saveDecision: jest.fn(async (nextSnapshot) => {
      current = nextSnapshot;
      return { ok: true as const, snapshot: current };
    }),
    clear: jest.fn(async () => {
      current = snapshot();
      return { ok: true as const, snapshot: current };
    }),
  };

  return { store, current: () => current };
}

describe('useSyncDiagnostics', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads local samples and leaves a passing recommendation unapproved until the owner approves it', async () => {
    const diagnostics = fakeStore(snapshot(samplesFor(5_000, Array(9).fill(4_000))));
    const { result } = await renderHook(() => useSyncDiagnostics(diagnostics.store));

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.evaluations.find((evaluation) => evaluation.clipDurationMs === 5_000))
      .toMatchObject({ status: 'passed', validSampleCount: 9 });
    expect(result.current.approvedCalibration).toBeNull();
    expect(result.current.decision).toEqual({ kind: 'undecided' });

    await act(async () => {
      await result.current.approveRecommendedCalibration();
    });

    expect(result.current.approvedCalibration).toMatchObject({
      clipDurationMs: 5_000,
      anchorOffsetMs: 4_000,
      acceptedSampleCount: 9,
    });
    expect(result.current.decision).toEqual({ kind: 'approved', clipDurationMs: 5_000 });
  });

  it('resets an old approval after saving a safe trial with video ground truth', async () => {
    const initial = snapshot(samplesFor(5_000, Array(9).fill(4_000)));
    initial.calibrations = [{
      schemaVersion: 1,
      clipDurationMs: 5_000,
      anchorOffsetMs: 4_000,
      acceptedSampleCount: 9,
    }];
    initial.decision = { kind: 'approved', clipDurationMs: 5_000 };
    const diagnostics = fakeStore(initial);
    const { result } = await renderHook(() => useSyncDiagnostics(diagnostics.store));
    const pending = sample('new-trial', 5_000, 4_000, 10, null);
    const groundTruth: GroundTruth = {
      method: 'video-timed-controlled-playback',
      songPositionAtCaptureStartMs: 50_000,
      observedPrecisionMs: 100,
    };

    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.saveTrial(pending, groundTruth);
    });

    expect(diagnostics.current().samples).toHaveLength(10);
    expect(result.current.approvedCalibration).toBeNull();
    expect(result.current.decision).toEqual({ kind: 'undecided' });
    expect(diagnostics.current().calibrations).toEqual([]);
  });

  it('retains a manual estimate as exploratory evidence but excludes it from accepted counts', async () => {
    const diagnostics = fakeStore(snapshot());
    const { result } = await renderHook(() => useSyncDiagnostics(diagnostics.store));
    const pending = sample('manual-trial', 3_000, 4_000, 0, null);
    const manual: GroundTruth = {
      method: 'manual-estimate',
      songPositionAtCaptureStartMs: 10_000,
      observedPrecisionMs: 100,
    };

    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.saveTrial(pending, manual);
    });

    expect(result.current.samples).toHaveLength(1);
    expect(validateDiagnosticSample(result.current.samples[0]!))
      .toContain('ground_truth_not_video_timed');
    expect(result.current.evaluations.find((evaluation) => evaluation.clipDurationMs === 3_000))
      .toMatchObject({ validSampleCount: 0, status: 'insufficient' });
  });

  it('creates a short visual flash without using its timer as a clock', async () => {
    jest.useFakeTimers();
    const diagnostics = fakeStore(snapshot());
    const { result } = await renderHook(() => useSyncDiagnostics(diagnostics.store));

    await act(async () => {
      result.current.notifyCaptureStarted(55_000);
    });
    expect(result.current.captureFlashVisible).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current.captureFlashVisible).toBe(false);
  });

  it('only persists rejection after every duration is eligible and failed, and clear returns to undecided', async () => {
    const diagnostics = fakeStore(snapshot());
    const { result } = await renderHook(() => useSyncDiagnostics(diagnostics.store));

    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.rejectAudDAsClock();
    });
    expect(diagnostics.store.saveDecision).not.toHaveBeenCalled();

    const failedSamples = ([3_000, 5_000, 7_000, 12_000] as const).flatMap((durationMs) =>
      samplesFor(durationMs, [
        4_000, 4_000, 4_000, 4_000, 4_000,
        4_000, 4_000, 4_000, 5_200,
      ]),
    );
    const failingDiagnostics = fakeStore(snapshot(failedSamples));
    const failing = await renderHook(() => useSyncDiagnostics(failingDiagnostics.store));

    await waitFor(() => expect(failing.result.current.ready).toBe(true));
    await act(async () => {
      await failing.result.current.rejectAudDAsClock();
    });
    expect(failing.result.current.decision).toEqual({ kind: 'rejected' });
    expect(failing.result.current.approvedCalibration).toBeNull();

    await act(async () => {
      await failing.result.current.clearDiagnostics();
    });
    expect(failing.result.current.decision).toEqual({ kind: 'undecided' });
    expect(failing.result.current.approvedCalibration).toBeNull();
  });
});
