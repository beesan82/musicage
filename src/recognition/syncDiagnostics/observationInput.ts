import type { GroundTruth } from './types';

export function parseSongPositionMs(value: string): number | null {
  const match = /^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const milliseconds = Number((match[3] ?? '').padEnd(3, '0') || '0');
  const positionMs = (minutes * 60_000) + (seconds * 1_000) + milliseconds;

  return Number.isFinite(positionMs) && positionMs >= 0 ? positionMs : null;
}

export function parseGroundTruthInput(
  position: string,
  precision: string,
  method: GroundTruth['method'],
): GroundTruth | null {
  const songPositionAtCaptureStartMs = parseSongPositionMs(position);

  if (!/^\d+$/.test(precision.trim()) || songPositionAtCaptureStartMs === null) {
    return null;
  }

  const observedPrecisionMs = Number(precision.trim());

  if (!Number.isFinite(observedPrecisionMs) || observedPrecisionMs < 0) {
    return null;
  }

  return { method, songPositionAtCaptureStartMs, observedPrecisionMs };
}
