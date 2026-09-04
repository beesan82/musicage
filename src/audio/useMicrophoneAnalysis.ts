import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import type { RecordingStatus } from 'expo-audio';
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
  const [status, setStatus] = useState<ListeningStatus>('idle');
  const [features, setFeatures] = useState<AudioFeatures>(() => createSilentFeatures());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState ?? 'active');
  const mountedRef = useRef(true);
  const nativeFailureHandlerRef = useRef<(() => void) | null>(null);
  const recorderIdRef = useRef<string | null>(null);
  const recognitionPauseRef = useRef(false);
  const resumeWhenActiveRef = useRef(false);
  const rotationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotateMeterSegmentRef = useRef<((generation: number) => Promise<void>) | null>(null);
  const recorderOperationRef = useRef<Promise<void>>(Promise.resolve());
  const startAttemptRef = useRef(0);
  const statusRef = useRef<ListeningStatus>('idle');

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

  const onNativeRecorderStatus = useCallback((nativeStatus: RecordingStatus) => {
    const recorderId = recorderIdRef.current;
    const failed = nativeStatus.hasError
      || nativeStatus.error !== null
      || nativeStatus.mediaServicesDidReset === true;

    if (
      !mountedRef.current
      || !failed
      || statusRef.current !== 'listening'
      || (recorderId !== null && nativeStatus.id !== recorderId)
    ) {
      return;
    }

    nativeFailureHandlerRef.current?.();
  }, []);

  const meterRecorder = useAudioRecorder(METER_RECORDING_OPTIONS, onNativeRecorderStatus);
  recorderIdRef.current = meterRecorder.id;
  const meterState = useAudioRecorderState(meterRecorder, 120);

  const runRecorderOperation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const next = recorderOperationRef.current.then(operation, operation);
    recorderOperationRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const stopAndDeleteMeterSegmentInOperation = useCallback(async () => {
    clearRotationTimer();
    const uri = meterRecorder.uri;
    let stopError: unknown;

    if (meterRecorder.isRecording) {
      try {
        await meterRecorder.stop();
      } catch (error) {
        stopError = error;
      }
    }

    try {
      deleteTemporaryRecording(uri);
    } catch (deleteError) {
      if (stopError === undefined) {
        throw deleteError;
      }
    }

    if (stopError !== undefined) {
      throw stopError;
    }
  }, [clearRotationTimer, meterRecorder]);

  const stopAndDeleteMeterSegment = useCallback(
    () => runRecorderOperation(stopAndDeleteMeterSegmentInOperation),
    [runRecorderOperation, stopAndDeleteMeterSegmentInOperation],
  );

  const scheduleMeterSegmentRotation = useCallback(
    (generation: number) => {
      clearRotationTimer();
      rotationTimerRef.current = setTimeout(() => {
        void rotateMeterSegmentRef.current?.(generation);
      }, METER_SEGMENT_DURATION_MS);
    },
    [clearRotationTimer],
  );

  const startMeterSegment = useCallback(
    (generation: number, replaceCurrentSegment = false): Promise<boolean> => runRecorderOperation(
      async () => {
        const canStart = () => (
          mountedRef.current
          && startAttemptRef.current === generation
          && appStateRef.current === 'active'
        );

        if (!canStart()) {
          return false;
        }

        if (replaceCurrentSegment) {
          await stopAndDeleteMeterSegmentInOperation();
        }

        if (!canStart()) {
          return false;
        }

        await meterRecorder.prepareToRecordAsync();

        if (!canStart()) {
          deleteTemporaryRecording(meterRecorder.uri);
          return false;
        }

        meterRecorder.record();

        if (!canStart()) {
          await stopAndDeleteMeterSegmentInOperation();
          return false;
        }

        scheduleMeterSegmentRotation(generation);
        return true;
      },
    ),
    [
      meterRecorder,
      runRecorderOperation,
      scheduleMeterSegmentRotation,
      stopAndDeleteMeterSegmentInOperation,
    ],
  );

  rotateMeterSegmentRef.current = async (generation) => {
    if (
      !mountedRef.current
      || startAttemptRef.current !== generation
      || statusRef.current !== 'listening'
      || appStateRef.current !== 'active'
    ) {
      return;
    }

    try {
      await startMeterSegment(generation, true);
    } catch {
      if (startAttemptRef.current !== generation || !mountedRef.current) {
        return;
      }

      resetFeatures();
      setErrorMessage(MICROPHONE_ERROR_MESSAGE);
      setListeningStatus('error');
    }
  };

  const failNativeRecorderSession = useCallback(() => {
    if (!mountedRef.current || statusRef.current !== 'listening') {
      return;
    }

    startAttemptRef.current += 1;
    recognitionPauseRef.current = false;
    resumeWhenActiveRef.current = false;
    clearRotationTimer();
    resetFeatures();
    setErrorMessage(MICROPHONE_ERROR_MESSAGE);
    setListeningStatus('error');
    void stopAndDeleteMeterSegment().catch(() => undefined);
  }, [clearRotationTimer, resetFeatures, setListeningStatus, stopAndDeleteMeterSegment]);

  nativeFailureHandlerRef.current = failNativeRecorderSession;

  useEffect(() => {
    setFeatures(processor.process(meterState.metering, Date.now()));
  }, [meterState.metering, processor]);

  const stop = useCallback(() => {
    startAttemptRef.current += 1;
    recognitionPauseRef.current = false;
    resumeWhenActiveRef.current = false;
    clearRotationTimer();
    resetFeatures();
    setErrorMessage(null);
    setListeningStatus('idle');
    void stopAndDeleteMeterSegment().catch(() => undefined);
  }, [clearRotationTimer, resetFeatures, setListeningStatus, stopAndDeleteMeterSegment]);

  const start = useCallback(async () => {
    const generation = startAttemptRef.current + 1;
    startAttemptRef.current = generation;
    setListeningStatus('requesting');
    setErrorMessage(null);

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (
        !mountedRef.current
        || startAttemptRef.current !== generation
        || appStateRef.current !== 'active'
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
        !mountedRef.current
        || startAttemptRef.current !== generation
        || appStateRef.current !== 'active'
      ) {
        return;
      }

      const started = await startMeterSegment(generation);

      if (
        started
        && mountedRef.current
        && startAttemptRef.current === generation
      ) {
        setListeningStatus('listening');
      }
    } catch {
      if (startAttemptRef.current !== generation || !mountedRef.current) {
        return;
      }

      try {
        await stopAndDeleteMeterSegment();
      } catch {
        // State repair below is required even when native cleanup fails.
      }

      if (startAttemptRef.current !== generation || !mountedRef.current) {
        return;
      }

      resetFeatures();
      setErrorMessage(MICROPHONE_ERROR_MESSAGE);
      setListeningStatus('error');
    }
  }, [resetFeatures, setListeningStatus, startMeterSegment, stopAndDeleteMeterSegment]);

  const pauseForRecognition = useCallback(async (): Promise<boolean> => {
    if (statusRef.current !== 'listening' || !meterRecorder.isRecording) {
      return false;
    }

    const generation = startAttemptRef.current + 1;
    startAttemptRef.current = generation;
    recognitionPauseRef.current = false;
    resumeWhenActiveRef.current = false;
    clearRotationTimer();

    try {
      await stopAndDeleteMeterSegment();
    } catch {
      if (startAttemptRef.current === generation && mountedRef.current) {
        resetFeatures();
        setErrorMessage(MICROPHONE_ERROR_MESSAGE);
        setListeningStatus('error');
      }
      return false;
    }

    if (startAttemptRef.current !== generation || !mountedRef.current) {
      return false;
    }

    recognitionPauseRef.current = true;
    resetFeatures();
    setListeningStatus('idle');
    return true;
  }, [
    clearRotationTimer,
    meterRecorder,
    resetFeatures,
    setListeningStatus,
    stopAndDeleteMeterSegment,
  ]);

  const resumeAfterRecognition = useCallback(
    async (shouldResume: boolean) => {
      if (!shouldResume || !recognitionPauseRef.current) {
        return;
      }

      recognitionPauseRef.current = false;

      if (mountedRef.current && appStateRef.current === 'active') {
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
          recognitionPauseRef.current = false;
          clearRotationTimer();
          resetFeatures();
          setListeningStatus('idle');
          void stopAndDeleteMeterSegment().catch(() => undefined);
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
      mountedRef.current = false;
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
    if (meterState.mediaServicesDidReset) {
      failNativeRecorderSession();
    }
  }, [failNativeRecorderSession, meterState.mediaServicesDidReset]);

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
