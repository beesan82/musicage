import type { File } from 'expo-file-system';

import type { Track } from './types';

const AUDD_ENDPOINT = 'https://api.audd.io/';

export type AudDRequestErrorKind = 'aborted' | 'http' | 'malformed' | 'network';

export class AudDRequestError extends Error {
  readonly kind: AudDRequestErrorKind;

  constructor(kind: AudDRequestErrorKind) {
    super(
      {
        aborted: 'AudD request was cancelled.',
        http: 'AudD request failed.',
        malformed: 'AudD response was invalid.',
        network: 'AudD request could not be completed.',
      }[kind],
    );
    this.name = 'AudDRequestError';
    this.kind = kind;
  }
}

export interface AudDRequest {
  token: string;
  file: File;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

type AudDResult = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function optionalFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

export function parseAudDTimecode(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parts = value.trim().split(':');

  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  const seconds = Number(parts[parts.length - 1]);
  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isFinite(seconds) ||
    hours < 0 ||
    minutes < 0 ||
    seconds < 0 ||
    seconds >= 60 ||
    (parts.length === 3 && minutes >= 60)
  ) {
    return null;
  }

  return hours * 3_600 + minutes * 60 + seconds;
}

function toTrack(result: AudDResult): Track | null {
  const title = optionalString(result.title);
  const artist = optionalString(result.artist);

  if (!title || !artist) {
    return null;
  }

  return {
    title,
    artist,
    album: optionalString(result.album),
    durationSeconds: optionalFiniteNumber(result.duration),
    timecodeSeconds: parseAudDTimecode(result.timecode),
  };
}

export async function recognizeAudD({
  token,
  file,
  fetchImpl = fetch,
  signal,
}: AudDRequest): Promise<Track | null> {
  const form = new FormData();
  form.append('api_token', token);
  form.append('return', 'timecode');
  form.append('file', file);

  let response: Response;

  try {
    response = await fetchImpl(AUDD_ENDPOINT, {
      method: 'POST',
      body: form,
      signal,
    });
  } catch (error) {
    throw new AudDRequestError(isAbort(error, signal) ? 'aborted' : 'network');
  }

  if (!response.ok) {
    throw new AudDRequestError('http');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    throw new AudDRequestError(isAbort(error, signal) ? 'aborted' : 'malformed');
  }

  if (!isRecord(payload) || payload.status !== 'success') {
    throw new AudDRequestError('malformed');
  }

  if (payload.result === null) {
    return null;
  }

  if (!isRecord(payload.result)) {
    throw new AudDRequestError('malformed');
  }

  const track = toTrack(payload.result);

  if (!track) {
    throw new AudDRequestError('malformed');
  }

  return track;
}
