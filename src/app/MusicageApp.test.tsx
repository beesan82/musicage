import { act, fireEvent, render, userEvent, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createEarEmitter } from '../audio/earStream';
import type { AudioFeatures, EarFeatures } from '../audio/types';
import { useMicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import type { ListeningStatus, MicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import { FIXTURE_LRC, FIXTURE_TRACK } from '../dev/fixture/fixtureSong';
import { parseLrc } from '../recognition/lrc';
import { OUTRO_MS } from '../sync/lineScheduler';
import { LyricStage } from '../typesetting/LyricStage';
import type { LyricStageProps } from '../typesetting/LyricStage';
import { MusicageApp } from './MusicageApp';

jest.mock('../audio/useMicrophoneAnalysis', () => ({
  useMicrophoneAnalysis: jest.fn(),
}));

// The dev frame-rate probe really runs under jest (requestAnimationFrame
// fires every ~10 ms) and after one second it appends " · <fps>" to the
// fixture pill label, which made the label assertions below time-dependent.
jest.mock('../dev/useFrameRate', () => ({
  useFrameRate: () => null,
}));

// The real stage renders (so its testIDs and the idle caption come from it);
// the wrapper only records the props the app hands it.
jest.mock('../typesetting/LyricStage', () => {
  const actual = jest.requireActual('../typesetting/LyricStage');
  const { createElement } = jest.requireActual('react');
  return {
    ...actual,
    LyricStage: jest.fn((props: object) => createElement(actual.LyricStage, props)),
  };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const app = (): ReactElement => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <MusicageApp reducedMotion />
  </SafeAreaProvider>
);

const renderApp = () => render(app());

const lastStageProps = (): LyricStageProps => {
  const calls = (LyricStage as unknown as jest.Mock).mock.calls;
  const props = calls[calls.length - 1]?.[0] as LyricStageProps | undefined;
  if (props === undefined) throw new Error('LyricStage was never rendered');
  return props;
};

const silentFeatures: AudioFeatures = {
  timestampMs: 0,
  energy: 0,
  low: 0,
  mid: 0,
  high: 0,
  transient: 0,
  silence: true,
};

const silentEar: EarFeatures = { timestampMs: 0, rms: 0, low: 0, mid: 0, high: 0 };

const nowPlayingCopy = ['NOW', 'PLAYING'].join(' ');

const createAnalysis = (
  status: ListeningStatus,
  start = jest.fn().mockResolvedValue(undefined),
  features: AudioFeatures = silentFeatures,
  ear: EarFeatures = silentEar,
): MicrophoneAnalysis => ({
  status,
  features,
  ear,
  earStream: createEarEmitter(),
  errorMessage: null,
  start,
  stop: jest.fn(),
  retry: jest.fn(),
});

describe('MusicageApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the visual-object shell and starts microphone analysis', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(
      createAnalysis('listening', start),
    );
    const screen = await renderApp();

    expect(screen.getByTestId('musicage-root')).toBeTruthy();
    expect(screen.getByText('MUSICAGE')).toBeTruthy();
    expect(screen.getByText('LISTENING')).toBeTruthy();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['denied', 'MIC OFF'],
    ['error', 'MIC ERROR'],
  ] as const)('renders %s as %s over a quiet idle stage', async (status, expectedLabel) => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis(status));
    const screen = await renderApp();

    expect(screen.getByText(expectedLabel)).toBeTruthy();
    expect(screen.getByTestId('lyric-stage')).toBeTruthy();
    expect(lastStageProps().beat.pulse).toBe(0);
  });

  it('keeps the recognition and microphone controls and no player controls', async () => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();

    expect(screen.getByRole('button', { name: '曲を読み取る' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'マイクを止める' })).toBeTruthy();
    expect(screen.queryByText(nowPlayingCopy)).toBeNull();
    // The only play button is the development fixture pill, never a media player.
    const playButtons = screen.queryAllByRole('button', { name: /再生|pause|play/i });
    expect(playButtons.map((button) => button.props.testID)).toEqual(
      __DEV__ ? ['fixture-control'] : [],
    );
  });

  it('hides and restores the controls when the empty scene is tapped', async () => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();
    const user = userEvent.setup();

    expect(screen.getByTestId('controls-stack').props.pointerEvents).toBe('auto');

    await user.press(screen.getByRole('button', { name: '操作を隠す' }));
    await screen.findByRole('button', { name: '操作を表示' });
    expect(screen.getByTestId('controls-stack').props.pointerEvents).toBe('none');
    expect(screen.getByText('MUSICAGE')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: '操作を表示' }));
    await screen.findByRole('button', { name: '操作を隠す' });
    expect(screen.getByTestId('controls-stack').props.pointerEvents).toBe('auto');
  });

  it('renders the lyric stage in idle with no track', async () => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();

    expect(screen.getByTestId('lyric-stage')).toBeTruthy();
    expect(lastStageProps().source).toEqual({ kind: 'idle', direction: null, track: null });
    expect(screen.queryByTestId('idle-caption')).toBeNull();
  });

  it('shows the fixture control in development and activates fixture playback', async () => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();

    expect(screen.getByTestId('fixture-control')).toBeTruthy();
    expect(screen.getByText('FIX OFF')).toBeTruthy();
    expect(lastStageProps().source.kind).toBe('idle');

    await fireEvent.press(screen.getByTestId('fixture-control'));

    const props = lastStageProps();
    expect(screen.queryByText('FIX OFF')).toBeNull();
    if (props.source.kind !== 'synced') throw new Error(`expected a synced source, got ${props.source.kind}`);
    expect(props.source.track).toEqual(FIXTURE_TRACK);
    expect(props.source.lines.length).toBeGreaterThan(0);
    expect(props.source.direction.lines).toHaveLength(props.source.lines.length);
    // The scheduled line and the stage clock are both on performance.now().
    expect(props.nowMonotonicMs).toBeGreaterThanOrEqual(props.source.scheduled.startedAtMs);

    await fireEvent(screen.getByTestId('fixture-control'), 'longPress');
    expect(lastStageProps().source.kind).toBe('idle');
    expect(screen.getByText('FIX OFF')).toBeTruthy();
  });

  it('keeps the stage inside the drifting text layer', async () => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();

    const textLayer = screen.getByTestId('text-layer');
    expect(within(textLayer).getByTestId('lyric-stage')).toBeTruthy();
    expect(within(textLayer).getByText('MUSICAGE')).toBeTruthy();
  });

  it('feeds the beat engine from microphone ear features', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const analysisAt = (timestampMs: number, level: number, status: ListeningStatus = 'listening') =>
      createAnalysis(status, start, silentFeatures, {
        timestampMs,
        rms: level,
        low: level,
        mid: level,
        high: level,
      });
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(analysisAt(0, 0.1));
    const screen = await renderApp();
    expect(lastStageProps().beat.pulse).toBe(0);

    // A steady bed long enough to give the onset detector its history...
    for (let t = 60; t <= 900; t += 60) {
      (useMicrophoneAnalysis as jest.Mock).mockReturnValue(analysisAt(t, 0.1));
      await screen.rerender(app());
    }
    expect(lastStageProps().beat.pulse).toBe(0);

    // ...then a hit.
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(analysisAt(960, 0.9));
    await screen.rerender(app());
    expect(lastStageProps().beat.pulse).toBeGreaterThan(0.5);

    // Leaving 'listening' resets the engine to a quiet beat.
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(analysisAt(1_020, 0.9, 'idle'));
    await act(async () => {
      await screen.rerender(app());
    });
    expect(lastStageProps().beat.pulse).toBe(0);
  });

  it('does not re-anchor the stage clock on ear-only re-renders', async () => {
    const analysisAt = (timestampMs: number) =>
      createAnalysis('listening', jest.fn(), silentFeatures, {
        timestampMs,
        rms: 0.1,
        low: 0.1,
        mid: 0.1,
        high: 0.1,
      });
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(analysisAt(0));
    const screen = await renderApp();
    const anchor = lastStageProps().nowMonotonicMs;
    const renders = (LyricStage as unknown as jest.Mock).mock.calls.length;

    for (let t = 60; t <= 300; t += 60) {
      (useMicrophoneAnalysis as jest.Mock).mockReturnValue(analysisAt(t));
      await screen.rerender(app());
    }

    expect((LyricStage as unknown as jest.Mock).mock.calls.length).toBeGreaterThan(renders);
    expect(lastStageProps().nowMonotonicMs).toBe(anchor);
  });

  describe('with a mocked monotonic clock', () => {
    // Jest's fake timers break Reanimated's mocked frame-callback registry, so
    // the 50 ms interval runs on real timers and only performance.now() is moved.
    let clockMs = 10_000;
    beforeEach(() => {
      clockMs = 10_000;
      jest.spyOn(performance, 'now').mockImplementation(() => clockMs);
    });
    afterEach(() => jest.restoreAllMocks());

    it('advances the fixture from its first line to its second on the scheduler tick', async () => {
      (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
      const screen = await renderApp();
      await fireEvent.press(screen.getByTestId('fixture-control'));

      const scheduledLine = () => {
        const { source } = lastStageProps();
        if (source.kind !== 'synced') throw new Error(`expected a synced source, got ${source.kind}`);
        return { index: source.scheduled.index, startedAtMs: source.scheduled.startedAtMs };
      };
      expect(scheduledLine().index).toBe(-1);

      // The fixture's first line starts at 0:02 and its second at 0:06.
      clockMs += 2_050;
      await waitFor(() => expect(scheduledLine().index).toBe(0));
      const first = scheduledLine();
      expect(first.startedAtMs).toBe(clockMs);
      expect(lastStageProps().nowMonotonicMs).toBe(first.startedAtMs);

      clockMs += 4_000;
      await waitFor(() => expect(scheduledLine().index).toBe(1));
      const second = scheduledLine();
      expect(second.index).toBe(1);
      expect(second.startedAtMs).toBeGreaterThan(first.startedAtMs);
      // The anchor moves only with the line, onto the same clock reading.
      expect(lastStageProps().nowMonotonicMs).toBe(second.startedAtMs);
    });

    it('returns the stage to idle 15 s after the last fixture line', async () => {
      (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
      const screen = await renderApp();
      await fireEvent.press(screen.getByTestId('fixture-control'));

      const scheduled = () => {
        const { source } = lastStageProps();
        if (source.kind !== 'synced') throw new Error(`expected a synced source, got ${source.kind}`);
        return source.scheduled;
      };
      const lines = parseLrc(FIXTURE_LRC);
      const lastStartMs = lines[lines.length - 1]!.startMs;
      const startMs = clockMs;

      // On the last line, within the outro window...
      clockMs = startMs + lastStartMs + 1_000;
      await waitFor(() => expect(scheduled().index).toBe(lines.length - 1));

      // ...then past the last line + OUTRO_MS: idle again (index −1, empty).
      clockMs = startMs + lastStartMs + OUTRO_MS + 100;
      await waitFor(() => expect(scheduled().index).toBe(-1));
      const idle = scheduled();
      expect(idle.isEmpty).toBe(true);
      expect(idle.startedAtMs).toBe(clockMs);
      expect(lastStageProps().nowMonotonicMs).toBe(clockMs);

      // Later ticks keep the same idle schedule instead of re-anchoring.
      clockMs += 500;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
      });
      expect(scheduled()).toBe(idle);
    });
  });
});
