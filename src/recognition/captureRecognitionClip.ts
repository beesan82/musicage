export const MAX_RECOGNITION_SECONDS = 12;

export interface RecognitionRecorder {
  uri: string | null;
  isRecording: boolean;
  prepareToRecordAsync(): Promise<void>;
  record(options: { forDuration: number }): void;
  stop(): Promise<void>;
}

export interface CaptureDeps {
  wait(durationMs: number): Promise<void>;
  now(): number;
  signal?: AbortSignal;
}

export interface CapturedClip {
  uri: string;
  captureStartedMonotonicMs: number;
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
): Promise<CapturedClip> {
  throwIfAborted(deps.signal);
  await recorder.prepareToRecordAsync();
  throwIfAborted(deps.signal);

  const captureStartedMonotonicMs = deps.now();
  recorder.record({ forDuration: MAX_RECOGNITION_SECONDS });
  await deps.wait(MAX_RECOGNITION_SECONDS * 1_000);
  await recorder.stop();

  if (!recorder.uri) {
    throw new Error('Recognition recorder did not produce a file');
  }

  return { uri: recorder.uri, captureStartedMonotonicMs };
}
