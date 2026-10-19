import type { LrclibLyricsRecord } from '../lrclibClient';
import { resolveLyrics } from '../resolveLyrics';
import type { Track } from '../types';

const track: Track = {
  trackId: 'sk-1',
  title: 'Test Track',
  artist: 'Test Artist',
  album: null,
  artworkUrl: null,
};

const anchor = { offsetMs: 72_250, anchoredAtMonotonicMs: 7_000 };

const lyricRecord: LrclibLyricsRecord = {
  recordId: 42,
  instrumental: false,
  syncedLyrics: '[00:03.50]first\n[01:02.00]second',
  plainLyrics: 'first\nsecond',
};

describe('resolveLyrics', () => {
  it('preserves timestamped LRC and carries the anchor', () => {
    expect(resolveLyrics(track, lyricRecord, anchor)).toEqual({
      kind: 'timestamped',
      track,
      lines: [
        { startMs: 3500, text: 'first' },
        { startMs: 62000, text: 'second' },
      ],
      anchor,
    });
  });

  it('maps absent and instrumental lyric records to their explicit result kinds', () => {
    expect(resolveLyrics(track, null, anchor)).toEqual({ kind: 'lyrics_unavailable', track });
    expect(resolveLyrics(track, { ...lyricRecord, instrumental: true }, anchor)).toEqual({
      kind: 'instrumental',
      track,
    });
  });
});
