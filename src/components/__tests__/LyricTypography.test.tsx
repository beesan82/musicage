import { render } from '@testing-library/react-native';

import { LyricTypography } from '../LyricTypography';
import type { LyricResult } from '../../recognition/types';
import type { VisualState } from '../../style/types';

const ambient: VisualState = {
  style: 'ambient',
  intensity: 0.2,
  motion: 0.1,
  textScale: 0.95,
  accent: 0.1,
  changedAtMs: 0,
};

const syncedResult: LyricResult = {
  kind: 'synced',
  track: {
    title: 'Test Track',
    artist: 'Test Artist',
    album: null,
    durationSeconds: null,
    timecodeSeconds: 10,
  },
  lines: [
    { startMs: 0, text: 'test previous line' },
    { startMs: 10_000, text: 'test current line' },
    { startMs: 20_000, text: 'test next line' },
  ],
  positionAtCaptureMs: 10_000,
  captureStartedMonotonicMs: performance.now(),
};

const visualCopy = ['VISUAL', 'COPY'].join(' ');

describe('LyricTypography', () => {
  it('renders a synchronized current line but no visual sample copy', async () => {
    const screen = await render(
      <LyricTypography lyricResult={syncedResult} reducedMotion visual={ambient} />,
    );

    expect(screen.getByText('同期歌詞')).toBeTruthy();
    expect(screen.getByText('test previous line')).toBeTruthy();
    expect(screen.getByText('test current line')).toBeTruthy();
    expect(screen.getByText('test next line')).toBeTruthy();
    expect(screen.queryByText(visualCopy)).toBeNull();
    expect(screen.queryByText('THE ROOM MOVES')).toBeNull();
  });

  it('renders plain and unavailable lyric states honestly', async () => {
    const plainResult: LyricResult = {
      kind: 'plain',
      track: syncedResult.track,
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
        lyricResult={{ kind: 'lyrics_unavailable', track: syncedResult.track }}
        reducedMotion
        visual={ambient}
      />,
    );

    expect(unavailable.getByText('この曲の歌詞は見つかりませんでした')).toBeTruthy();
  });
});
