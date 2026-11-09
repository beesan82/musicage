import type { LrclibLyricsRecord } from './lrclibClient';

/** How many tracks a session remembers; the one used longest ago is forgotten first. */
export const LYRICS_CACHE_LIMIT = 64;

/**
 * What LRCLIB answered for each recognized track this session, by ShazamKit
 * trackId: the record (synced, plain or instrumental), or null when LRCLIB has
 * none (both the exact lookup and the search came back empty). A record that
 * nobody could fetch (network, rate limit, a malformed reply) is not an answer
 * and is never stored, so the next recognition asks again.
 *
 * In memory only, for as long as the app runs: never written to disk, never
 * shared. Re-recognizing the record on the turntable (the auto-recognition
 * re-fires each time sound returns) then costs no LRCLIB request at all.
 */
export interface LyricsCache {
  /** The stored answer for `trackId`: a record, null (LRCLIB has none), or undefined (not asked yet). */
  get(trackId: string): LrclibLyricsRecord | null | undefined;
  set(trackId: string, record: LrclibLyricsRecord | null): void;
}

export function createLyricsCache(limit: number = LYRICS_CACHE_LIMIT): LyricsCache {
  // A Map iterates in insertion order: re-inserting on every use keeps the
  // least recently used entry first.
  const entries = new Map<string, LrclibLyricsRecord | null>();
  return {
    get(trackId) {
      if (trackId === '' || !entries.has(trackId)) return undefined;
      const record = entries.get(trackId) as LrclibLyricsRecord | null;
      entries.delete(trackId);
      entries.set(trackId, record);
      return record;
    },
    set(trackId, record) {
      // An empty id names no track in particular; nothing to key it by.
      if (trackId === '') return;
      entries.delete(trackId);
      entries.set(trackId, record);
      while (entries.size > Math.max(1, limit)) {
        const oldest = entries.keys().next().value as string;
        entries.delete(oldest);
      }
    },
  };
}
