import type { LrclibLyricsRecord } from '../lrclibClient';
import { resolveLyrics } from '../resolveLyrics';
import type { Track } from '../types';

const track: Track = {
  title: 'Test Track',
  artist: 'Test Artist',
  album: null,
  durationSeconds: null,
  timecodeSeconds: 72.25,
};

const lyricRecord: LrclibLyricsRecord = {
  instrumental: false,
  syncedLyrics: '[00:03.50]first\n[01:02.00]second',
  plainLyrics: 'first\nsecond',
};

describe('resolveLyrics', () => {
  it('returns synced lyrics only when AudD supplied a timecode', () => {
    expect(resolveLyrics(track, lyricRecord, 1234)).toEqual({
      kind: 'synced',
      track,
      lines: [
        { startMs: 3500, text: 'first' },
        { startMs: 62000, text: 'second' },
      ],
      positionAtCaptureMs: 72250,
      captureStartedMonotonicMs: 1234,
    });

    const withoutTimecode: Track = { ...track, timecodeSeconds: null };

    expect(resolveLyrics(withoutTimecode, lyricRecord, 1234)).toEqual({
      kind: 'plain',
      track: withoutTimecode,
      text: 'first\nsecond',
    });
  });

  it('maps absent and instrumental lyric records to their explicit result kinds', () => {
    expect(resolveLyrics(track, null, 1234)).toEqual({ kind: 'lyrics_unavailable', track });
    expect(resolveLyrics(track, { ...lyricRecord, instrumental: true }, 1234)).toEqual({
      kind: 'instrumental',
      track,
    });
  });
});
