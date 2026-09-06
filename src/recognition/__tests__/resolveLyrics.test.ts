import type { LrclibLyricsRecord } from '../lrclibClient';
import { resolveLyrics } from '../resolveLyrics';
import type { Track } from '../types';

const track: Track = {
  title: 'Test Track',
  artist: 'Test Artist',
  album: null,
  durationSeconds: null,
  timecodeRaw: '01:12.250',
  timecodeMs: 72_250,
};

const lyricRecord: LrclibLyricsRecord = {
  recordId: 42,
  instrumental: false,
  syncedLyrics: '[00:03.50]first\n[01:02.00]second',
  plainLyrics: 'first\nsecond',
};

describe('resolveLyrics', () => {
  it('preserves timestamped LRC and only records unverified timing evidence', () => {
    expect(resolveLyrics(track, lyricRecord, {
      clipDurationMs: 12_000,
      captureStartedMonotonicMs: 7_000,
      auddTimecodeMs: 72_250,
    })).toEqual({
      kind: 'timestamped',
      track,
      lines: [
        { startMs: 3500, text: 'first' },
        { startMs: 62000, text: 'second' },
      ],
      timingEvidence: {
        clipDurationMs: 12_000,
        captureStartedMonotonicMs: 7_000,
        auddTimecodeMs: 72_250,
      },
    });

    const withoutTimecode: Track = { ...track, timecodeRaw: null, timecodeMs: null };

    expect(resolveLyrics(withoutTimecode, lyricRecord, {
      clipDurationMs: 3_000,
      captureStartedMonotonicMs: 1_000,
      auddTimecodeMs: null,
    })).toEqual({
      kind: 'timestamped',
      track: withoutTimecode,
      lines: [
        { startMs: 3500, text: 'first' },
        { startMs: 62000, text: 'second' },
      ],
      timingEvidence: {
        clipDurationMs: 3_000,
        captureStartedMonotonicMs: 1_000,
        auddTimecodeMs: null,
      },
    });
  });

  it('maps absent and instrumental lyric records to their explicit result kinds', () => {
    const timingEvidence = {
      clipDurationMs: 12_000 as const,
      captureStartedMonotonicMs: 1_234,
      auddTimecodeMs: track.timecodeMs,
    };

    expect(resolveLyrics(track, null, timingEvidence)).toEqual({ kind: 'lyrics_unavailable', track });
    expect(resolveLyrics(track, { ...lyricRecord, instrumental: true }, timingEvidence)).toEqual({
      kind: 'instrumental',
      track,
    });
  });
});
