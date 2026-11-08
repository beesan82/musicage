import { requireOptionalNativeModule } from 'expo-modules-core';

import { createClockConverter, type ClockConverter } from './clockConverter';
import { mapNativeFeatures, mapNativeRecognition } from './mapNative';
import {
  NATIVE_MODULE_NAME,
  type EarError,
  type EarFeatures,
  type EarRecognition,
  type NativeEarModule,
  type Subscription,
} from './types';

export * from './types';

export interface EarModule {
  now(): number;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  listenForMatch(timeoutMs: number): Promise<void>;
  cancelMatch(): Promise<void>;
  addFeaturesListener(l: (f: EarFeatures) => void): Subscription;
  addRecognitionListener(l: (r: EarRecognition) => void): Subscription;
  addErrorListener(l: (e: EarError) => void): Subscription;
}

export function createEarModule(native: NativeEarModule, converter: ClockConverter): EarModule {
  const errorListeners = new Set<(e: EarError) => void>();
  const emitError = (e: EarError) => errorListeners.forEach((l) => l(e));

  return {
    now: () => native.now(),
    startListening: () => native.startListening(),
    stopListening: () => native.stopListening(),
    listenForMatch: (timeoutMs) => native.listenForMatch(timeoutMs),
    cancelMatch: () => native.cancelMatch(),
    addFeaturesListener: (l) =>
      native.addListener('onFeatures', (e) => l(mapNativeFeatures(e, converter.toJsMs))),
    addRecognitionListener: (l) =>
      native.addListener('onRecognition', (e) => {
        const r = mapNativeRecognition(e, converter.toJsMs);
        if (r) l(r);
        else emitError({ code: 'invalid_match' });
      }),
    addErrorListener: (l) => {
      errorListeners.add(l);
      const sub = native.addListener('onEarError', l);
      return {
        remove() {
          errorListeners.delete(l);
          sub.remove();
        },
      };
    },
  };
}

export function loadNativeEarModule(): NativeEarModule | null {
  try {
    return requireOptionalNativeModule<NativeEarModule>(NATIVE_MODULE_NAME) ?? null;
  } catch {
    return null;
  }
}

const native = loadNativeEarModule();

export const ExpoMusicageEar: EarModule | null = native
  ? createEarModule(native, createClockConverter(() => native.now()))
  : null;
