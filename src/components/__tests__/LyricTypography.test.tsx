import { act, render } from '@testing-library/react-native';

import { LyricTypography } from '../LyricTypography';
import type { LyricResult, Track } from '../../recognition/types';
import type { VisualState } from '../../style/types';

const ambient: VisualState = {
  style: 'ambient',
  intensity: 0.2,
  motion: 0.1,
  textScale: 0.95,
  accent: 0.1,
  changedAtMs: 0,
};

const track: Track = {
  title: 'Test Track',
  artist: 'Test Artist',
  album: null,
  durationSeconds: null,
  timecodeRaw: '00:10',
  timecodeMs: 10_000,
};

const timestampedResult: LyricResult = {
  kind: 'timestamped',
  track,
  lines: [
    { startMs: 0, text: 'test first line' },
    { startMs: 10_000, text: 'test second line' },
    { startMs: 20_000, text: 'test third line' },
  ],
  timingEvidence: {
    clipDurationMs: 12_000,
    captureStartedMonotonicMs: 1_000,
    auddTimecodeMs: 10_000,
  },
};

const calibration = {
  schemaVersion: 1 as const,
  clipDurationMs: 12_000 as const,
  anchorOffsetMs: 4_050,
  acceptedSampleCount: 9,
};

const visualCopy = ['VISUAL', 'COPY'].join(' ');

describe('LyricTypography', () => {
  it('renders a static real LRC excerpt without claiming synchronization', async () => {
    const screen = await render(
      <LyricTypography
        calibration={null}
        lyricResult={timestampedResult}
        reducedMotion
        visual={ambient}
      />,
    );

    expect(screen.getByText('歌詞')).toBeTruthy();
    expect(screen.getByText('test first line')).toBeTruthy();
    expect(screen.getByText('test second line\ntest third line')).toBeTruthy();
    expect(screen.queryByText('同期歌詞')).toBeNull();
    expect(screen.queryByText(visualCopy)).toBeNull();
    expect(screen.queryByText('THE ROOM MOVES')).toBeNull();
  });

  it('changes the active line only while a matching calibration is present', async () => {
    jest.useFakeTimers();
    const now = jest.spyOn(performance, 'now');
    now.mockReturnValue(14_100);
    const calibratedResult: LyricResult = {
      ...timestampedResult,
      lines: [
        { startMs: 83_000, text: 'first real line' },
        { startMs: 85_000, text: 'second real line' },
      ],
      timingEvidence: {
        ...timestampedResult.timingEvidence,
        captureStartedMonotonicMs: 10_000,
        auddTimecodeMs: 83_000,
      },
    };
    const screen = await render(
      <LyricTypography
        calibration={calibration}
        lyricResult={calibratedResult}
        reducedMotion
        visual={ambient}
      />,
    );

    expect(screen.getByText('同期歌詞')).toBeTruthy();
    expect(screen.getByText('first real line')).toBeTruthy();

    now.mockReturnValue(16_100);
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(screen.getByText('second real line')).toBeTruthy();

    now.mockRestore();
    jest.useRealTimers();
  });

  it('returns the same timestamped result to static lyrics when calibration is cleared', async () => {
    const screen = await render(
      <LyricTypography
        calibration={calibration}
        lyricResult={timestampedResult}
        reducedMotion
        visual={ambient}
      />,
    );

    await act(async () => {
      screen.rerender(
        <LyricTypography
          calibration={null}
          lyricResult={timestampedResult}
          reducedMotion
          visual={ambient}
        />,
      );
    });

    expect(screen.getByText('歌詞')).toBeTruthy();
    expect(screen.queryByText('同期歌詞')).toBeNull();
  });

  it('renders plain and unavailable lyric states honestly', async () => {
    const plainResult: LyricResult = {
      kind: 'plain',
      track,
      text: 'first real phrase\nsecond real phrase\n\nnot in the first group',
    };
    const plain = await render(
      <LyricTypography calibration={null} lyricResult={plainResult} reducedMotion visual={ambient} />,
    );

    expect(plain.getByText('first real phrase')).toBeTruthy();
    expect(plain.getByText('second real phrase')).toBeTruthy();
    expect(plain.queryByText('not in the first group')).toBeNull();
    expect(plain.queryByText('同期歌詞')).toBeNull();

    const unavailable = await render(
      <LyricTypography
        lyricResult={{ kind: 'lyrics_unavailable', track }}
        calibration={null}
        reducedMotion
        visual={ambient}
      />,
    );

    expect(unavailable.getByText('この曲の歌詞は見つかりませんでした')).toBeTruthy();
  });
});
