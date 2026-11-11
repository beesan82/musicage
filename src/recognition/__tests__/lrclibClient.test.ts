import {
  LrclibRequestError,
  lookupLrclib,
  normalizeName,
  pickSearchCandidate,
  SEARCH_DURATION_TOLERANCE_MS,
  searchLrclib,
} from '../lrclibClient';
import type { LrclibLyricsRecord, LrclibSearchCandidate } from '../lrclibClient';
import type { Track } from '../types';

const testTrack: Track = {
  trackId: 'sk-1',
  title: 'Test Track',
  artist: 'Test Artist',
  album: 'Test Album',
  artworkUrl: null,
};

function jsonResponse(payload: unknown, status = 200, retryAfter: string | null = null): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: jest.fn().mockReturnValue(retryAfter) },
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe('lookupLrclib', () => {
  it('sends track, artist and album only, with the required client header', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 42,
        instrumental: false,
        syncedLyrics: '[00:01.00]line',
        plainLyrics: 'line',
      }),
    );

    await expect(lookupLrclib(testTrack, fetchMock as unknown as typeof fetch)).resolves.toEqual({
      recordId: 42,
      instrumental: false,
      syncedLyrics: '[00:01.00]line',
      plainLyrics: 'line',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('track_name=Test+Track');
    expect(String(fetchMock.mock.calls[0][0])).toContain('artist_name=Test+Artist');
    expect(String(fetchMock.mock.calls[0][0])).toContain('album_name=Test+Album');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('duration=');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { 'Lrclib-Client': 'MUSICAGE/0.1 (personal-use Expo client)' },
    });
  });

  it('maps LRCLIB 404 on both the exact lookup and the search to no record', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ignored: true }, 404));

    await expect(lookupLrclib(testTrack, fetchMock as unknown as typeof fetch)).resolves.toBeNull();

    // The exact lookup, then the search fallback.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/get?');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/search?');
  });

  it.each([undefined, 'not-a-number'])(
    'maps an absent or non-numeric LRCLIB id (%p) to null',
    async (id) => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
        id,
        instrumental: false,
        syncedLyrics: null,
        plainLyrics: 'line',
      }));

      await expect(lookupLrclib(testTrack, fetchMock as unknown as typeof fetch)).resolves.toEqual({
        recordId: null,
        instrumental: false,
        syncedLyrics: null,
        plainLyrics: 'line',
      });
    },
  );

  it('maps LRCLIB 429 to a non-retried rate-limit error with a positive Retry-After value', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ignored: true }, 429, '7'));

    try {
      await lookupLrclib(testTrack, fetchMock as unknown as typeof fetch);
      throw new Error('Expected lookupLrclib to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(LrclibRequestError);
      expect(error).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 7 });
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// A /api/search hit as LRCLIB returns it (fictional records throughout).
const hit = (over: Record<string, unknown> = {}) => ({
  id: 7,
  trackName: 'Test Track',
  artistName: 'Test Artist',
  albumName: 'Test Album',
  duration: 200,
  instrumental: false,
  syncedLyrics: '[00:01.00]line',
  plainLyrics: 'line',
  ...over,
});

const recordOf = (h: ReturnType<typeof hit>): LrclibLyricsRecord => ({
  recordId: h.id as number,
  instrumental: h.instrumental as boolean,
  syncedLyrics: h.syncedLyrics as string | null,
  plainLyrics: h.plainLyrics as string | null,
});

describe('the /api/search fallback', () => {
  it('after a 404 on /api/get, searches by track and artist only (no album, no duration) and resolves the hit', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ignored: true }, 404))
      .mockResolvedValueOnce(jsonResponse([hit()]));

    await expect(lookupLrclib(testTrack, fetchMock as unknown as typeof fetch)).resolves.toEqual(recordOf(hit()));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const searchUrl = String(fetchMock.mock.calls[1][0]);
    expect(searchUrl).toContain('https://lrclib.net/api/search?');
    expect(searchUrl).toContain('track_name=Test+Track');
    expect(searchUrl).toContain('artist_name=Test+Artist');
    expect(searchUrl).not.toContain('album_name=');
    expect(searchUrl).not.toContain('duration=');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: { 'Lrclib-Client': 'MUSICAGE/0.1 (personal-use Expo client)' },
    });
  });

  it('an exact /api/get hit never searches', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(hit()));
    await lookupLrclib(testTrack, fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a search with no usable hit is lyrics unavailable (null), as before the fallback', async () => {
    const empty = jest.fn().mockResolvedValue(jsonResponse([]));
    await expect(searchLrclib(testTrack, empty as unknown as typeof fetch)).resolves.toBeNull();

    const nothing = jest.fn().mockResolvedValue(
      jsonResponse([hit({ syncedLyrics: null, plainLyrics: '  ', instrumental: false })]),
    );
    await expect(searchLrclib(testTrack, nothing as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('skips entries that are not lyrics records instead of failing', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(['junk', 42, null, hit()]));
    await expect(searchLrclib(testTrack, fetchMock as unknown as typeof fetch)).resolves.toEqual(recordOf(hit()));
  });

  it('a search 404 is null; a non-array payload is malformed; 429 is rate limited', async () => {
    const notFound = jest.fn().mockResolvedValue(jsonResponse({}, 404));
    await expect(searchLrclib(testTrack, notFound as unknown as typeof fetch)).resolves.toBeNull();

    const object = jest.fn().mockResolvedValue(jsonResponse({ not: 'an array' }));
    await expect(searchLrclib(testTrack, object as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'malformed' });

    const limited = jest.fn().mockResolvedValue(jsonResponse({}, 429, '3'));
    await expect(searchLrclib(testTrack, limited as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 3,
    });
  });

  describe('with the track’s length known, the exact match is held to it too', () => {
    const known: Track = { ...testTrack, durationMs: 200_000 };

    it('an exact match of another length (an edit under the same names) is passed over for the search', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(hit({ id: 1, duration: 245 })))
        .mockResolvedValueOnce(jsonResponse([hit({ id: 1, duration: 245 }), hit({ id: 2, duration: 201 })]));
      await expect(lookupLrclib(known, fetchMock as unknown as typeof fetch)).resolves.toEqual(
        recordOf(hit({ id: 2, duration: 201 })),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The length is compared, never sent.
      for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toContain('duration');
    });

    it('…and with nothing of the right length in the search either, there are no lyrics (never the wrong take)', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(hit({ id: 1, duration: 245 })))
        .mockResolvedValueOnce(jsonResponse([hit({ id: 1, duration: 245 }), hit({ id: 3, duration: 150 })]));
      await expect(lookupLrclib(known, fetchMock as unknown as typeof fetch)).resolves.toBeNull();
    });

    it('an exact match within the tolerance is taken without searching', async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(hit({ id: 4, duration: 202.9 })));
      await expect(lookupLrclib(known, fetchMock as unknown as typeof fetch)).resolves.toEqual(
        recordOf(hit({ id: 4, duration: 202.9 })),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('an exact match that reports no length is taken (nothing contradicts it)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(hit({ id: 5, duration: null })));
      await expect(lookupLrclib(known, fetchMock as unknown as typeof fetch)).resolves.toEqual(
        recordOf(hit({ id: 5, duration: null })),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('without a length (ShazamKit today) the exact match is taken whatever its length', async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(hit({ id: 6, duration: 999 })));
      await expect(lookupLrclib(testTrack, fetchMock as unknown as typeof fetch)).resolves.toEqual(
        recordOf(hit({ id: 6, duration: 999 })),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('a search by length never takes a same-named hit far from the track’s length, even when it is the only synced one', async () => {
    const known: Track = { ...testTrack, durationMs: 200_000 };
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse([
        hit({ id: 1, duration: 260 }), // same names, synced, a minute longer
        hit({ id: 2, duration: 199, syncedLyrics: null }), // right length, plain text only
      ]),
    );
    await expect(searchLrclib(known, fetchMock as unknown as typeof fetch)).resolves.toEqual(
      recordOf(hit({ id: 2, duration: 199, syncedLyrics: null })),
    );
  });

  it('a blank title never searches', async () => {
    const fetchMock = jest.fn();
    await expect(searchLrclib({ ...testTrack, title: ' ' }, fetchMock as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('pickSearchCandidate', () => {
  const candidate = (over: Record<string, unknown> = {}, meta: Partial<LrclibSearchCandidate> = {}): LrclibSearchCandidate => {
    const h = hit(over);
    return {
      record: recordOf(h),
      trackName: h.trackName as string,
      artistName: h.artistName as string,
      durationMs: (h.duration as number) * 1_000,
      ...meta,
    };
  };

  describe('with the track’s length known', () => {
    const known: Track = { ...testTrack, durationMs: 200_000 };

    it('takes the hit nearest in length within the tolerance, whatever its names say', () => {
      const near = candidate({ id: 1, duration: 201.5, trackName: 'Other Name' });
      const nearer = candidate({ id: 2, duration: 199.8, trackName: 'Another Name' });
      const far = candidate({ id: 3, duration: 180 });
      expect(pickSearchCandidate(known, [near, far, nearer])?.recordId).toBe(2);
      expect(SEARCH_DURATION_TOLERANCE_MS).toBe(3_000);
    });

    it('a same-named hit of another length is another recording: none in range means none at all', () => {
      const edit = candidate({ id: 1, duration: 203.5 });
      expect(pickSearchCandidate(known, [edit])).toBeNull();
      const justInside = candidate({ id: 2, duration: 203 });
      expect(pickSearchCandidate(known, [edit, justInside])?.recordId).toBe(2);
    });

    it('ignores hits without a length, and ties on length go to synced, then plain, then instrumental', () => {
      const noLength = candidate({ id: 1 }, { durationMs: null });
      expect(pickSearchCandidate(known, [noLength])).toBeNull();

      const instrumental = candidate({ id: 2, instrumental: true, syncedLyrics: null, plainLyrics: null });
      const plain = candidate({ id: 3, syncedLyrics: null });
      const synced = candidate({ id: 4 });
      expect(pickSearchCandidate(known, [instrumental, plain, synced])?.recordId).toBe(4);
      expect(pickSearchCandidate(known, [instrumental, plain])?.recordId).toBe(3);
      expect(pickSearchCandidate(known, [instrumental])?.recordId).toBe(2);
    });
  });

  describe('without a length (ShazamKit reports none)', () => {
    it('takes a hit whose normalised title and artist both equal the track’s', () => {
      const match = candidate({ id: 1 });
      const otherArtist = candidate({ id: 2, artistName: 'Someone Else' });
      const otherTitle = candidate({ id: 3, trackName: 'Test Track II' });
      expect(pickSearchCandidate(testTrack, [otherArtist, otherTitle, match])?.recordId).toBe(1);
      expect(pickSearchCandidate(testTrack, [otherArtist, otherTitle])).toBeNull();
    });

    it('matches across case, width, punctuation, spacing and a bracketed suffix', () => {
      const spelled = candidate({ id: 1, trackName: 'TEST  TRACK (Remastered 2009)', artistName: 'test-artist' });
      expect(pickSearchCandidate(testTrack, [spelled])?.recordId).toBe(1);
      const fullWidth = candidate({ id: 2, trackName: 'Ｔｅｓｔ Ｔｒａｃｋ', artistName: 'Test Artist' });
      expect(pickSearchCandidate(testTrack, [fullWidth])?.recordId).toBe(2);
    });

    it('prefers synced lyrics, then plain text, then an instrumental mark, then search order', () => {
      const plainFirst = candidate({ id: 1, syncedLyrics: null });
      const synced = candidate({ id: 2 });
      const syncedLater = candidate({ id: 3 });
      expect(pickSearchCandidate(testTrack, [plainFirst, synced, syncedLater])?.recordId).toBe(2);
      const instrumental = candidate({ id: 4, instrumental: true, syncedLyrics: null, plainLyrics: null });
      expect(pickSearchCandidate(testTrack, [instrumental, plainFirst])?.recordId).toBe(1);
    });

    it('a hit with nothing to show never counts, and a blank title matches nothing', () => {
      const empty = candidate({ id: 1, syncedLyrics: null, plainLyrics: null, instrumental: false });
      expect(pickSearchCandidate(testTrack, [empty])).toBeNull();
      expect(pickSearchCandidate({ ...testTrack, title: '()' }, [candidate({ trackName: '()' })])).toBeNull();
    });
  });
});

describe('normalizeName', () => {
  it('folds width and case, drops punctuation, symbols and spaces, and a bracketed suffix', () => {
    expect(normalizeName('Ｔｅｓｔ  Ｔｒａｃｋ!')).toBe('testtrack');
    expect(normalizeName('Test Track (Live at Nowhere)')).toBe('testtrack');
    expect(normalizeName('Test Track［2009 Remaster］')).toBe('testtrack');
    expect(normalizeName('架空の歌（別テイク）')).toBe('架空の歌');
    expect(normalizeName("Don't Stop - Edit")).toBe('dontstopedit');
  });

  it('keeps a name that is nothing but a bracket, and never transliterates scripts', () => {
    expect(normalizeName('(Untitled)')).toBe('untitled');
    expect(normalizeName('カクウ')).not.toBe(normalizeName('kakuu'));
  });
});
