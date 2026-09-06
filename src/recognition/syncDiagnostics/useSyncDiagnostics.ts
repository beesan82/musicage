import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createDeviceLocalDiagnosticStore,
  type SyncDiagnosticStore,
  type SyncDiagnosticsSnapshot,
} from './diagnosticStore';
import {
  deriveDecision,
  evaluateAllDurations,
  selectPreferredCalibration,
} from './evaluateCalibration';
import type {
  AudDCalibration,
  DurationEvaluation,
  GroundTruth,
  SyncDiagnosticDecision,
  SyncDiagnosticSample,
} from './types';

const FLASH_DURATION_MS = 250;
const LOAD_ERROR_MESSAGE = '診断データを読み込めませんでした。';
const SAVE_ERROR_MESSAGE = '診断データを保存できませんでした。';

export interface SyncDiagnosticsController {
  ready: boolean;
  storageError: string | null;
  samples: readonly SyncDiagnosticSample[];
  evaluations: readonly DurationEvaluation[];
  approvedCalibration: AudDCalibration | null;
  decision: SyncDiagnosticDecision;
  captureFlashVisible: boolean;
  notifyCaptureStarted(startedMonotonicMs: number): void;
  saveTrial(sample: SyncDiagnosticSample, groundTruth: GroundTruth | null): Promise<void>;
  approveRecommendedCalibration(): Promise<void>;
  rejectAudDAsClock(): Promise<void>;
  clearDiagnostics(): Promise<void>;
}

function emptySnapshot(): SyncDiagnosticsSnapshot {
  return {
    schemaVersion: 1,
    samples: [],
    calibrations: [],
    decision: { kind: 'undecided' },
  };
}

function approvalFromSnapshot(snapshot: SyncDiagnosticsSnapshot): AudDCalibration | null {
  const approvedDuration = snapshot.decision.kind === 'approved'
    ? snapshot.decision.clipDurationMs
    : null;

  if (approvedDuration === null) {
    return null;
  }

  return snapshot.calibrations.find(
    (calibration) => calibration.clipDurationMs === approvedDuration,
  ) ?? null;
}

function resultError(error: string): string {
  return error === 'read_failed' ? LOAD_ERROR_MESSAGE : SAVE_ERROR_MESSAGE;
}

export function useSyncDiagnostics(
  suppliedStore?: SyncDiagnosticStore,
): SyncDiagnosticsController {
  const defaultStoreRef = useRef<SyncDiagnosticStore | null>(null);
  const store = suppliedStore ?? (defaultStoreRef.current ??= createDeviceLocalDiagnosticStore());
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [samples, setSamples] = useState<readonly SyncDiagnosticSample[]>([]);
  const [evaluations, setEvaluations] = useState<readonly DurationEvaluation[]>(() =>
    evaluateAllDurations([]),
  );
  const [approvedCalibration, setApprovedCalibration] = useState<AudDCalibration | null>(null);
  const [decision, setDecision] = useState<SyncDiagnosticDecision>({ kind: 'undecided' });
  const [captureFlashVisible, setCaptureFlashVisible] = useState(false);
  const snapshotRef = useRef<SyncDiagnosticsSnapshot>(emptySnapshot());
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySnapshot = useCallback((snapshot: SyncDiagnosticsSnapshot) => {
    snapshotRef.current = snapshot;
    setSamples(snapshot.samples);
    setEvaluations(evaluateAllDurations(snapshot.samples));
    setDecision(snapshot.decision);
    setApprovedCalibration(approvalFromSnapshot(snapshot));
  }, []);

  useEffect(() => {
    let disposed = false;

    void store.load().then((result) => {
      if (disposed) {
        return;
      }

      if (result.ok) {
        applySnapshot(result.snapshot);
        setStorageError(null);
      } else {
        setStorageError(resultError(result.error));
      }

      setReady(true);
    }).catch(() => {
      if (!disposed) {
        setStorageError(LOAD_ERROR_MESSAGE);
        setReady(true);
      }
    });

    return () => {
      disposed = true;
    };
  }, [applySnapshot, store]);

  useEffect(() => () => {
    if (flashTimeoutRef.current !== null) {
      clearTimeout(flashTimeoutRef.current);
    }
  }, []);

  const notifyCaptureStarted = useCallback((startedMonotonicMs: number) => {
    void startedMonotonicMs;
    if (flashTimeoutRef.current !== null) {
      clearTimeout(flashTimeoutRef.current);
    }

    setCaptureFlashVisible(true);
    flashTimeoutRef.current = setTimeout(() => {
      flashTimeoutRef.current = null;
      setCaptureFlashVisible(false);
    }, FLASH_DURATION_MS);
  }, []);

  const saveTrial = useCallback(async (
    sample: SyncDiagnosticSample,
    groundTruth: GroundTruth | null,
  ) => {
    setStorageError(null);
    const result = await store.appendSample({ ...sample, groundTruth });

    if (!result.ok) {
      setStorageError(resultError(result.error));
      return;
    }

    applySnapshot(result.snapshot);
  }, [applySnapshot, store]);

  const approveRecommendedCalibration = useCallback(async () => {
    const recommendation = selectPreferredCalibration(
      evaluateAllDurations(snapshotRef.current.samples),
    );

    if (!recommendation) {
      return;
    }

    setStorageError(null);
    const result = await store.saveDecision({
      ...snapshotRef.current,
      calibrations: [recommendation],
      decision: { kind: 'approved', clipDurationMs: recommendation.clipDurationMs },
    });

    if (!result.ok) {
      setStorageError(resultError(result.error));
      return;
    }

    applySnapshot(result.snapshot);
  }, [applySnapshot, store]);

  const rejectAudDAsClock = useCallback(async () => {
    const evaluations = evaluateAllDurations(snapshotRef.current.samples);

    if (deriveDecision(evaluations).kind !== 'rejected') {
      return;
    }

    setStorageError(null);
    const result = await store.saveDecision({
      ...snapshotRef.current,
      calibrations: [],
      decision: { kind: 'rejected' },
    });

    if (!result.ok) {
      setStorageError(resultError(result.error));
      return;
    }

    applySnapshot(result.snapshot);
  }, [applySnapshot, store]);

  const clearDiagnostics = useCallback(async () => {
    setStorageError(null);
    const result = await store.clear();

    if (!result.ok) {
      setStorageError(resultError(result.error));
      return;
    }

    applySnapshot(result.snapshot);
  }, [applySnapshot, store]);

  return {
    ready,
    storageError,
    samples,
    evaluations,
    approvedCalibration,
    decision,
    captureFlashVisible,
    notifyCaptureStarted,
    saveTrial,
    approveRecommendedCalibration,
    rejectAudDAsClock,
    clearDiagnostics,
  };
}
