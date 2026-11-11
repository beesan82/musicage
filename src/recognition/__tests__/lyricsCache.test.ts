import type { LrclibLyricsRecord } from '../lrclibClient';
import { createLyricsCache, LYRICS_CACHE_LIMIT } from '../lyricsCache';

const record = (id: number): LrclibLyricsRecord => ({
  recordId: id,
  instrumental: false,
  syncedLyrics: '[00:01.00] 架空の行',
  plainLyrics: null,
});

describe('createLyricsCache', () => {
  test('remembers a record and a "none" (null) apart from "not asked" (undefined)', () => {
    const cache = createLyricsCache();
    expect(cache.get('t1')).toBeUndefined();
    cache.set('t1', record(1));
    cache.set('t2', null);
    expect(cache.get('t1')).toEqual(record(1));
    expect(cache.get('t2')).toBeNull();
    expect(cache.get('t3')).toBeUndefined();
  });

  test('a later answer for the same track replaces the earlier one', () => {
    const cache = createLyricsCache();
    cache.set('t1', null);
    cache.set('t1', record(7));
    expect(cache.get('t1')).toEqual(record(7));
  });

  test('keeps at most `limit` tracks, forgetting the one used longest ago', () => {
    const cache = createLyricsCache(3);
    cache.set('a', record(1));
    cache.set('b', record(2));
    cache.set('c', null);
    cache.get('a'); // a is now the most recently used
    cache.set('d', record(4));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toEqual(record(1));
    expect(cache.get('c')).toBeNull();
    expect(cache.get('d')).toEqual(record(4));
  });

  test('the default limit is a session’s worth of records', () => {
    expect(LYRICS_CACHE_LIMIT).toBe(64);
    const cache = createLyricsCache();
    for (let i = 0; i < LYRICS_CACHE_LIMIT + 10; i += 1) cache.set(`t${i}`, null);
    expect(cache.get('t0')).toBeUndefined();
    expect(cache.get(`t${LYRICS_CACHE_LIMIT + 9}`)).toBeNull();
  });

  test('an empty trackId is never stored', () => {
    const cache = createLyricsCache();
    cache.set('', record(1));
    expect(cache.get('')).toBeUndefined();
  });

  test('each cache is its own: nothing is shared between sessions', () => {
    const one = createLyricsCache();
    one.set('t1', null);
    expect(createLyricsCache().get('t1')).toBeUndefined();
  });
});
