import type {
  EarFeatures,
  EarRecognition,
  NativeFeaturesEvent,
  NativeRecognitionEvent,
} from './types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function mapNativeFeatures(
  e: NativeFeaturesEvent,
  toJsMs: (nativeMs: number) => number,
): EarFeatures {
  return {
    timestampMs: toJsMs(e.t),
    rms: clamp01(e.rms),
    low: clamp01(e.low),
    mid: clamp01(e.mid),
    high: clamp01(e.high),
  };
}

export function mapNativeRecognition(
  e: NativeRecognitionEvent,
  toJsMs: (nativeMs: number) => number,
): EarRecognition | null {
  if (!e.trackId) return null;
  if (!Number.isFinite(e.currentOffsetMs) || e.currentOffsetMs < 0) return null;
  const r: EarRecognition = {
    trackId: e.trackId,
    title: e.title,
    artist: e.artist,
    matchedAtMonotonicMs: toJsMs(e.matchedAtNativeMs),
    currentOffsetMs: e.currentOffsetMs,
  };
  if (e.album) r.album = e.album;
  if (e.artworkUrl) r.artworkUrl = e.artworkUrl;
  return r;
}
