import type { Track } from './types';

const LRCLIB_GET_ENDPOINT = 'https://lrclib.net/api/get';
const LRCLIB_SEARCH_ENDPOINT = 'https://lrclib.net/api/search';
const LRCLIB_CLIENT = 'MUSICAGE/0.1 (personal-use Expo client)';

/**
 * When the recognizer knows the track's length, a search candidate counts as
 * the same recording only within this much of it (a live take or an edit of
 * the same title would otherwise be synced to the wrong clock).
 */
export const SEARCH_DURATION_TOLERANCE_MS = 3_000;

export interface LrclibLyricsRecord {
  recordId: number | null;
  instrumental: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
}

/** One hit of /api/search: the record plus what it was filed under. */
export interface LrclibSearchCandidate {
  record: LrclibLyricsRecord;
  trackName: string;
  artistName: string;
  durationMs: number | null;
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

  return `${LRCLIB_GET_ENDPOINT}?${params.toString()}`;
}

/** The search sends the same two names and nothing else (no audio, no ids). */
function buildSearchUrl(track: Track): string {
  const params = new URLSearchParams({ track_name: track.title });
  if (track.artist.trim() !== '') {
    params.set('artist_name', track.artist);
  }
  return `${LRCLIB_SEARCH_ENDPOINT}?${params.toString()}`;
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

/** A search hit; null for an entry that is not a lyrics record (it is skipped, not fatal). */
function toSearchCandidate(payload: unknown): LrclibSearchCandidate | null {
  const record = toLyricsRecord(payload);
  if (record === null || !isRecord(payload)) return null;
  const duration = payload.duration;
  return {
    record,
    trackName: typeof payload.trackName === 'string' ? payload.trackName : '',
    artistName: typeof payload.artistName === 'string' ? payload.artistName : '',
    durationMs:
      typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration * 1_000 : null,
  };
}

/**
 * A name as LRCLIB and ShazamKit might each spell it: compatibility forms
 * folded (full-width to ASCII, ligatures), lower case, a bracketed suffix
 * such as "(Remastered)" dropped unless the whole name is the bracket, and
 * every space, punctuation and symbol removed. Scripts are not transliterated:
 * an artist filed in katakana does not match one filed in Latin letters.
 */
export function normalizeName(name: string): string {
  const folded = name.normalize('NFKC').toLowerCase();
  const unbracketed = folded.replace(/\s*[(\[（【][^)\]）】]*[)\]）】]/gu, '');
  return (unbracketed.trim() === '' ? folded : unbracketed).replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** What a record is worth to the stage: synced lines first, then text, then an instrumental mark. */
function lyricsRank(record: LrclibLyricsRecord): number {
  if (!record.instrumental && (record.syncedLyrics ?? '').trim() !== '') return 3;
  if (!record.instrumental && (record.plainLyrics ?? '').trim() !== '') return 2;
  if (record.instrumental) return 1;
  return 0;
}

/**
 * The one search hit to treat as this track's record, or null.
 * - With the track's length known: the hit nearest in length, within
 *   SEARCH_DURATION_TOLERANCE_MS; none in range means none at all (a same-named
 *   hit of another length is another recording, and syncing to it would fake a sync).
 * - Without a length: the hits whose normalised title and artist both equal
 *   the track's.
 * Ties go to the hit with synced lyrics, then plain text, then an
 * instrumental mark, then search order. Hits with none of those never count.
 */
export function pickSearchCandidate(
  track: Track,
  candidates: readonly LrclibSearchCandidate[],
): LrclibLyricsRecord | null {
  const usable = candidates
    .map((candidate, order) => ({ candidate, order, rank: lyricsRank(candidate.record) }))
    .filter((c) => c.rank > 0);
  if (usable.length === 0) return null;

  const duration = track.durationMs ?? null;
  if (duration !== null && Number.isFinite(duration) && duration > 0) {
    const inRange = usable
      .filter((c) => c.candidate.durationMs !== null)
      .map((c) => ({ ...c, distance: Math.abs((c.candidate.durationMs as number) - duration) }))
      .filter((c) => c.distance <= SEARCH_DURATION_TOLERANCE_MS)
      .sort((a, b) => a.distance - b.distance || b.rank - a.rank || a.order - b.order);
    return inRange[0]?.candidate.record ?? null;
  }

  const title = normalizeName(track.title);
  const artist = normalizeName(track.artist);
  if (title === '') return null;
  const named = usable
    .filter(
      (c) => normalizeName(c.candidate.trackName) === title && normalizeName(c.candidate.artistName) === artist,
    )
    .sort((a, b) => b.rank - a.rank || a.order - b.order);
  return named[0]?.candidate.record ?? null;
}

const NOT_FOUND = Symbol('lrclib-not-found');

/** One GET with the client header; 404 is NOT_FOUND, every other failure an LrclibRequestError. */
async function requestJson(
  url: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<unknown | typeof NOT_FOUND> {
  let response: Response;

  try {
    response = await fetchImpl(url, {
      headers: { 'Lrclib-Client': LRCLIB_CLIENT },
      signal,
    });
  } catch (error) {
    throw new LrclibRequestError(isAbort(error, signal) ? 'aborted' : 'network');
  }

  if (response.status === 404) {
    return NOT_FOUND;
  }

  if (response.status === 429) {
    throw new LrclibRequestError('rate_limited', parseRetryAfter(response.headers));
  }

  if (!response.ok) {
    throw new LrclibRequestError('http');
  }

  try {
    return await response.json();
  } catch (error) {
    throw new LrclibRequestError(isAbort(error, signal) ? 'aborted' : 'malformed');
  }
}

/**
 * /api/search for the track, resolved to one record by pickSearchCandidate,
 * or null when nothing fits. Errors mean the same as for the exact lookup.
 */
export async function searchLrclib(
  track: Track,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<LrclibLyricsRecord | null> {
  if (track.title.trim() === '') return null;

  const payload = await requestJson(buildSearchUrl(track), fetchImpl, signal);
  if (payload === NOT_FOUND) return null;
  if (!Array.isArray(payload)) {
    throw new LrclibRequestError('malformed');
  }

  const candidates = payload
    .map(toSearchCandidate)
    .filter((c): c is LrclibSearchCandidate => c !== null);
  return pickSearchCandidate(track, candidates);
}

/**
 * The track's lyrics record: the exact /api/get match, else the best
 * /api/search hit (see pickSearchCandidate), else null (lyrics unavailable).
 */
export async function lookupLrclib(
  track: Track,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<LrclibLyricsRecord | null> {
  const payload = await requestJson(buildLookupUrl(track), fetchImpl, signal);

  if (payload === NOT_FOUND) {
    return searchLrclib(track, fetchImpl, signal);
  }

  const record = toLyricsRecord(payload);

  if (!record) {
    throw new LrclibRequestError('malformed');
  }

  return record;
}
