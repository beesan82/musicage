import type { EarFeatures } from './types';

export interface EarStream {
  subscribe(listener: (f: EarFeatures) => void): () => void;
}

export interface EarEmitter extends EarStream {
  emit(f: EarFeatures): void;
}

export function createEarEmitter(): EarEmitter {
  const listeners = new Set<(f: EarFeatures) => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(f) {
      listeners.forEach((listener) => listener(f));
    },
  };
}
