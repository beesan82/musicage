import { render } from '@testing-library/react-native';

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

const visualCopy = ['VISUAL', 'COPY'].join(' ');

describe('LyricTypography', () => {
  it('renders a static real LRC excerpt without claiming synchronization', async () => {
    const screen = await render(
      <LyricTypography lyricResult={timestampedResult} reducedMotion visual={ambient} />,
    );

    expect(screen.getByText('歌詞')).toBeTruthy();
    expect(screen.getByText('test first line')).toBeTruthy();
    expect(screen.getByText('test second line\ntest third line')).toBeTruthy();
    expect(screen.queryByText('同期歌詞')).toBeNull();
    expect(screen.queryByText(visualCopy)).toBeNull();
    expect(screen.queryByText('THE ROOM MOVES')).toBeNull();
  });

  it('renders plain and unavailable lyric states honestly', async () => {
    const plainResult: LyricResult = {
      kind: 'plain',
      track,
      text: 'first real phrase\nsecond real phrase\n\nnot in the first group',
    };
    const plain = await render(
      <LyricTypography lyricResult={plainResult} reducedMotion visual={ambient} />,
    );

    expect(plain.getByText('first real phrase')).toBeTruthy();
    expect(plain.getByText('second real phrase')).toBeTruthy();
    expect(plain.queryByText('not in the first group')).toBeNull();
    expect(plain.queryByText('同期歌詞')).toBeNull();

    const unavailable = await render(
      <LyricTypography
        lyricResult={{ kind: 'lyrics_unavailable', track }}
        reducedMotion
        visual={ambient}
      />,
    );

    expect(unavailable.getByText('この曲の歌詞は見つかりませんでした')).toBeTruthy();
  });
});
