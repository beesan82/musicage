import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { EarModule } from '../../modules/expo-musicage-ear/src';
import { createEarEmitter } from './earStream';
import type { EarStream } from './earStream';
import type { ListeningStatus } from './types';

export interface Ear {
  kind: 'native' | 'meter';
  status: ListeningStatus;
  errorMessage: string | null;
  earStream: EarStream;
  start(): Promise<void>;
  stop(): void;
  retry(): Promise<void>;
  recognizer: EarModule | null;
}

export const NATIVE_EAR_ERROR_COPY: Record<'audio_setup_failed' | 'interrupted', string> = {
  audio_setup_failed: 'マイクを開始できませんでした。もう一度試してください。',
  interrupted: '通話などで音声が中断しました。もう一度試してください。',
};

export function useNativeEar(module: EarModule): Ear {
  const [status, setStatus] = useState<ListeningStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const emitterRef = useRef(createEarEmitter());
  const emitter = emitterRef.current;
  const statusRef = useRef<ListeningStatus>('idle');
  const generationRef = useRef(0);
  const deniedRef = useRef(false);
  const resumeWhenActiveRef = useRef(false);
  const appStateRef = useRef(AppState.currentState ?? 'active');
  const startRef = useRef<(() => Promise<void>) | null>(null);

  const updateStatus = useCallback((next: ListeningStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const stopNative = useCallback(() => {
    void module.stopListening().catch(() => undefined);
  }, [module]);

  const start = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    deniedRef.current = false;
    setErrorMessage(null);
    updateStatus('requesting');

    let failed = false;
    try {
      await module.startListening();
    } catch {
      failed = true;
    }

    if (generationRef.current !== generation) {
      return;
    }

    if (deniedRef.current) {
      updateStatus('denied');
    } else if (failed) {
      setErrorMessage(NATIVE_EAR_ERROR_COPY.audio_setup_failed);
      updateStatus('error');
      // Whatever the native side kept of a half-started engine goes with the
      // error state, so a retry starts from nothing.
      stopNative();
    } else {
      updateStatus('listening');
    }
  }, [module, stopNative, updateStatus]);

  startRef.current = start;

  const stop = useCallback(() => {
    generationRef.current += 1;
    resumeWhenActiveRef.current = false;
    setErrorMessage(null);
    updateStatus('idle');
    stopNative();
  }, [stopNative, updateStatus]);

  useEffect(() => {
    const features = module.addFeaturesListener((frame) => {
      if (statusRef.current === 'listening') {
        emitter.emit(frame);
      }
    });
    const errors = module.addErrorListener(({ code }) => {
      if (code === 'microphone_denied') {
        if (statusRef.current === 'requesting') {
          deniedRef.current = true;
        }
        return;
      }

      if (code === 'audio_setup_failed' || code === 'interrupted') {
        if (statusRef.current !== 'listening' && statusRef.current !== 'requesting') {
          return;
        }

        generationRef.current += 1;
        setErrorMessage(NATIVE_EAR_ERROR_COPY[code]);
        updateStatus('error');
        // The native side may still hold the engine (an interruption keeps
        // it for a resume) or the audio session (a failed resume keeps it):
        // release it so the error state and the native state agree, and
        // the retry starts clean.
        stopNative();
      }
    });

    return () => {
      features.remove();
      errors.remove();
      generationRef.current += 1;
      void module.stopListening().catch(() => undefined);
    };
  }, [emitter, module, stopNative, updateStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextAppState;

      if (wasActive && nextAppState !== 'active') {
        const current = statusRef.current;

        if (current === 'listening' || current === 'requesting') {
          generationRef.current += 1;
          resumeWhenActiveRef.current = current === 'listening';
          updateStatus('idle');
          stopNative();
        }
      }

      if (nextAppState === 'active' && resumeWhenActiveRef.current) {
        resumeWhenActiveRef.current = false;
        void startRef.current?.();
      }
    });

    return () => subscription.remove();
  }, [stopNative, updateStatus]);

  return {
    kind: 'native',
    status,
    errorMessage,
    earStream: emitter,
    start,
    stop,
    retry: start,
    recognizer: module,
  };
}
