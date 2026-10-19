import { LrclibRequestError, lookupLrclib } from '../lrclibClient';
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

  it('maps LRCLIB 404 to no record', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ignored: true }, 404));

    await expect(lookupLrclib(testTrack, fetchMock as unknown as typeof fetch)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
