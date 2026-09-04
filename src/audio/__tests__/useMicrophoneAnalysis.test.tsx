import { act, renderHook } from '@testing-library/react-native';
import {
  AudioModule,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import type { RecorderState, RecordingStatus } from 'expo-audio';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { deleteTemporaryRecording } from '../deleteTemporaryRecording';
import { useMicrophoneAnalysis } from '../useMicrophoneAnalysis';

jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
  RecordingPresets: { LOW_QUALITY: { isMeteringEnabled: false } },
  setAudioModeAsync: jest.fn(),
  useAudioRecorder: jest.fn(),
  useAudioRecorderState: jest.fn(),
}));

jest.mock('../deleteTemporaryRecording', () => ({
  deleteTemporaryRecording: jest.fn(),
}));

type RecorderDouble = {
  id: number;
  isRecording: boolean;
  uri: string | null;
  prepareToRecordAsync: jest.Mock;
  record: jest.Mock;
  stop: jest.Mock;
};

const MICROPHONE_ERROR_MESSAGE =
  'マイクを開始できませんでした。もう一度試してください。';

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useMicrophoneAnalysis', () => {
  let appStateDescriptor: PropertyDescriptor | undefined;
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  let eventLog: string[];
  let prepareToRecordAsync: jest.Mock;
  let record: jest.Mock;
  let recorder: RecorderDouble;
  let meterState: RecorderState;
  let statusListener: ((status: RecordingStatus) => void) | undefined;
  let stopRecording: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    eventLog = [];
    const preparedUris = [
      'file:///cache/meter-a.m4a',
      'file:///cache/meter-b.m4a',
      'file:///cache/meter-c.m4a',
    ];
    let prepareCount = 0;

    prepareToRecordAsync = jest.fn().mockImplementation(async () => {
      recorder.uri = preparedUris[prepareCount] ?? `file:///cache/meter-${prepareCount}.m4a`;
      prepareCount += 1;
      eventLog.push('prepare');
    });
    record = jest.fn(() => {
      recorder.isRecording = true;
      eventLog.push('record');
    });
    stopRecording = jest.fn().mockImplementation(async () => {
      eventLog.push('stop');
      recorder.isRecording = false;
    });
    recorder = {
      id: 1,
      isRecording: false,
      uri: 'file:///cache/meter-a.m4a',
      prepareToRecordAsync,
      record,
      stop: stopRecording,
    };

    (deleteTemporaryRecording as jest.Mock).mockImplementation((uri: string | null) => {
      eventLog.push(`delete:${uri}`);
    });
    appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
      writable: true,
    });
    (AudioModule.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    (setAudioModeAsync as jest.Mock).mockResolvedValue(undefined);
    (useAudioRecorder as jest.Mock).mockImplementation((_options, listener) => {
      statusListener = listener;
      return recorder;
    });
    meterState = {
      canRecord: true,
      durationMillis: 0,
      isRecording: recorder.isRecording,
      mediaServicesDidReset: false,
      metering: -8,
      url: recorder.uri,
    };
    (useAudioRecorderState as jest.Mock).mockImplementation(() => meterState);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_eventType, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();

    if (appStateDescriptor) {
      Object.defineProperty(AppState, 'currentState', appStateDescriptor);
      appStateDescriptor = undefined;
    }
  });

  it('prepares then records with non-silent meter features after permission is granted', async () => {
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    expect(setAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: true,
      allowsBackgroundRecording: false,
      interruptionMode: 'mixWithOthers',
      playsInSilentMode: true,
    });
    expect(useAudioRecorderState).toHaveBeenCalledWith(recorder, 120);
    expect(eventLog).toEqual(['prepare', 'record']);
    expect(recorder.isRecording).toBe(true);
    expect(result.current.status).toBe('listening');
    expect(result.current.features.energy).toBeGreaterThan(0);
    expect(result.current.features.silence).toBe(false);
  });

  it('keeps an ambient-compatible silent state when access is denied', async () => {
    (AudioModule.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    expect(record).not.toHaveBeenCalled();
    expect(result.current.status).toBe('denied');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.features).toMatchObject({
      energy: 0,
      low: 0,
      mid: 0,
      high: 0,
      transient: 0,
      silence: true,
    });
  });

  it('exposes a fixed recovery message when microphone startup fails', async () => {
    (setAudioModeAsync as jest.Mock).mockRejectedValue(new Error('native failure'));
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(MICROPHONE_ERROR_MESSAGE);
  });

  it('rotates one segment in stop, delete, prepare, record order after 45 seconds', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    eventLog = [];

    await act(async () => {
      jest.advanceTimersByTime(45_000);
      await flushMicrotasks();
    });

    expect(eventLog).toEqual([
      'stop',
      'delete:file:///cache/meter-a.m4a',
      'prepare',
      'record',
    ]);
    expect(result.current.status).toBe('listening');
    expect(recorder.isRecording).toBe(true);
  });

  it('waits for a deferred stop before a new explicit start can prepare the shared recorder', async () => {
    let resolveStop: (() => void) | undefined;
    stopRecording.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveStop = () => {
        recorder.isRecording = false;
        resolve();
      };
    }));
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    let restarted: Promise<void> | undefined;
    await act(async () => {
      result.current.stop();
      restarted = result.current.start();
      await flushMicrotasks();
    });

    try {
      expect(prepareToRecordAsync).toHaveBeenCalledTimes(1);
      expect(resolveStop).toBeDefined();
    } finally {
      await act(async () => {
        resolveStop?.();
        await restarted;
      });
    }

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(prepareToRecordAsync).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(2);
    expect(recorder.isRecording).toBe(true);
    expect(result.current.status).toBe('listening');
  });

  it('waits for background cleanup before automatic foreground recovery records again', async () => {
    let resolveStop: (() => void) | undefined;
    stopRecording.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveStop = () => {
        recorder.isRecording = false;
        resolve();
      };
    }));
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      appStateListener?.('background');
      appStateListener?.('active');
      await flushMicrotasks();
    });

    try {
      expect(prepareToRecordAsync).toHaveBeenCalledTimes(1);
      expect(resolveStop).toBeDefined();
    } finally {
      await act(async () => {
        resolveStop?.();
        await flushMicrotasks();
      });
    }

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(prepareToRecordAsync).toHaveBeenCalledTimes(2);
    expect(recorder.isRecording).toBe(true);
    expect(result.current.status).toBe('listening');
  });

  it('cleans the active segment and enters recovery after a native recorder error', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    expect(statusListener).toEqual(expect.any(Function));

    await act(async () => {
      statusListener?.({
        id: 1,
        isFinished: false,
        hasError: true,
        error: 'native interruption',
        url: 'file:///cache/meter-a.m4a',
      });
      await flushMicrotasks();
    });

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(MICROPHONE_ERROR_MESSAGE);
    expect(result.current.features).toMatchObject({ energy: 0, silence: true });

    await act(async () => {
      jest.advanceTimersByTime(45_000);
      await flushMicrotasks();
    });
    expect(prepareToRecordAsync).toHaveBeenCalledTimes(1);
  });

  it('cleans the active segment and enters recovery after a media-services reset', async () => {
    jest.useFakeTimers();
    const { result, rerender } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      meterState = { ...meterState, mediaServicesDidReset: true };
      rerender(undefined);
      await flushMicrotasks();
    });

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(MICROPHONE_ERROR_MESSAGE);
    expect(result.current.features).toMatchObject({ energy: 0, silence: true });

    await act(async () => {
      jest.advanceTimersByTime(45_000);
      await flushMicrotasks();
    });
    expect(prepareToRecordAsync).toHaveBeenCalledTimes(1);
  });

  it('cleans the active segment when the recorder unexpectedly finishes without an error', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      statusListener?.({
        id: 1,
        isFinished: true,
        hasError: false,
        error: null,
        url: 'file:///cache/meter-a.m4a',
      });
      await flushMicrotasks();
    });

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(MICROPHONE_ERROR_MESSAGE);

    await act(async () => {
      jest.advanceTimersByTime(45_000);
      await flushMicrotasks();
    });
    expect(prepareToRecordAsync).toHaveBeenCalledTimes(1);
  });

  it('ignores the expected finished status emitted by its own segment rotation', async () => {
    jest.useFakeTimers();
    stopRecording.mockImplementationOnce(async () => {
      eventLog.push('stop');
      recorder.isRecording = false;
      statusListener?.({
        id: 1,
        isFinished: true,
        hasError: false,
        error: null,
        url: recorder.uri,
      });
    });
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    eventLog = [];

    await act(async () => {
      jest.advanceTimersByTime(45_000);
      await flushMicrotasks();
    });

    expect(eventLog).toEqual([
      'stop',
      'delete:file:///cache/meter-a.m4a',
      'prepare',
      'record',
    ]);
    expect(result.current.status).toBe('listening');
    expect(recorder.isRecording).toBe(true);
  });

  it('deletes and leaves a non-resumable recovery state when recognition pause stop rejects', async () => {
    stopRecording.mockRejectedValueOnce(new Error('native stop failure'));
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    let shouldResume: boolean | undefined;
    await act(async () => {
      shouldResume = await result.current.pauseForRecognition();
    });

    expect(shouldResume).toBe(false);
    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(MICROPHONE_ERROR_MESSAGE);

    await act(async () => {
      await result.current.resumeAfterRecognition(true);
    });
    expect(prepareToRecordAsync).toHaveBeenCalledTimes(1);
  });

  it('restores the fixed startup error after cleanup stop rejects', async () => {
    recorder.isRecording = true;
    stopRecording.mockRejectedValueOnce(new Error('native stop failure'));
    (setAudioModeAsync as jest.Mock).mockRejectedValueOnce(new Error('audio mode failure'));
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(MICROPHONE_ERROR_MESSAGE);
  });

  it('keeps an explicit user stop idle when native stop rejects', async () => {
    stopRecording.mockRejectedValueOnce(new Error('native stop failure'));
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
      await flushMicrotasks();
    });

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(result.current.status).toBe('idle');
  });

  it('keeps a backgrounded recorder idle when native stop rejects', async () => {
    stopRecording.mockRejectedValueOnce(new Error('native stop failure'));
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      appStateListener?.('background');
      await flushMicrotasks();
    });

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(result.current.status).toBe('idle');
  });

  it('deletes the meter segment after an explicit stop and does not revive it from an obsolete timer', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
      await flushMicrotasks();
    });
    await act(async () => {
      jest.advanceTimersByTime(45_000);
      await flushMicrotasks();
    });

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  it('deletes the active meter segment on unmount without letting its timer start another segment', async () => {
    jest.useFakeTimers();
    const { result, unmount } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      unmount();
      await flushMicrotasks();
    });
    await act(async () => {
      jest.advanceTimersByTime(45_000);
      await flushMicrotasks();
    });

    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');
    expect(stopRecording).toHaveBeenCalled();
    expect(eventLog).toEqual(['prepare', 'record', 'stop', 'delete:file:///cache/meter-a.m4a']);
  });

  it('pauses for recognition and resumes only when the handoff owns an active meter', async () => {
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    let shouldResume: boolean | undefined;
    await act(async () => {
      shouldResume = await result.current.pauseForRecognition();
    });

    expect(shouldResume).toBe(true);
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter-a.m4a');

    await act(async () => {
      await result.current.resumeAfterRecognition(true);
    });

    expect(prepareToRecordAsync).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('does not restart a user-stopped meter when recognition has no active handoff', async () => {
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    let shouldResume: boolean | undefined;
    await act(async () => {
      shouldResume = await result.current.pauseForRecognition();
      await result.current.resumeAfterRecognition(true);
    });

    expect(shouldResume).toBe(false);
    expect(prepareToRecordAsync).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
