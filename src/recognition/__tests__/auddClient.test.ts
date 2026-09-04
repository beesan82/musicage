import type { File } from 'expo-file-system';

import { AudDRequestError, parseAudDTimecode, recognizeAudD } from '../auddClient';

const fakeClipFile = new Blob(['clip'], { type: 'audio/mp4' }) as unknown as File;

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe('recognizeAudD', () => {
  it('posts a runtime token and one file directly to AudD with return=timecode', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        result: {
          artist: 'Test Artist',
          title: 'Test Track',
          album: 'Test Album',
          duration: 213,
          timecode: '01:12',
        },
      }),
    );

    const result = await recognizeAudD({
      token: 'owner-token',
      file: fakeClipFile,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.audd.io/',
      expect.objectContaining({ method: 'POST' }),
    );

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const form = request.body as FormData;

    expect(form).toBeInstanceOf(FormData);
    expect(form.get('api_token')).toBe('owner-token');
    expect(form.get('return')).toBe('timecode');
    expect(form.get('file')).toBeTruthy();
    expect(result).toEqual({
      title: 'Test Track',
      artist: 'Test Artist',
      album: 'Test Album',
      durationSeconds: 213,
      timecodeSeconds: 72,
    });
  });

  it('maps an AudD success with result:null to no match', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ status: 'success', result: null }));

    await expect(
      recognizeAudD({
        token: 'owner-token',
        file: fakeClipFile,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses typed safe failures without leaking an AudD token or response body', async () => {
    const runtimeToken = 'token-that-must-not-leak';
    const rawProviderBody = 'provider-body-that-must-not-leak';
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ detail: rawProviderBody }, 500));

    try {
      await recognizeAudD({
        token: runtimeToken,
        file: fakeClipFile,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      throw new Error('Expected recognizeAudD to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AudDRequestError);
      expect((error as Error).message).not.toContain(runtimeToken);
      expect((error as Error).message).not.toContain(rawProviderBody);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('parses supported AudD timecodes defensively', () => {
    expect(parseAudDTimecode('01:12')).toBe(72);
    expect(parseAudDTimecode('1:02.5')).toBe(62.5);
    expect(parseAudDTimecode('01:02:03')).toBe(3723);
    expect(parseAudDTimecode('01:99')).toBeNull();
    expect(parseAudDTimecode('not-a-timecode')).toBeNull();
  });
});
