import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { deleteTemporaryRecording } from './deleteTemporaryRecording';
import { createMeterFeatureProcessor } from './meterFeatureProcessor';
import type { AudioFeatures, MeterFeatureProcessor } from './types';

const METER_RECORDING_OPTIONS = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
};
const METER_SEGMENT_DURATION_MS = 45_000;

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
  pauseForRecognition(): Promise<boolean>;
  resumeAfterRecognition(shouldResume: boolean): Promise<void>;
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
  const processorRef = useRef<MeterFeatureProcessor | null>(null);

  if (processorRef.current === null) {
    processorRef.current = createMeterFeatureProcessor();
  }

  const processor = processorRef.current;
  const meterRecorder = useAudioRecorder(METER_RECORDING_OPTIONS);
  const meterState = useAudioRecorderState(meterRecorder, 120);
  const [status, setStatus] = useState<ListeningStatus>('idle');
  const [features, setFeatures] = useState<AudioFeatures>(() => createSilentFeatures());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusRef = useRef<ListeningStatus>('idle');
  const appStateRef = useRef(AppState.currentState ?? 'active');
  const resumeWhenActiveRef = useRef(false);
  const recognitionPauseRef = useRef(false);
  const startAttemptRef = useRef(0);
  const rotationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const rotateMeterSegmentRef = useRef<((startAttempt: number) => Promise<void>) | null>(null);

  const setListeningStatus = useCallback((nextStatus: ListeningStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const resetFeatures = useCallback(() => {
    processor.reset();
    setFeatures(createSilentFeatures());
  }, [processor]);

  const clearRotationTimer = useCallback(() => {
    if (rotationTimerRef.current !== null) {
      clearTimeout(rotationTimerRef.current);
      rotationTimerRef.current = null;
    }
  }, []);

  const stopAndDeleteMeterSegment = useCallback(() => {
    if (cleanupPromiseRef.current) {
      return cleanupPromiseRef.current;
    }

    clearRotationTimer();
    const uri = meterRecorder.uri;
    const cleanup = (async () => {
      try {
        if (meterRecorder.isRecording) {
          await meterRecorder.stop();
        }
      } finally {
        deleteTemporaryRecording(uri);
      }
    })();

    cleanupPromiseRef.current = cleanup;
    void cleanup.then(
      () => {
        if (cleanupPromiseRef.current === cleanup) {
          cleanupPromiseRef.current = null;
        }
      },
      () => {
        if (cleanupPromiseRef.current === cleanup) {
          cleanupPromiseRef.current = null;
        }
      },
    );

    return cleanup;
  }, [clearRotationTimer, meterRecorder]);

  const scheduleMeterSegmentRotation = useCallback(
    (startAttempt: number) => {
      clearRotationTimer();
      rotationTimerRef.current = setTimeout(() => {
        void rotateMeterSegmentRef.current?.(startAttempt);
      }, METER_SEGMENT_DURATION_MS);
    },
    [clearRotationTimer],
  );

  const startMeterSegment = useCallback(
    async (startAttempt: number): Promise<boolean> => {
      await meterRecorder.prepareToRecordAsync();

      if (
        startAttemptRef.current !== startAttempt ||
        appStateRef.current !== 'active'
      ) {
        deleteTemporaryRecording(meterRecorder.uri);
        return false;
      }

      meterRecorder.record();

      if (
        startAttemptRef.current !== startAttempt ||
        appStateRef.current !== 'active'
      ) {
        await stopAndDeleteMeterSegment();
        return false;
      }

      scheduleMeterSegmentRotation(startAttempt);
      return true;
    },
    [meterRecorder, scheduleMeterSegmentRotation, stopAndDeleteMeterSegment],
  );

  rotateMeterSegmentRef.current = async (startAttempt) => {
    if (
      startAttemptRef.current !== startAttempt ||
      statusRef.current !== 'listening' ||
      appStateRef.current !== 'active'
    ) {
      return;
    }

    try {
      await stopAndDeleteMeterSegment();

      if (startAttemptRef.current !== startAttempt) {
        return;
      }

      await startMeterSegment(startAttempt);
    } catch {
      if (startAttemptRef.current !== startAttempt) {
        return;
      }

      resetFeatures();
      setErrorMessage(MICROPHONE_ERROR_MESSAGE);
      setListeningStatus('error');
    }
  };

  useEffect(() => {
    setFeatures(processor.process(meterState.metering, Date.now()));
  }, [meterState.metering, processor]);

  const stop = useCallback(() => {
    startAttemptRef.current += 1;
    resumeWhenActiveRef.current = false;
    recognitionPauseRef.current = false;
    void stopAndDeleteMeterSegment().catch(() => undefined);
    resetFeatures();
    setErrorMessage(null);
    setListeningStatus('idle');
  }, [resetFeatures, setListeningStatus, stopAndDeleteMeterSegment]);

  const start = useCallback(async () => {
    const startAttempt = startAttemptRef.current + 1;
    startAttemptRef.current = startAttempt;
    setListeningStatus('requesting');
    setErrorMessage(null);

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (
        startAttemptRef.current !== startAttempt ||
        appStateRef.current !== 'active'
      ) {
        return;
      }

      if (!permission.granted) {
        resetFeatures();
        setListeningStatus('denied');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        allowsBackgroundRecording: false,
      });

      if (
        startAttemptRef.current !== startAttempt ||
        appStateRef.current !== 'active'
      ) {
        return;
      }

      const started = await startMeterSegment(startAttempt);

      if (started && startAttemptRef.current === startAttempt) {
        setListeningStatus('listening');
      }
    } catch {
      if (startAttemptRef.current !== startAttempt) {
        return;
      }

      await stopAndDeleteMeterSegment();
      resetFeatures();
      setErrorMessage(MICROPHONE_ERROR_MESSAGE);
      setListeningStatus('error');
    }
  }, [resetFeatures, setListeningStatus, startMeterSegment, stopAndDeleteMeterSegment]);

  const pauseForRecognition = useCallback(async (): Promise<boolean> => {
    if (statusRef.current !== 'listening' || !meterRecorder.isRecording) {
      return false;
    }

    const startAttempt = startAttemptRef.current + 1;
    startAttemptRef.current = startAttempt;
    resumeWhenActiveRef.current = false;
    await stopAndDeleteMeterSegment();

    if (startAttemptRef.current !== startAttempt) {
      return false;
    }

    recognitionPauseRef.current = true;
    resetFeatures();
    setListeningStatus('idle');
    return true;
  }, [meterRecorder, resetFeatures, setListeningStatus, stopAndDeleteMeterSegment]);

  const resumeAfterRecognition = useCallback(
    async (shouldResume: boolean) => {
      if (!shouldResume || !recognitionPauseRef.current) {
        return;
      }

      recognitionPauseRef.current = false;

      if (appStateRef.current === 'active') {
        await start();
      }
    },
    [start],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextAppState;

      if (wasActive && nextAppState !== 'active') {
        startAttemptRef.current += 1;
        const wasListening = statusRef.current === 'listening';
        resumeWhenActiveRef.current = wasListening;

        if (wasListening) {
          void stopAndDeleteMeterSegment().catch(() => undefined);
          resetFeatures();
          setListeningStatus('idle');
        } else if (statusRef.current === 'requesting') {
          resetFeatures();
          setListeningStatus('idle');
        }
      }

      if (nextAppState === 'active' && resumeWhenActiveRef.current) {
        resumeWhenActiveRef.current = false;
        void start();
      }
    });

    return () => {
      startAttemptRef.current += 1;
      clearRotationTimer();
      subscription.remove();
      void stopAndDeleteMeterSegment().catch(() => undefined);
      processor.reset();
    };
  }, [
    clearRotationTimer,
    processor,
    resetFeatures,
    setListeningStatus,
    start,
    stopAndDeleteMeterSegment,
  ]);

  useEffect(() => {
    if (!meterState.mediaServicesDidReset || statusRef.current !== 'listening') {
      return;
    }

    startAttemptRef.current += 1;
    resumeWhenActiveRef.current = false;
    void stopAndDeleteMeterSegment().catch(() => undefined);
    resetFeatures();
    setListeningStatus('idle');
  }, [
    meterState.mediaServicesDidReset,
    resetFeatures,
    setListeningStatus,
    stopAndDeleteMeterSegment,
  ]);

  return {
    status,
    features,
    errorMessage,
    start,
    stop,
    retry: start,
    pauseForRecognition,
    resumeAfterRecognition,
  };
}
