import {
  captureRecognitionClip,
  MAX_RECOGNITION_SECONDS,
  type RecognitionRecorder,
} from '../captureRecognitionClip';

function createRecorder(uri = 'file:///cache/recognition.m4a'): RecognitionRecorder & {
  prepareToRecordAsync: jest.Mock;
  record: jest.Mock;
  stop: jest.Mock;
} {
  return {
    uri,
    isRecording: false,
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
  };
}

describe('captureRecognitionClip', () => {
  it('records exactly the bounded duration and returns recorder URI plus capture time', async () => {
    const recorder = createRecorder();
    const wait = jest.fn().mockResolvedValue(undefined);

    const clip = await captureRecognitionClip(recorder, { wait, now: () => 1234 });

    expect(MAX_RECOGNITION_SECONDS).toBe(12);
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(recorder.record).toHaveBeenCalledWith({ forDuration: 12 });
    expect(wait).toHaveBeenCalledWith(12_000);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(clip).toEqual({
      uri: 'file:///cache/recognition.m4a',
      captureStartedMonotonicMs: 1234,
    });
  });
});
