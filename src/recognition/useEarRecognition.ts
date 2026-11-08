import { useCallback, useEffect, useRef, useState } from 'react';

import type { EarModule } from '../../modules/expo-musicage-ear/src';
import type { ListeningStatus } from '../audio/types';
import { anchorFromRecognition } from '../sync/lyricClock';
import { LrclibRequestError, lookupLrclib } from './lrclibClient';
import { RECOGNITION_COPY } from './recognitionCopy';
import { resolveLyrics } from './resolveLyrics';
import { trackFromRecognition, type RecognitionViewState } from './types';

export const MATCH_TIMEOUT_MS = 20_000;

export interface EarRecognitionController {
  state: RecognitionViewState;
  recognize(): void;
  cancel(): void;
}

const IDLE: RecognitionViewState = { phase: 'idle', result: null, message: null, retryable: false };
const UNAVAILABLE: RecognitionViewState = {
  phase: 'unavailable',
  result: null,
  message: RECOGNITION_COPY.unavailable,
  retryable: false,
};

interface Attempt {
  id: number;
  controller: AbortController;
}

export function useEarRecognition(
  recognizer: EarModule | null,
  earStatus: ListeningStatus,
): EarRecognitionController {
  const [state, setState] = useState<RecognitionViewState>(IDLE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeRef = useRef<Attempt | null>(null);
  const nextIdRef = useRef(0);
  const earStatusRef = useRef(earStatus);
  earStatusRef.current = earStatus;
  const previousStatusRef = useRef(earStatus);

  const cancel = useCallback(() => {
    const active = activeRef.current;
    if (!recognizer) return;
    activeRef.current = null;
    if (active) {
      active.controller.abort();
      setState((s) =>
        s.phase === 'listening' || s.phase === 'resolving_lyrics' ? { ...s, phase: 'idle' } : s,
      );
    }
    recognizer.cancelMatch().catch(() => undefined);
  }, [recognizer]);

  const recognize = useCallback(() => {
    if (!recognizer || activeRef.current) return;
    const attempt: Attempt = { id: ++nextIdRef.current, controller: new AbortController() };
    activeRef.current = attempt;
    setState((s) => ({ ...s, phase: 'listening', message: null, retryable: false }));
    recognizer.listenForMatch(MATCH_TIMEOUT_MS).catch(() => {
      if (activeRef.current !== attempt) return;
      activeRef.current = null;
      setState((s) => ({
        phase: 'idle',
        result: s.result,
        message: RECOGNITION_COPY.match_failed,
        retryable: true,
      }));
    });
  }, [recognizer]);

  useEffect(() => {
    if (!recognizer) return undefined;

    const isLive = (attempt: Attempt | null): attempt is Attempt =>
      attempt !== null && activeRef.current === attempt && earStatusRef.current === 'listening';

    const recognitionSub = recognizer.addRecognitionListener((r) => {
      const attempt = activeRef.current;
      if (!isLive(attempt)) return;

      const current = stateRef.current.result;
      if (current?.kind === 'timestamped' && current.track.trackId === r.trackId) {
        activeRef.current = null;
        setState({
          phase: 'idle',
          result: { ...current, anchor: anchorFromRecognition(r) },
          message: null,
          retryable: false,
        });
        return;
      }

      const track = trackFromRecognition(r);
      setState((s) => ({ ...s, phase: 'resolving_lyrics', message: null, retryable: false }));
      lookupLrclib(track, undefined, attempt.controller.signal).then(
        (record) => {
          if (activeRef.current !== attempt) return;
          activeRef.current = null;
          setState({
            phase: 'idle',
            result: resolveLyrics(track, record, anchorFromRecognition(r)),
            message: null,
            retryable: false,
          });
        },
        (error: unknown) => {
          if (activeRef.current !== attempt) return;
          activeRef.current = null;
          if (error instanceof LrclibRequestError && error.kind !== 'aborted') {
            setState({
              phase: 'idle',
              result: { kind: 'lyrics_unavailable', track },
              message: RECOGNITION_COPY.lyrics_failed,
              retryable: true,
            });
          } else {
            setState((s) => ({ ...s, phase: 'idle' }));
          }
        },
      );
    });

    const errorSub = recognizer.addErrorListener((e) => {
      if (
        e.code !== 'match_timeout' &&
        e.code !== 'match_failed' &&
        e.code !== 'invalid_match'
      ) {
        return;
      }
      const attempt = activeRef.current;
      if (!isLive(attempt)) return;
      activeRef.current = null;
      // The error ends the attempt: a LRCLIB lookup still running for it
      // (resolving_lyrics) is aborted too, so its result cannot land on top
      // of the error copy.
      attempt.controller.abort();
      setState((s) => ({
        phase: 'idle',
        result: s.result,
        message: RECOGNITION_COPY[e.code as 'match_timeout' | 'match_failed' | 'invalid_match'],
        retryable: true,
      }));
    });

    return () => {
      recognitionSub.remove();
      errorSub.remove();
    };
  }, [recognizer]);

  useEffect(() => {
    if (previousStatusRef.current === 'listening' && earStatus !== 'listening') cancel();
    previousStatusRef.current = earStatus;
  }, [earStatus, cancel]);

  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => () => cancelRef.current(), []);

  return {
    state: recognizer ? state : UNAVAILABLE,
    recognize,
    cancel,
  };
}
