import { isClipDurationMs } from './syncDiagnostics/evaluateCalibration';
import type { ClipDurationMs } from './syncDiagnostics/types';

export interface RecognitionRecorder {
  uri: string | null;
  isRecording: boolean;
  prepareToRecordAsync(): Promise<void>;
  record(options: { forDuration: number }): void;
  stop(): Promise<void>;
}

export interface CaptureDeps {
  durationMs: ClipDurationMs;
  wait(durationMs: number): Promise<void>;
  now(): number;
  onCaptureStarted?(startedMonotonicMs: number): void;
  signal?: AbortSignal;
}

export interface CapturedRecognitionClip {
  uri: string;
  requestedDurationMs: ClipDurationMs;
  startedMonotonicMs: number;
  endedMonotonicMs: number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error('Recognition was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

export async function captureRecognitionClip(
  recorder: RecognitionRecorder,
  deps: CaptureDeps,
): Promise<CapturedRecognitionClip> {
  if (!isClipDurationMs(deps.durationMs)) {
    throw new Error('Unsupported recognition clip duration');
  }

  throwIfAborted(deps.signal);
  await recorder.prepareToRecordAsync();
  throwIfAborted(deps.signal);

  const captureStartedMonotonicMs = deps.now();
  deps.onCaptureStarted?.(captureStartedMonotonicMs);
  recorder.record({ forDuration: deps.durationMs / 1_000 });
  await deps.wait(deps.durationMs);
  await recorder.stop();
  const captureEndedMonotonicMs = deps.now();

  if (!recorder.uri) {
    throw new Error('Recognition recorder did not produce a file');
  }

  return {
    uri: recorder.uri,
    requestedDurationMs: deps.durationMs,
    startedMonotonicMs: captureStartedMonotonicMs,
    endedMonotonicMs: captureEndedMonotonicMs,
  };
}
