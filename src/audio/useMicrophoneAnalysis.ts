import {
  AudioModule,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import type { AudioStreamBuffer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { createFeatureProcessor } from './featureProcessor';
import type { AudioFeatures, FeatureProcessor } from './types';

export type ListeningStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'denied'
  | 'error';

export interface MicrophoneAnalysis {
  status: ListeningStatus;
  features: AudioFeatures;
  errorMessage: string | null;
  start(): Promise<void>;
  stop(): void;
  retry(): Promise<void>;
}

const MICROPHONE_ERROR_MESSAGE =
  'マイクを開始できませんでした。もう一度試してください。';

function createSilentFeatures(timestampMs = 0): AudioFeatures {
  return {
    timestampMs,
    energy: 0,
    low: 0,
    mid: 0,
    high: 0,
    transient: 0,
    silence: true,
  };
}

export function useMicrophoneAnalysis(): MicrophoneAnalysis {
  const processorRef = useRef<FeatureProcessor | null>(null);

  if (processorRef.current === null) {
    processorRef.current = createFeatureProcessor();
  }

  const processor = processorRef.current;
  const [status, setStatus] = useState<ListeningStatus>('idle');
  const [features, setFeatures] = useState<AudioFeatures>(() => createSilentFeatures());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusRef = useRef<ListeningStatus>('idle');
  const appStateRef = useRef(AppState.currentState ?? 'active');
  const resumeWhenActiveRef = useRef(false);

  const setListeningStatus = useCallback((nextStatus: ListeningStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const resetFeatures = useCallback(() => {
    processor.reset();
    setFeatures(createSilentFeatures());
  }, [processor]);

  const onBuffer = useCallback(
    (buffer: AudioStreamBuffer) => {
      const samples = new Float32Array(buffer.data);
      const nextFeatures = processor.process(
        samples,
        buffer.sampleRate,
        Math.round(buffer.timestamp * 1_000),
      );

      setFeatures(nextFeatures);
    },
    [processor],
  );

  const { stream } = useAudioStream({
    sampleRate: 48_000,
    channels: 1,
    encoding: 'float32',
    onBuffer,
  });

  const stop = useCallback(() => {
    resumeWhenActiveRef.current = false;
    stream.stop();
    resetFeatures();
    setErrorMessage(null);
    setListeningStatus('idle');
  }, [resetFeatures, setListeningStatus, stream]);

  const start = useCallback(async () => {
    setListeningStatus('requesting');
    setErrorMessage(null);

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        resetFeatures();
        setListeningStatus('denied');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
      });
      await stream.start();
      setListeningStatus('listening');
    } catch {
      resetFeatures();
      setErrorMessage(MICROPHONE_ERROR_MESSAGE);
      setListeningStatus('error');
    }
  }, [resetFeatures, setListeningStatus, stream]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextAppState;

      if (wasActive && nextAppState !== 'active') {
        const wasListening = statusRef.current === 'listening';
        resumeWhenActiveRef.current = wasListening;

        if (wasListening) {
          stream.stop();
          resetFeatures();
        }
      }

      if (nextAppState === 'active' && resumeWhenActiveRef.current) {
        resumeWhenActiveRef.current = false;
        void start();
      }
    });

    return () => {
      subscription.remove();
      stream.stop();
      processor.reset();
    };
  }, [processor, resetFeatures, start, stream]);

  return {
    status,
    features,
    errorMessage,
    start,
    stop,
    retry: start,
  };
}
