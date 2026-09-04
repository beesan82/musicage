import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  AudioModule,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
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

describe('useMicrophoneAnalysis', () => {
  let prepareToRecordAsync: jest.Mock;
  let record: jest.Mock;
  let stopRecording: jest.Mock;
  let recorder: {
    isRecording: boolean;
    uri: string | null;
    prepareToRecordAsync: jest.Mock;
    record: jest.Mock;
    stop: jest.Mock;
  };
  let appStateDescriptor: PropertyDescriptor | undefined;
  let appStateListener: ((state: AppStateStatus) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    prepareToRecordAsync = jest.fn().mockResolvedValue(undefined);
    record = jest.fn();
    stopRecording = jest.fn().mockResolvedValue(undefined);
    recorder = {
      isRecording: false,
      uri: 'file:///cache/meter.m4a',
      prepareToRecordAsync,
      record,
      stop: stopRecording,
    };
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
    (useAudioRecorder as jest.Mock).mockReturnValue(recorder);
    (useAudioRecorderState as jest.Mock).mockReturnValue({
      canRecord: true,
      durationMillis: 0,
      isRecording: false,
      mediaServicesDidReset: false,
      metering: -8,
      url: recorder.uri,
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_eventType, listener) => {
      appStateListener = listener;

      return { remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
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
    expect(prepareToRecordAsync.mock.invocationCallOrder[0]).toBeLessThan(
      record.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
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
    expect(result.current.errorMessage).toBe(
      'マイクを開始できませんでした。もう一度試してください。',
    );
  });

  it('deletes the meter segment after an explicit stop', async () => {
    const hook = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await hook.result.current.start();
    });
    recorder.isRecording = true;

    await act(async () => {
      hook.result.current.stop();
    });

    await waitFor(() => {
      expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter.m4a');
    });
    expect(stopRecording).toHaveBeenCalledTimes(1);
  });

  it('deletes the meter segment when the native stop reports an error', async () => {
    stopRecording.mockRejectedValueOnce(new Error('native stop failure'));
    const hook = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await hook.result.current.start();
    });
    recorder.isRecording = true;

    await act(async () => {
      hook.result.current.stop();
    });

    await waitFor(() => {
      expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter.m4a');
    });
  });

  it('deletes the meter segment after an AppState background transition', async () => {
    const hook = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await hook.result.current.start();
    });
    recorder.isRecording = true;

    await act(async () => {
      appStateListener?.('background');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter.m4a');
    });
    expect(stopRecording).toHaveBeenCalledTimes(1);
  });

  it('deletes the active meter segment on unmount', async () => {
    const { result, unmount } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    recorder.isRecording = true;
    unmount();

    await waitFor(() => {
      expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter.m4a');
    });
    expect(stopRecording).toHaveBeenCalledTimes(1);
  });

  it('pauses for recognition and resumes only when the handoff owns an active meter', async () => {
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    recorder.isRecording = true;

    let shouldResume: boolean | undefined;
    await act(async () => {
      shouldResume = await result.current.pauseForRecognition();
    });

    expect(shouldResume).toBe(true);
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/meter.m4a');

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
