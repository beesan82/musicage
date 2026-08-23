import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AudioModule, setAudioModeAsync, useAudioStream } from 'expo-audio';
import type { AudioStreamOptions } from 'expo-audio';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { useMicrophoneAnalysis } from '../useMicrophoneAnalysis';

jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
  setAudioModeAsync: jest.fn(),
  useAudioStream: jest.fn(),
}));

describe('useMicrophoneAnalysis', () => {
  let audioStreamOptions: AudioStreamOptions | undefined;
  let start: jest.Mock;
  let stop: jest.Mock;
  let stream: { start: jest.Mock; stop: jest.Mock };
  let appStateDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    audioStreamOptions = undefined;
    start = jest.fn().mockResolvedValue(undefined);
    stop = jest.fn();
    stream = { start, stop };

    (AudioModule.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    (setAudioModeAsync as jest.Mock).mockResolvedValue(undefined);
    (useAudioStream as jest.Mock).mockImplementation((options: AudioStreamOptions) => {
      audioStreamOptions = options;

      return {
        stream,
        isStreaming: false,
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();

    if (appStateDescriptor) {
      Object.defineProperty(AppState, 'currentState', appStateDescriptor);
      appStateDescriptor = undefined;
    }
  });

  it('starts a PCM stream after microphone permission is granted', async () => {
    const { result } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });

    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsRecording: true,
        playsInSilentMode: true,
      }),
    );
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('listening');
  });

  it('turns microphone PCM buffers into local audio features', async () => {
    const { result } = await renderHook(() => useMicrophoneAnalysis());
    const samples = new Float32Array(2_048).fill(0.5);

    expect(useAudioStream).toHaveBeenCalledTimes(1);

    await act(() => {
      audioStreamOptions?.onBuffer?.({
        data: samples.buffer,
        sampleRate: 48_000,
        channels: 1,
        timestamp: 1,
      });
    });

    expect(audioStreamOptions).toMatchObject({
      sampleRate: 48_000,
      channels: 1,
      encoding: 'float32',
    });
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

    expect(start).not.toHaveBeenCalled();
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

  it('stops the native stream and clears the visual features', async () => {
    const { result } = await renderHook(() => useMicrophoneAnalysis());
    const samples = new Float32Array(2_048).fill(0.5);

    await act(async () => {
      await result.current.start();
      audioStreamOptions?.onBuffer?.({
        data: samples.buffer,
        sampleRate: 48_000,
        channels: 1,
        timestamp: 1,
      });
    });
    await act(() => {
      result.current.stop();
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
    expect(result.current.features.silence).toBe(true);
    expect(result.current.features.energy).toBe(0);
  });

  it('pauses in the background and resumes only after an active listening state', async () => {
    const remove = jest.fn();
    let appStateListener: ((state: AppStateStatus) => void) | undefined;

    appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
      writable: true,
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_eventType, listener) => {
      appStateListener = listener;

      return { remove } as ReturnType<typeof AppState.addEventListener>;
    });

    const { result, unmount } = await renderHook(() => useMicrophoneAnalysis());

    await act(async () => {
      await result.current.start();
    });
    await act(() => {
      appStateListener?.('background');
    });

    expect(stop).toHaveBeenCalledTimes(1);

    await act(() => {
      appStateListener?.('active');
    });
    await waitFor(() => {
      expect(start).toHaveBeenCalledTimes(2);
    });

    await unmount();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
