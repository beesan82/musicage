import type { CapturedRecognitionClip } from '../../captureRecognitionClip';
import type { LrclibLyricsRecord } from '../../lrclibClient';
import type { Track } from '../../types';
import { createDiagnosticSample } from '../createDiagnosticSample';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(),
  randomUUID: jest.fn(),
}));

const capture: CapturedRecognitionClip = {
  uri: 'file:///cache/recognition.m4a',
  requestedDurationMs: 5_000,
  startedMonotonicMs: 10_000,
  endedMonotonicMs: 15_018,
};

const track: Track = {
  title: 'Test Track',
  artist: 'Test Artist',
  album: 'Test Album',
  durationSeconds: 213,
  timecodeRaw: '01:23',
  timecodeMs: 83_000,
};

const lyrics: LrclibLyricsRecord = {
  recordId: 42,
  instrumental: false,
  syncedLyrics: '[00:01.00]full lyric line one\n[00:02.00]full lyric line two',
  plainLyrics: 'full lyric line one\nfull lyric line two',
};

describe('createDiagnosticSample', () => {
  it('persists only a fingerprint and safe derived provider evidence', async () => {
    const sample = await createDiagnosticSample(
      {
        capture,
        track,
        auddResponseMonotonicMs: 15_800,
        lrclib: lyrics,
      },
      {
        createId: () => 'trial-1',
        digestLyrics: async () => 'sha256:abc',
      },
    );

    expect(sample).toEqual({
      schemaVersion: 1,
      id: 'trial-1',
      capture: {
        requestedDurationMs: 5_000,
        startedMonotonicMs: 10_000,
        endedMonotonicMs: 15_018,
      },
      audd: {
        timecodeRaw: '01:23',
        timecodeMs: 83_000,
        responseMonotonicMs: 15_800,
        title: 'Test Track',
        artist: 'Test Artist',
      },
      lrclib: {
        recordId: 42,
        syncedLineCount: 2,
        syncedLyricsHash: 'sha256:abc',
      },
      groundTruth: null,
    });

    const serialized = JSON.stringify(sample);

    expect(serialized).not.toContain('file:///cache/recognition.m4a');
    expect(serialized).not.toContain('owner-private-token');
    expect(serialized).not.toContain('full lyric line');
    expect(serialized).not.toContain('rawProviderPayload');
  });

  it('retains no-match and missing-lyrics trials as null-safe diagnostic evidence', async () => {
    const digestLyrics = jest.fn().mockResolvedValue('sha256:unused');

    await expect(createDiagnosticSample(
      {
        capture,
        track: null,
        auddResponseMonotonicMs: null,
        lrclib: null,
      },
      {
        createId: () => 'trial-2',
        digestLyrics,
      },
    )).resolves.toMatchObject({
      id: 'trial-2',
      audd: {
        timecodeRaw: null,
        timecodeMs: null,
        responseMonotonicMs: null,
        title: null,
        artist: null,
      },
      lrclib: {
        recordId: null,
        syncedLineCount: 0,
        syncedLyricsHash: null,
      },
      groundTruth: null,
    });
    expect(digestLyrics).not.toHaveBeenCalled();
  });
});
