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
}

export interface CapturedClip {
  uri: string;
  captureStartedMonotonicMs: number;
}

export async function captureRecognitionClip(
  recorder: RecognitionRecorder,
  deps: CaptureDeps,
): Promise<CapturedClip> {
  await recorder.prepareToRecordAsync();

  const captureStartedMonotonicMs = deps.now();
  recorder.record({ forDuration: MAX_RECOGNITION_SECONDS });
  await deps.wait(MAX_RECOGNITION_SECONDS * 1_000);
  await recorder.stop();

  if (!recorder.uri) {
    throw new Error('Recognition recorder did not produce a file');
  }

  return { uri: recorder.uri, captureStartedMonotonicMs };
}
