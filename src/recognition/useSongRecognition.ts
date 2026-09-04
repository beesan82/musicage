import { RecordingPresets, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { deleteTemporaryRecording } from '../audio/deleteTemporaryRecording';
import { recognizeAudD } from './auddClient';
import {
  captureRecognitionClip,
  type CapturedClip,
} from './captureRecognitionClip';
import { lookupLrclib } from './lrclibClient';
import { resolveLyrics } from './resolveLyrics';
import { getAudDToken } from './tokenStore';
import type { LyricResult, RecognitionViewState } from './types';

const SETUP_REQUIRED_MESSAGE = 'AudDのトークンを設定してください。';
const RECOGNITION_ERROR_MESSAGE = '曲を読み取れませんでした。もう一度試してください。';

export interface MeterRecognitionHandoff {
  pauseForRecognition(): Promise<boolean>;
  resumeAfterRecognition(shouldResume: boolean): Promise<void>;
}

export interface SongRecognition {
  state: RecognitionViewState;
  hasToken: boolean;
  recognize(): Promise<void>;
  retry(): Promise<void>;
  refreshTokenPresence(): Promise<void>;
}

interface ActiveRecognition {
  controller: AbortController;
  clipUri: string | null;
  cancelled: boolean;
  ownsRecorder: boolean;
}

function idleState(result: LyricResult | null): RecognitionViewState {
  return {
    phase: 'idle',
    result,
    message: null,
    retryable: false,
  };
}

function abortError(): Error {
  const error = new Error('Recognition was cancelled.');
  error.name = 'AbortError';
  return error;
}

function waitForDuration(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, durationMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortError(error: unknown, controller: AbortController): boolean {
  return controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
}

function hasUsableToken(token: string | null): token is string {
  return Boolean(token?.trim());
}

function isSuccessfulLyricResult(result: LyricResult): boolean {
  return result.kind !== 'not_recognized';
}

export function useSongRecognition({
  pauseForRecognition,
  resumeAfterRecognition,
}: MeterRecognitionHandoff): SongRecognition {
  const recognitionRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const [state, setState] = useState<RecognitionViewState>(() => idleState(null));
  const [hasToken, setHasToken] = useState(false);
  const mountedRef = useRef(true);
  const appStateRef = useRef(AppState.currentState ?? 'active');
  const activeRecognitionRef = useRef<ActiveRecognition | null>(null);
  const lastSuccessfulResultRef = useRef<LyricResult | null>(null);

  const isActiveRecognition = useCallback((active: ActiveRecognition) => (
    mountedRef.current
    && activeRecognitionRef.current === active
    && !active.cancelled
  ), []);

  const stopAndDeleteRecognitionRecorder = useCallback(async (uri: string | null) => {
    try {
      if (recognitionRecorder.isRecording) {
        await recognitionRecorder.stop();
      }
    } catch {
      // The URI is still deleted below when native stop reports an error.
    } finally {
      try {
        deleteTemporaryRecording(uri);
      } catch {
        // Cleanup is best-effort and must not expose a local URI.
      }
    }
  }, [recognitionRecorder]);

  const cancelActiveRecognition = useCallback((publishIdleState: boolean) => {
    const active = activeRecognitionRef.current;

    if (!active) {
      return;
    }

    active.cancelled = true;
    active.controller.abort();
    activeRecognitionRef.current = null;

    if (active.ownsRecorder) {
      const uri = active.clipUri ?? recognitionRecorder.uri;
      active.clipUri = null;
      void stopAndDeleteRecognitionRecorder(uri);
    }

    if (publishIdleState && mountedRef.current) {
      setState(idleState(lastSuccessfulResultRef.current));
    }
  }, [recognitionRecorder, stopAndDeleteRecognitionRecorder]);

  const refreshTokenPresence = useCallback(async () => {
    try {
      const token = await getAudDToken();

      if (mountedRef.current) {
        setHasToken(hasUsableToken(token));
      }
    } catch {
      if (mountedRef.current) {
        setHasToken(false);
      }
    }
  }, []);

  const recognize = useCallback(async () => {
    if (activeRecognitionRef.current !== null || appStateRef.current !== 'active') {
      return;
    }

    const active: ActiveRecognition = {
      controller: new AbortController(),
      clipUri: null,
      cancelled: false,
      ownsRecorder: false,
    };
    activeRecognitionRef.current = active;
    let clip: CapturedClip | null = null;

    try {
      const token = await getAudDToken();

      if (!isActiveRecognition(active)) {
        return;
      }

      const trimmedToken = token?.trim() ?? '';
      setHasToken(Boolean(trimmedToken));

      if (!trimmedToken) {
        setState({
          phase: 'setup_required',
          result: lastSuccessfulResultRef.current,
          message: SETUP_REQUIRED_MESSAGE,
          retryable: false,
        });
        return;
      }

      let shouldResume = false;
      let pauseCompleted = false;

      try {
        shouldResume = await pauseForRecognition();
        pauseCompleted = true;

        if (!isActiveRecognition(active)) {
          return;
        }

        setState({
          phase: 'capturing',
          result: lastSuccessfulResultRef.current,
          message: null,
          retryable: false,
        });
        active.ownsRecorder = true;
        clip = await captureRecognitionClip(recognitionRecorder, {
          now: () => performance.now(),
          wait: (durationMs) => waitForDuration(durationMs, active.controller.signal),
        });
        active.clipUri = clip.uri;
      } finally {
        if (pauseCompleted && isActiveRecognition(active)) {
          await resumeAfterRecognition(shouldResume);
        }
      }

      if (!isActiveRecognition(active) || !clip) {
        return;
      }

      const file = new File(clip.uri);
      setState({
        phase: 'identifying',
        result: lastSuccessfulResultRef.current,
        message: null,
        retryable: false,
      });
      const track = await recognizeAudD({
        token: trimmedToken,
        file,
        signal: active.controller.signal,
      });

      if (!isActiveRecognition(active)) {
        return;
      }

      if (!track) {
        setState(idleState({ kind: 'not_recognized' }));
        return;
      }

      setState({
        phase: 'resolving_lyrics',
        result: lastSuccessfulResultRef.current,
        message: null,
        retryable: false,
      });
      const record = await lookupLrclib(track, undefined, active.controller.signal);

      if (!isActiveRecognition(active)) {
        return;
      }

      const lyricResult = resolveLyrics(track, record, clip.captureStartedMonotonicMs);

      if (isSuccessfulLyricResult(lyricResult)) {
        lastSuccessfulResultRef.current = lyricResult;
      }

      setState(idleState(lyricResult));
    } catch (error) {
      if (!isActiveRecognition(active)) {
        return;
      }

      if (isAbortError(error, active.controller)) {
        setState(idleState(lastSuccessfulResultRef.current));
      } else {
        setState({
          phase: 'error',
          result: lastSuccessfulResultRef.current,
          message: RECOGNITION_ERROR_MESSAGE,
          retryable: true,
        });
      }
    } finally {
      if (activeRecognitionRef.current === active) {
        activeRecognitionRef.current = null;

        if (active.ownsRecorder) {
          const uri = clip?.uri ?? active.clipUri ?? recognitionRecorder.uri;
          active.clipUri = null;
          await stopAndDeleteRecognitionRecorder(uri);
        }
      }
    }
  }, [
    isActiveRecognition,
    pauseForRecognition,
    recognitionRecorder,
    resumeAfterRecognition,
    stopAndDeleteRecognitionRecorder,
  ]);

  useEffect(() => {
    void refreshTokenPresence();
  }, [refreshTokenPresence]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextAppState;

      if (wasActive && nextAppState !== 'active') {
        cancelActiveRecognition(true);
      }
    });

    return () => {
      mountedRef.current = false;
      cancelActiveRecognition(false);
      subscription.remove();
    };
  }, [cancelActiveRecognition]);

  return {
    state,
    hasToken,
    recognize,
    retry: recognize,
    refreshTokenPresence,
  };
}
