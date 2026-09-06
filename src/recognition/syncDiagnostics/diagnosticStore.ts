import { File, Paths } from 'expo-file-system';

import { isClipDurationMs } from './evaluateCalibration';
import type {
  AudDCalibration,
  ClipDurationMs,
  GroundTruth,
  SyncDiagnosticDecision,
  SyncDiagnosticSample,
} from './types';

export const DIAGNOSTIC_STORE_FILE_NAME = 'musicage-sync-diagnostics-v1.json';

export interface SyncDiagnosticsSnapshot {
  schemaVersion: 1;
  samples: SyncDiagnosticSample[];
  calibrations: AudDCalibration[];
  decision: SyncDiagnosticDecision;
}

export type StoreLoadResult =
  | { ok: true; snapshot: SyncDiagnosticsSnapshot }
  | { ok: false; error: 'read_failed' };

export type StoreWriteResult =
  | { ok: true; snapshot: SyncDiagnosticsSnapshot }
  | { ok: false; error: 'read_failed' | 'write_failed' | 'invalid_sample' | 'invalid_snapshot' };

export interface DiagnosticStoreFile {
  readonly exists: boolean;
  create(options?: { intermediates?: boolean; overwrite?: boolean }): void;
  text(): Promise<string>;
  write(content: string): void;
  delete(): void;
}

export interface SyncDiagnosticStore {
  load(): Promise<StoreLoadResult>;
  appendSample(sample: SyncDiagnosticSample): Promise<StoreWriteResult>;
  saveDecision(snapshot: SyncDiagnosticsSnapshot): Promise<StoreWriteResult>;
  clear(): Promise<StoreWriteResult>;
}

export function createDeviceLocalDiagnosticStore(): SyncDiagnosticStore {
  return createDiagnosticStore(new File(Paths.document, DIAGNOSTIC_STORE_FILE_NAME));
}

export function createDiagnosticStore(file: DiagnosticStoreFile): SyncDiagnosticStore {
  return {
    load: () => loadSnapshot(file),
    async appendSample(sample) {
      if (!isPersistableSample(sample)) {
        return { ok: false, error: 'invalid_sample' };
      }

      const loaded = await loadSnapshot(file);

      if (!loaded.ok) {
        return loaded;
      }

      const snapshot: SyncDiagnosticsSnapshot = {
        ...loaded.snapshot,
        samples: [...loaded.snapshot.samples, sample],
        calibrations: [],
        decision: { kind: 'undecided' },
      };

      return writeSnapshot(file, snapshot);
    },
    async saveDecision(snapshot) {
      if (!isSnapshot(snapshot)) {
        return { ok: false, error: 'invalid_snapshot' };
      }

      const loaded = await loadSnapshot(file);

      if (!loaded.ok) {
        return loaded;
      }

      return writeSnapshot(file, snapshot);
    },
    async clear() {
      const empty = emptySnapshot();

      try {
        if (file.exists) {
          file.delete();
        }

        return { ok: true, snapshot: empty };
      } catch {
        return { ok: false, error: 'write_failed' };
      }
    },
  };
}

function emptySnapshot(): SyncDiagnosticsSnapshot {
  return {
    schemaVersion: 1,
    samples: [],
    calibrations: [],
    decision: { kind: 'undecided' },
  };
}

async function loadSnapshot(file: DiagnosticStoreFile): Promise<StoreLoadResult> {
  if (!file.exists) {
    return { ok: true, snapshot: emptySnapshot() };
  }

  try {
    const parsed: unknown = JSON.parse(await file.text());

    return isSnapshot(parsed)
      ? { ok: true, snapshot: parsed }
      : { ok: false, error: 'read_failed' };
  } catch {
    return { ok: false, error: 'read_failed' };
  }
}

function writeSnapshot(
  file: DiagnosticStoreFile,
  snapshot: SyncDiagnosticsSnapshot,
): StoreWriteResult {
  try {
    if (!file.exists) {
      file.create({ intermediates: true });
    }

    file.write(JSON.stringify(snapshot));
    return { ok: true, snapshot };
  } catch {
    return { ok: false, error: 'write_failed' };
  }
}

function isSnapshot(value: unknown): value is SyncDiagnosticsSnapshot {
  if (!isRecord(value) || !hasOnlyKeys(value, ['schemaVersion', 'samples', 'calibrations', 'decision'])) {
    return false;
  }

  if (value.schemaVersion !== 1 || !Array.isArray(value.samples) || !Array.isArray(value.calibrations)) {
    return false;
  }

  return value.samples.every(isPersistableSample)
    && value.calibrations.length <= 1
    && value.calibrations.every(isCalibration)
    && isDecision(value.decision, value.calibrations);
}

function isPersistableSample(value: unknown): value is SyncDiagnosticSample {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'schemaVersion', 'id', 'capture', 'audd', 'lrclib', 'groundTruth',
  ])) {
    return false;
  }

  return value.schemaVersion === 1
    && isNonEmptyString(value.id)
    && isCapture(value.capture)
    && isAudDEvidence(value.audd)
    && isLrclibEvidence(value.lrclib)
    && isGroundTruth(value.groundTruth);
}

function isCapture(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'requestedDurationMs', 'startedMonotonicMs', 'endedMonotonicMs',
  ])) {
    return false;
  }

  return isClipDurationMs(value.requestedDurationMs)
    && isNonNegativeFinite(value.startedMonotonicMs)
    && isNonNegativeFinite(value.endedMonotonicMs)
    && value.endedMonotonicMs >= value.startedMonotonicMs;
}

function isAudDEvidence(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'timecodeRaw', 'timecodeMs', 'responseMonotonicMs', 'title', 'artist',
  ])) {
    return false;
  }

  return isNullableString(value.timecodeRaw)
    && isNullableNonNegativeFinite(value.timecodeMs)
    && isNullableNonNegativeFinite(value.responseMonotonicMs)
    && isNullableString(value.title)
    && isNullableString(value.artist);
}

function isLrclibEvidence(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'recordId', 'syncedLineCount', 'syncedLyricsHash',
  ])) {
    return false;
  }

  return isNullableFinite(value.recordId)
    && isNonNegativeInteger(value.syncedLineCount)
    && isNullableString(value.syncedLyricsHash);
}

function isGroundTruth(value: unknown): value is GroundTruth | null {
  if (value === null) {
    return true;
  }

  if (!isRecord(value) || !hasOnlyKeys(value, [
    'songPositionAtCaptureStartMs', 'method', 'observedPrecisionMs',
  ])) {
    return false;
  }

  return (value.method === 'video-timed-controlled-playback' || value.method === 'manual-estimate')
    && isNonNegativeFinite(value.songPositionAtCaptureStartMs)
    && isNonNegativeFinite(value.observedPrecisionMs);
}

function isCalibration(value: unknown): value is AudDCalibration {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'schemaVersion', 'clipDurationMs', 'anchorOffsetMs', 'acceptedSampleCount',
  ])) {
    return false;
  }

  return value.schemaVersion === 1
    && isClipDurationMs(value.clipDurationMs)
    && isFiniteNumber(value.anchorOffsetMs)
    && isNonNegativeInteger(value.acceptedSampleCount);
}

function isDecision(
  value: unknown,
  calibrations: readonly AudDCalibration[],
): value is SyncDiagnosticDecision {
  if (!isRecord(value)) {
    return false;
  }

  if (value.kind === 'undecided' || value.kind === 'rejected') {
    return hasOnlyKeys(value, ['kind']) && calibrations.length === 0;
  }

  return value.kind === 'approved'
    && hasOnlyKeys(value, ['kind', 'clipDurationMs'])
    && isClipDurationMs(value.clipDurationMs)
    && calibrations.length === 1
    && calibrations[0]?.clipDurationMs === value.clipDurationMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && isNonNegativeFinite(value);
}

function isNullableFinite(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function isNullableNonNegativeFinite(value: unknown): boolean {
  return value === null || isNonNegativeFinite(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
