import type { Track } from './types';

const LRCLIB_ENDPOINT = 'https://lrclib.net/api/get';
const LRCLIB_CLIENT = 'MUSICAGE/0.1 (personal-use Expo client)';

export interface LrclibLyricsRecord {
  recordId: number | null;
  instrumental: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
}

export type LrclibRequestErrorKind = 'aborted' | 'http' | 'malformed' | 'network' | 'rate_limited';

export class LrclibRequestError extends Error {
  readonly kind: LrclibRequestErrorKind;
  readonly retryAfterSeconds: number | null;

  constructor(kind: LrclibRequestErrorKind, retryAfterSeconds: number | null = null) {
    super(
      {
        aborted: 'Lyrics request was cancelled.',
        http: 'Lyrics request failed.',
        malformed: 'Lyrics response was invalid.',
        network: 'Lyrics request could not be completed.',
        rate_limited: 'Lyrics service is temporarily rate limited.',
      }[kind],
    );
    this.name = 'LrclibRequestError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
}

function nullableString(value: unknown): string | null | undefined {
  return value === undefined || value === null || typeof value === 'string' ? value : undefined;
}

function nullableRecordId(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseRetryAfter(headers: Headers): number | null {
  const value = headers.get('Retry-After');
  const seconds = value ? Number(value) : NaN;

  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function buildLookupUrl(track: Track): string {
  const params = new URLSearchParams({
    track_name: track.title,
    artist_name: track.artist,
  });

  if (track.album) {
    params.set('album_name', track.album);
  }

  if (track.durationSeconds !== null && Number.isFinite(track.durationSeconds)) {
    params.set('duration', String(track.durationSeconds));
  }

  return `${LRCLIB_ENDPOINT}?${params.toString()}`;
}

function toLyricsRecord(payload: unknown): LrclibLyricsRecord | null {
  if (!isRecord(payload) || typeof payload.instrumental !== 'boolean') {
    return null;
  }

  const syncedLyrics = nullableString(payload.syncedLyrics);
  const plainLyrics = nullableString(payload.plainLyrics);

  if (syncedLyrics === undefined || plainLyrics === undefined) {
    return null;
  }

  return {
    recordId: nullableRecordId(payload.id),
    instrumental: payload.instrumental,
    syncedLyrics,
    plainLyrics,
  };
}

export async function lookupLrclib(
  track: Track,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<LrclibLyricsRecord | null> {
  let response: Response;

  try {
    response = await fetchImpl(buildLookupUrl(track), {
      headers: { 'Lrclib-Client': LRCLIB_CLIENT },
      signal,
    });
  } catch (error) {
    throw new LrclibRequestError(isAbort(error, signal) ? 'aborted' : 'network');
  }

  if (response.status === 404) {
    return null;
  }

  if (response.status === 429) {
    throw new LrclibRequestError('rate_limited', parseRetryAfter(response.headers));
  }

  if (!response.ok) {
    throw new LrclibRequestError('http');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    throw new LrclibRequestError(isAbort(error, signal) ? 'aborted' : 'malformed');
  }

  const record = toLyricsRecord(payload);

  if (!record) {
    throw new LrclibRequestError('malformed');
  }

  return record;
}
