export interface EarFeatures {
  timestampMs: number;
  rms: number;
  low: number;
  mid: number;
  high: number;
}

export interface EarRecognition {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  matchedAtMonotonicMs: number;
  currentOffsetMs: number;
}

export type EarErrorCode =
  | 'microphone_denied'
  | 'audio_setup_failed'
  | 'interrupted'
  | 'match_timeout'
  | 'match_failed'
  | 'invalid_match';

export interface EarError {
  code: EarErrorCode;
}

export interface Subscription {
  remove(): void;
}

/** Raw feature event; `t` is the native monotonic clock in ms. */
export interface NativeFeaturesEvent {
  t: number;
  rms: number;
  low: number;
  mid: number;
  high: number;
}

export interface NativeRecognitionEvent {
  trackId: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  matchedAtNativeMs: number;
  currentOffsetMs: number;
}

export const NATIVE_MODULE_NAME = 'ExpoMusicageEar';
export const NATIVE_EVENTS = ['onFeatures', 'onRecognition', 'onEarError'] as const;
export const NATIVE_FUNCTIONS = [
  'now',
  'startListening',
  'stopListening',
  'listenForMatch',
  'cancelMatch',
] as const;

export interface NativeEarModule {
  now(): number;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  listenForMatch(timeoutMs: number): Promise<void>;
  cancelMatch(): Promise<void>;
  addListener(name: 'onFeatures', l: (e: NativeFeaturesEvent) => void): Subscription;
  addListener(name: 'onRecognition', l: (e: NativeRecognitionEvent) => void): Subscription;
  addListener(name: 'onEarError', l: (e: EarError) => void): Subscription;
}
