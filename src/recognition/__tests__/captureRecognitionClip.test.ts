import {
  captureRecognitionClip,
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
  it('records the selected duration and reports local bounds without a midpoint anchor', async () => {
    const recorder = createRecorder();
    const wait = jest.fn().mockResolvedValue(undefined);
    const now = jest.fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(4_024);
    const onCaptureStarted = jest.fn();

    const clip = await captureRecognitionClip(recorder, {
      durationMs: 3_000,
      wait,
      now,
      onCaptureStarted,
    });

    expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(recorder.record).toHaveBeenCalledWith({ forDuration: 3 });
    expect(wait).toHaveBeenCalledWith(3_000);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(2);
    expect(onCaptureStarted).toHaveBeenCalledWith(1_000);
    expect(clip).toEqual({
      uri: 'file:///cache/recognition.m4a',
      requestedDurationMs: 3_000,
      startedMonotonicMs: 1_000,
      endedMonotonicMs: 4_024,
    });
    expect(clip).not.toHaveProperty('timecodeAnchorMonotonicMs');
  });

  it.each([
    [5_000, 5],
    [7_000, 7],
    [12_000, 12],
  ] as const)('converts %i milliseconds to a %i second recorder duration', async (
    durationMs,
    recorderDurationSeconds,
  ) => {
    const recorder = createRecorder();
    const wait = jest.fn().mockResolvedValue(undefined);

    await captureRecognitionClip(recorder, {
      durationMs,
      wait,
      now: jest.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_000 + durationMs),
    });

    expect(recorder.record).toHaveBeenCalledWith({ forDuration: recorderDurationSeconds });
    expect(wait).toHaveBeenCalledWith(durationMs);
  });

  it('rejects an unsupported requested duration before preparing the recorder', async () => {
    const recorder = createRecorder();

    await expect(captureRecognitionClip(recorder, {
      durationMs: 4_000 as never,
      wait: jest.fn().mockResolvedValue(undefined),
      now: () => 1_000,
    })).rejects.toThrow('Unsupported recognition clip duration');

    expect(recorder.prepareToRecordAsync).not.toHaveBeenCalled();
  });

  it('does not start recording when cancellation happens while native preparation is pending', async () => {
    let finishPreparation: (() => void) | undefined;
    const recorder = createRecorder();
    recorder.prepareToRecordAsync.mockImplementation(
      () => new Promise<void>((resolve) => {
        finishPreparation = resolve;
      }),
    );
    const controller = new AbortController();
    const capture = captureRecognitionClip(recorder, {
      durationMs: 12_000,
      wait: jest.fn().mockResolvedValue(undefined),
      now: () => 1234,
      signal: controller.signal,
    });

    controller.abort();
    finishPreparation?.();

    await expect(capture).rejects.toMatchObject({ name: 'AbortError' });
    expect(recorder.record).not.toHaveBeenCalled();
    expect(recorder.stop).not.toHaveBeenCalled();
  });
});
