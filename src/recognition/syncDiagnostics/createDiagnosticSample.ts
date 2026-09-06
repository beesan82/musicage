import type { CapturedRecognitionClip } from '../captureRecognitionClip';
import type { LrclibLyricsRecord } from '../lrclibClient';
import { parseLrc } from '../lrc';
import type { Track } from '../types';
import { createDiagnosticId, fingerprintSyncedLyrics } from './lyricsFingerprint';
import type { SyncDiagnosticSample } from './types';

export interface DiagnosticRuntimeEvidence {
  capture: CapturedRecognitionClip;
  track: Track | null;
  auddResponseMonotonicMs: number | null;
  lrclib: LrclibLyricsRecord | null;
}

export interface DiagnosticSampleDependencies {
  createId(): string;
  digestLyrics(syncedLyrics: string): Promise<string>;
}

const productionDependencies: DiagnosticSampleDependencies = {
  createId: createDiagnosticId,
  digestLyrics: fingerprintSyncedLyrics,
};

export async function createDiagnosticSample(
  evidence: DiagnosticRuntimeEvidence,
  dependencies: DiagnosticSampleDependencies = productionDependencies,
): Promise<SyncDiagnosticSample> {
  const syncedLyrics = evidence.lrclib?.syncedLyrics;
  const hasSyncedLyrics = typeof syncedLyrics === 'string' && syncedLyrics.trim().length > 0;
  const parsedLines = hasSyncedLyrics ? parseLrc(syncedLyrics) : [];
  const syncedLyricsHash = hasSyncedLyrics
    ? await dependencies.digestLyrics(syncedLyrics)
    : null;

  return {
    schemaVersion: 1,
    id: dependencies.createId(),
    capture: {
      requestedDurationMs: evidence.capture.requestedDurationMs,
      startedMonotonicMs: evidence.capture.startedMonotonicMs,
      endedMonotonicMs: evidence.capture.endedMonotonicMs,
    },
    audd: {
      timecodeRaw: evidence.track?.timecodeRaw ?? null,
      timecodeMs: evidence.track?.timecodeMs ?? null,
      responseMonotonicMs: evidence.auddResponseMonotonicMs,
      title: evidence.track?.title ?? null,
      artist: evidence.track?.artist ?? null,
    },
    lrclib: {
      recordId: evidence.lrclib?.recordId ?? null,
      syncedLineCount: parsedLines.length,
      syncedLyricsHash,
    },
    groundTruth: null,
  };
}
