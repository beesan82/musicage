import { act, renderHook } from '@testing-library/react-native';
import { RecordingPresets, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { recognizeAudD } from '../auddClient';
import { captureRecognitionClip } from '../captureRecognitionClip';
import { deleteTemporaryRecording } from '../../audio/deleteTemporaryRecording';
import { lookupLrclib } from '../lrclibClient';
import { resolveLyrics } from '../resolveLyrics';
import { getAudDToken } from '../tokenStore';
import type { LyricResult, Track } from '../types';
import { useSongRecognition } from '../useSongRecognition';

jest.mock('expo-audio', () => ({
  RecordingPresets: { LOW_QUALITY: { preset: 'low' } },
  useAudioRecorder: jest.fn(),
}));

jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../../audio/deleteTemporaryRecording', () => ({ deleteTemporaryRecording: jest.fn() }));
jest.mock('../auddClient', () => ({ recognizeAudD: jest.fn() }));
jest.mock('../captureRecognitionClip', () => ({
  MAX_RECOGNITION_SECONDS: 12,
  captureRecognitionClip: jest.fn(),
}));
jest.mock('../lrclibClient', () => ({ lookupLrclib: jest.fn() }));
jest.mock('../resolveLyrics', () => ({ resolveLyrics: jest.fn() }));
jest.mock('../tokenStore', () => ({ getAudDToken: jest.fn() }));

type RecorderDouble = {
  isRecording: boolean;
  uri: string | null;
  stop: jest.Mock;
};

const track: Track = {
  title: 'Test Track',
  artist: 'Test Artist',
  album: null,
  durationSeconds: null,
  timecodeSeconds: 72,
};

const lyricResult: LyricResult = {
  kind: 'plain',
  track,
  text: 'real line',
};

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('useSongRecognition', () => {
  let appStateDescriptor: PropertyDescriptor | undefined;
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  let recorder: RecorderDouble;
  let pauseForRecognition: jest.Mock;
  let resumeAfterRecognition: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    recorder = {
      isRecording: true,
      uri: 'file:///cache/recognition.m4a',
      stop: jest.fn().mockImplementation(async () => {
        recorder.isRecording = false;
      }),
    };
    pauseForRecognition = jest.fn().mockResolvedValue(true);
    resumeAfterRecognition = jest.fn().mockResolvedValue(undefined);

    appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
      writable: true,
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_eventType, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>;
    });

    (useAudioRecorder as jest.Mock).mockReturnValue(recorder);
    (File as unknown as jest.Mock).mockImplementation((uri: string) => ({ uri }));
    (getAudDToken as jest.Mock).mockResolvedValue('owner-token');
    (captureRecognitionClip as jest.Mock).mockResolvedValue({
      uri: 'file:///cache/recognition.m4a',
      captureStartedMonotonicMs: 1234,
    });
    (recognizeAudD as jest.Mock).mockResolvedValue(track);
    (lookupLrclib as jest.Mock).mockResolvedValue({
      instrumental: false,
      syncedLyrics: null,
      plainLyrics: 'real line',
    });
    (resolveLyrics as jest.Mock).mockReturnValue(lyricResult);
  });

  afterEach(() => {
    jest.restoreAllMocks();

    if (appStateDescriptor) {
      Object.defineProperty(AppState, 'currentState', appStateDescriptor);
      appStateDescriptor = undefined;
    }
  });

  function renderRecognition() {
    return renderHook(() => useSongRecognition({ pauseForRecognition, resumeAfterRecognition }));
  }

  it('goes to setup_required without a token and never pauses, records, or fetches', async () => {
    (getAudDToken as jest.Mock).mockResolvedValue(null);
    const { result } = await renderRecognition();

    await act(async () => {
      await result.current.recognize();
    });

    expect(result.current.state.phase).toBe('setup_required');
    expect(result.current.hasToken).toBe(false);
    expect(pauseForRecognition).not.toHaveBeenCalled();
    expect(captureRecognitionClip).not.toHaveBeenCalled();
    expect(recognizeAudD).not.toHaveBeenCalled();
    expect(lookupLrclib).not.toHaveBeenCalled();
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(deleteTemporaryRecording).not.toHaveBeenCalled();
  });

  it('pauses the meter, captures, resumes, resolves once, and deletes the clip on success', async () => {
    const events: string[] = [];
    pauseForRecognition.mockImplementation(async () => {
      events.push('pause-meter');
      return true;
    });
    (captureRecognitionClip as jest.Mock).mockImplementation(async () => {
      events.push('capture');
      return { uri: 'file:///cache/recognition.m4a', captureStartedMonotonicMs: 1234 };
    });
    resumeAfterRecognition.mockImplementation(async () => {
      events.push('resume-meter');
    });
    (File as unknown as jest.Mock).mockImplementation((uri: string) => {
      events.push(`file:${uri}`);
      return { uri };
    });
    (recognizeAudD as jest.Mock).mockImplementation(async () => {
      events.push('audd');
      return track;
    });
    (lookupLrclib as jest.Mock).mockImplementation(async () => {
      events.push('lrclib');
      return { instrumental: false, syncedLyrics: null, plainLyrics: 'real line' };
    });
    (resolveLyrics as jest.Mock).mockImplementation(() => {
      events.push('resolve');
      return lyricResult;
    });
    (deleteTemporaryRecording as jest.Mock).mockImplementation((uri: string) => {
      events.push(`delete:${uri}`);
    });
    const { result } = await renderRecognition();

    await act(async () => {
      await result.current.recognize();
    });

    expect(useAudioRecorder).toHaveBeenCalledWith(RecordingPresets.LOW_QUALITY);
    expect(events).toEqual([
      'pause-meter',
      'capture',
      'resume-meter',
      'file:file:///cache/recognition.m4a',
      'audd',
      'lrclib',
      'resolve',
      'delete:file:///cache/recognition.m4a',
    ]);
    expect(recognizeAudD).toHaveBeenCalledTimes(1);
    expect(lookupLrclib).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ phase: 'idle', result: lyricResult });
  });

  it('resumes the meter and deletes the clip after a provider failure without exposing service details', async () => {
    (recognizeAudD as jest.Mock).mockRejectedValue(new Error('provider-body-that-must-not-leak'));
    const { result } = await renderRecognition();

    await act(async () => {
      await result.current.recognize();
    });

    expect(resumeAfterRecognition).toHaveBeenCalledWith(true);
    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/recognition.m4a');
    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.retryable).toBe(true);
    expect(result.current.state.message).not.toContain('provider-body-that-must-not-leak');
    expect(recognizeAudD).toHaveBeenCalledTimes(1);
  });

  it('stops and deletes the active clip on unmount without starting provider calls afterward', async () => {
    let resolveCapture: ((clip: { uri: string; captureStartedMonotonicMs: number }) => void) | undefined;
    (captureRecognitionClip as jest.Mock).mockImplementation(
      () => new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    const { result, unmount } = await renderRecognition();
    let recognition: Promise<void> | undefined;

    await act(async () => {
      recognition = result.current.recognize();
      await flushMicrotasks();
    });

    await act(async () => {
      unmount();
      await flushMicrotasks();
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/recognition.m4a');

    await act(async () => {
      resolveCapture?.({ uri: 'file:///cache/recognition.m4a', captureStartedMonotonicMs: 1234 });
      await recognition;
    });

    expect(recognizeAudD).not.toHaveBeenCalled();
    expect(lookupLrclib).not.toHaveBeenCalled();
  });

  it('aborts capture and retains the last successful result when the app backgrounds', async () => {
    const { result } = await renderRecognition();

    await act(async () => {
      await result.current.recognize();
    });
    expect(result.current.state.result).toEqual(lyricResult);
    recorder.isRecording = true;
    const stopCallsBeforeBackground = recorder.stop.mock.calls.length;

    let resolveCapture: ((clip: { uri: string; captureStartedMonotonicMs: number }) => void) | undefined;
    (captureRecognitionClip as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    let recognition: Promise<void> | undefined;

    await act(async () => {
      recognition = result.current.recognize();
      await flushMicrotasks();
      appStateListener?.('background');
      await flushMicrotasks();
    });

    expect(recorder.stop).toHaveBeenCalledTimes(stopCallsBeforeBackground + 1);
    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/recognition.m4a');
    expect(result.current.state).toMatchObject({ phase: 'idle', result: lyricResult });

    await act(async () => {
      resolveCapture?.({ uri: 'file:///cache/recognition.m4a', captureStartedMonotonicMs: 1234 });
      await recognition;
    });

    expect(recognizeAudD).toHaveBeenCalledTimes(1);
  });

  it('ignores a second recognition press while capture is in flight', async () => {
    let resolveCapture: ((clip: { uri: string; captureStartedMonotonicMs: number }) => void) | undefined;
    (captureRecognitionClip as jest.Mock).mockImplementation(
      () => new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    const { result } = await renderRecognition();
    let firstRecognition: Promise<void> | undefined;

    await act(async () => {
      firstRecognition = result.current.recognize();
      await flushMicrotasks();
      await result.current.recognize();
    });

    expect(pauseForRecognition).toHaveBeenCalledTimes(1);
    expect(captureRecognitionClip).toHaveBeenCalledTimes(1);
    expect(recognizeAudD).not.toHaveBeenCalled();

    await act(async () => {
      resolveCapture?.({ uri: 'file:///cache/recognition.m4a', captureStartedMonotonicMs: 1234 });
      await firstRecognition;
    });

    expect(recognizeAudD).toHaveBeenCalledTimes(1);
  });
});
