import { ExpoMusicageEar } from '../../modules/expo-musicage-ear/src';
import type { EarModule } from '../../modules/expo-musicage-ear/src';
import { useMicrophoneAnalysis } from './useMicrophoneAnalysis';
import { useNativeEar } from './useNativeEar';
import type { Ear } from './useNativeEar';

export const NATIVE_EAR: EarModule | null = ExpoMusicageEar;

export function useMeterEar(): Ear {
  const { status, errorMessage, earStream, start, stop, retry } = useMicrophoneAnalysis();

  return { kind: 'meter', status, errorMessage, earStream, start, stop, retry, recognizer: null };
}

// NATIVE_EAR is fixed when the module loads, so the hook order never changes
// during the life of the process.
export function useEar(): Ear {
  return NATIVE_EAR !== null ? useNativeEar(NATIVE_EAR) : useMeterEar();
}
