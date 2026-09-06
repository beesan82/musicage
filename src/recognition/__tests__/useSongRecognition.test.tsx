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
import { createDiagnosticSample } from '../syncDiagnostics/createDiagnosticSample';
import { validateDiagnosticSample } from '../syncDiagnostics/evaluateCalibration';
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
  captureRecognitionClip: jest.fn(),
}));
jest.mock('../lrclibClient', () => ({ lookupLrclib: jest.fn() }));
jest.mock('../resolveLyrics', () => ({ resolveLyrics: jest.fn() }));
jest.mock('../syncDiagnostics/createDiagnosticSample', () => ({
  createDiagnosticSample: jest.fn(),
}));
jest.mock('../syncDiagnostics/evaluateCalibration', () => ({
  validateDiagnosticSample: jest.fn(),
}));
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
  timecodeRaw: '01:12',
  timecodeMs: 72_000,
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
      requestedDurationMs: 12_000,
      startedMonotonicMs: 1_000,
      endedMonotonicMs: 13_000,
    });
    (recognizeAudD as jest.Mock).mockResolvedValue(track);
    (lookupLrclib as jest.Mock).mockResolvedValue({
      recordId: 42,
      instrumental: false,
      syncedLyrics: null,
      plainLyrics: 'real line',
    });
    (resolveLyrics as jest.Mock).mockReturnValue(lyricResult);
    (createDiagnosticSample as jest.Mock).mockResolvedValue({
      schemaVersion: 1,
      id: 'trial-1',
      capture: {
        requestedDurationMs: 5_000,
        startedMonotonicMs: 10_000,
        endedMonotonicMs: 15_020,
      },
      audd: {
        timecodeRaw: '01:12',
        timecodeMs: 72_000,
        responseMonotonicMs: 15_800,
        title: 'Test Track',
        artist: 'Test Artist',
      },
      lrclib: {
        recordId: 42,
        syncedLineCount: 1,
        syncedLyricsHash: 'safe-hash',
      },
      groundTruth: null,
    });
    (validateDiagnosticSample as jest.Mock).mockReturnValue([
      'missing_ground_truth',
    ]);
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

  it('does not read the AudD token until an owner starts recognition', async () => {
    const { result } = await renderRecognition();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(getAudDToken).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.recognize();
    });

    expect(getAudDToken).toHaveBeenCalledTimes(1);
  });

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

  it('returns to an idle recognition action after a token is saved from setup', async () => {
    (getAudDToken as jest.Mock).mockResolvedValue(null);
    const { result } = await renderRecognition();

    await act(async () => {
      await result.current.recognize();
    });
    expect(result.current.state.phase).toBe('setup_required');

    (getAudDToken as jest.Mock).mockResolvedValue('owner-token');
    await act(async () => {
      await result.current.refreshTokenPresence();
    });

    expect(result.current.hasToken).toBe(true);
    expect(result.current.state).toEqual({
      phase: 'idle',
      result: null,
      message: null,
      retryable: false,
    });
  });

  it('pauses the meter, captures, resumes, resolves once, and deletes the clip on success', async () => {
    const events: string[] = [];
    pauseForRecognition.mockImplementation(async () => {
      events.push('pause-meter');
      return true;
    });
    (captureRecognitionClip as jest.Mock).mockImplementation(async () => {
      events.push('capture');
      return {
        uri: 'file:///cache/recognition.m4a',
        requestedDurationMs: 12_000,
        startedMonotonicMs: 1_000,
        endedMonotonicMs: 13_000,
      };
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
      return {
        recordId: 42,
        instrumental: false,
        syncedLyrics: null,
        plainLyrics: 'real line',
      };
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
    expect(resolveLyrics).toHaveBeenCalledWith(
      track,
      expect.objectContaining({ plainLyrics: 'real line' }),
      {
        clipDurationMs: 12_000,
        captureStartedMonotonicMs: 1_000,
        auddTimecodeMs: 72_000,
      },
    );
    expect(result.current.state).toMatchObject({ phase: 'idle', result: lyricResult });
  });

  it('publishes only a safe pending trial after a diagnostic capture resumes the meter before provider work', async () => {
    const onCaptureStarted = jest.fn();
    const now = jest.spyOn(performance, 'now').mockReturnValue(15_800);
    (captureRecognitionClip as jest.Mock).mockImplementation(async (_recorder, options) => {
      options.onCaptureStarted?.(10_000);
      return {
        uri: 'file:///cache/recognition.m4a',
        requestedDurationMs: 5_000,
        startedMonotonicMs: 10_000,
        endedMonotonicMs: 15_020,
      };
    });
    (lookupLrclib as jest.Mock).mockResolvedValue({
      recordId: 42,
      instrumental: false,
      syncedLyrics: '[01:12.00] private lyric line',
      plainLyrics: 'private lyric line',
    });
    const { result } = await renderRecognition();

    await act(async () => {
      await result.current.recognize({
        mode: 'diagnostic',
        clipDurationMs: 5_000,
        onCaptureStarted,
      });
    });

    expect(onCaptureStarted).toHaveBeenCalledWith(10_000);
    expect(resumeAfterRecognition.mock.invocationCallOrder[0]!)
      .toBeLessThan((recognizeAudD as jest.Mock).mock.invocationCallOrder[0]!);
    expect(createDiagnosticSample).toHaveBeenCalledWith({
      capture: expect.objectContaining({
        requestedDurationMs: 5_000,
        startedMonotonicMs: 10_000,
        endedMonotonicMs: 15_020,
      }),
      track,
      auddResponseMonotonicMs: 15_800,
      lrclib: expect.objectContaining({
        syncedLyrics: '[01:12.00] private lyric line',
        plainLyrics: 'private lyric line',
      }),
    });
    expect(result.current.pendingDiagnosticTrial).toMatchObject({
      sample: {
        capture: {
          requestedDurationMs: 5_000,
          startedMonotonicMs: 10_000,
          endedMonotonicMs: 15_020,
        },
        audd: { responseMonotonicMs: 15_800 },
        groundTruth: null,
      },
      invalidReasons: ['missing_ground_truth'],
    });
    expect(JSON.stringify(result.current.pendingDiagnosticTrial)).not.toContain('file:///');
    expect(JSON.stringify(result.current.pendingDiagnosticTrial)).not.toContain('owner-token');
    expect(JSON.stringify(result.current.pendingDiagnosticTrial)).not.toContain('private lyric line');
    now.mockRestore();
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
    let resolveCapture: ((clip: {
      uri: string;
      requestedDurationMs: number;
      startedMonotonicMs: number;
      endedMonotonicMs: number;
    }) => void) | undefined;
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
      resolveCapture?.({
        uri: 'file:///cache/recognition.m4a',
        requestedDurationMs: 12_000,
        startedMonotonicMs: 1_000,
        endedMonotonicMs: 13_000,
      });
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

    let resolveCapture: ((clip: {
      uri: string;
      requestedDurationMs: number;
      startedMonotonicMs: number;
      endedMonotonicMs: number;
    }) => void) | undefined;
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
      resolveCapture?.({
        uri: 'file:///cache/recognition.m4a',
        requestedDurationMs: 12_000,
        startedMonotonicMs: 1_000,
        endedMonotonicMs: 13_000,
      });
      await recognition;
    });

    expect(recognizeAudD).toHaveBeenCalledTimes(1);
    expect(createDiagnosticSample).not.toHaveBeenCalled();
    expect(result.current.pendingDiagnosticTrial).toBeNull();
  });

  it('cleans a recorder URI that appears after background cancellation during preparation', async () => {
    recorder.uri = null;
    recorder.isRecording = false;
    let resolveCapture: ((clip: {
      uri: string;
      requestedDurationMs: number;
      startedMonotonicMs: number;
      endedMonotonicMs: number;
    }) => void) | undefined;
    (captureRecognitionClip as jest.Mock).mockImplementation(
      () => new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    const { result } = await renderRecognition();
    let recognition: Promise<void> | undefined;

    await act(async () => {
      recognition = result.current.recognize();
      await flushMicrotasks();
      appStateListener?.('background');
      await flushMicrotasks();
    });

    await act(async () => {
      recorder.uri = 'file:///cache/late-recognition.m4a';
      recorder.isRecording = true;
      resolveCapture?.({
        uri: 'file:///cache/late-recognition.m4a',
        requestedDurationMs: 12_000,
        startedMonotonicMs: 1_000,
        endedMonotonicMs: 13_000,
      });
      await recognition;
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/late-recognition.m4a');
    expect(recognizeAudD).not.toHaveBeenCalled();
  });

  it('ignores a second recognition press while capture is in flight', async () => {
    let resolveCapture: ((clip: {
      uri: string;
      requestedDurationMs: number;
      startedMonotonicMs: number;
      endedMonotonicMs: number;
    }) => void) | undefined;
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
      resolveCapture?.({
        uri: 'file:///cache/recognition.m4a',
        requestedDurationMs: 12_000,
        startedMonotonicMs: 1_000,
        endedMonotonicMs: 13_000,
      });
      await firstRecognition;
    });

    expect(recognizeAudD).toHaveBeenCalledTimes(1);
  });

  it('leaves no pending trial after an interrupted diagnostic capture while resuming the meter and deleting audio', async () => {
    let rejectCapture: ((error: Error) => void) | undefined;
    (captureRecognitionClip as jest.Mock).mockImplementation(
      () => new Promise((_resolve, reject) => {
        rejectCapture = reject;
      }),
    );
    const { result } = await renderRecognition();
    let recognition: Promise<void> | undefined;

    await act(async () => {
      recognition = result.current.recognize({
        mode: 'diagnostic',
        clipDurationMs: 5_000,
      });
      await flushMicrotasks();
      const error = new Error('capture interrupted');
      error.name = 'AbortError';
      rejectCapture?.(error);
      await recognition;
    });

    expect(resumeAfterRecognition).toHaveBeenCalledWith(true);
    expect(deleteTemporaryRecording).toHaveBeenCalledWith('file:///cache/recognition.m4a');
    expect(recognizeAudD).not.toHaveBeenCalled();
    expect(result.current.pendingDiagnosticTrial).toBeNull();
  });
});
