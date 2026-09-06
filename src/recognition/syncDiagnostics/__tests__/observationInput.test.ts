import { parseGroundTruthInput, parseSongPositionMs } from '../observationInput';

describe('observationInput', () => {
  it('parses strict MM:SS.mmm video positions into milliseconds', () => {
    expect(parseSongPositionMs('01:23.450')).toBe(83_450);
    expect(parseSongPositionMs('0:05.2')).toBe(5_200);
    expect(parseSongPositionMs('12:34')).toBe(754_000);
  });

  it('rejects malformed or non-finite clock inputs', () => {
    expect(parseSongPositionMs('1:2.3')).toBeNull();
    expect(parseSongPositionMs('01:60.000')).toBeNull();
    expect(parseSongPositionMs('-1:00.000')).toBeNull();
    expect(parseSongPositionMs('Infinity:00')).toBeNull();
  });

  it('builds only finite non-negative video or manual ground-truth observations', () => {
    expect(parseGroundTruthInput('01:23.450', '80', 'video-timed-controlled-playback'))
      .toEqual({
        method: 'video-timed-controlled-playback',
        songPositionAtCaptureStartMs: 83_450,
        observedPrecisionMs: 80,
      });
    expect(parseGroundTruthInput('01:23', '0', 'manual-estimate'))
      .toEqual({
        method: 'manual-estimate',
        songPositionAtCaptureStartMs: 83_000,
        observedPrecisionMs: 0,
      });
    expect(parseGroundTruthInput('01:23', '-1', 'manual-estimate')).toBeNull();
  });
});
