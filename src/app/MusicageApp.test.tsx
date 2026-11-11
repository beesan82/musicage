import { act, fireEvent, render, userEvent, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createEarEmitter } from '../audio/earStream';
import type { EarEmitter } from '../audio/earStream';
import type { EarFeatures, ListeningStatus } from '../audio/types';
import { useEar } from '../audio/useEar';
import type { Ear } from '../audio/useNativeEar';
import { FIXTURE_LRC, FIXTURE_TRACK } from '../dev/fixture/fixtureSong';
import { DEFAULT_PALETTE } from '../direction/types';
import { chromeTheme, withAlpha } from '../theme/chrome';
import { parseLrc } from '../recognition/lrc';
import { RECOGNITION_COPY } from '../recognition/recognitionCopy';
import type {
  LyricResult,
  RecognitionViewState,
  TimestampedLyricResult,
  Track,
} from '../recognition/types';
import { useEarRecognition } from '../recognition/useEarRecognition';
import type { EarRecognitionController } from '../recognition/useEarRecognition';
import { useSettings } from '../settings/useSettings';
import { OUTRO_MS } from '../sync/lineScheduler';
import { LyricStage } from '../typesetting/LyricStage';
import type { LyricStageProps } from '../typesetting/LyricStage';
import { MusicageApp } from './MusicageApp';

jest.mock('../audio/useEar', () => ({ useEar: jest.fn() }));
jest.mock('../recognition/useEarRecognition', () => ({ useEarRecognition: jest.fn() }));
jest.mock('../settings/useSettings', () => ({ useSettings: jest.fn() }));

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

const nowPlayingCopy = ['NOW', 'PLAYING'].join(' ');

const track: Track = {
  trackId: 'shazam-1',
  title: '架空の歌',
  artist: '架空の人',
  album: null,
  artworkUrl: null,
};

const IDLE_STATE: RecognitionViewState = {
  phase: 'idle',
  result: null,
  message: null,
  retryable: false,
};

const UNAVAILABLE_STATE: RecognitionViewState = {
  phase: 'unavailable',
  result: null,
  message: RECOGNITION_COPY.unavailable,
  retryable: false,
};

interface EarOptions {
  kind?: Ear['kind'];
  status?: ListeningStatus;
  emitter?: EarEmitter;
}

const createEar = ({ kind = 'native', status = 'listening', emitter = createEarEmitter() }: EarOptions = {}) => ({
  kind,
  status,
  errorMessage: null,
  earStream: emitter,
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  retry: jest.fn().mockResolvedValue(undefined),
  recognizer: null,
}) satisfies Ear;

const createRecognition = (state: RecognitionViewState = IDLE_STATE) => ({
  state,
  recognize: jest.fn(),
  cancel: jest.fn(),
}) satisfies EarRecognitionController;

const createSettings = (autoRecognize = true, ready = true) => ({
  settings: { autoRecognize },
  ready,
  update: jest.fn().mockResolvedValue(undefined),
});

const frame = (timestampMs: number, level: number): EarFeatures => ({
  timestampMs,
  rms: level,
  low: level,
  mid: level,
  high: level,
});

/** Silence long enough for the engine to call it silent, then sound. */
const silenceThenSound = async (emitter: EarEmitter) => {
  for (let t = 0; t <= 700; t += 20) {
    await act(async () => emitter.emit(frame(t, 0)));
  }
  for (let t = 720; t <= 860; t += 20) {
    await act(async () => emitter.emit(frame(t, 0.3)));
  }
};

const mockApp = ({
  ear = createEar(),
  recognition = createRecognition(),
  settings = createSettings(),
}: {
  ear?: Ear;
  recognition?: EarRecognitionController;
  settings?: ReturnType<typeof createSettings>;
} = {}) => {
  (useEar as jest.Mock).mockReturnValue(ear);
  (useEarRecognition as jest.Mock).mockReturnValue(recognition);
  (useSettings as jest.Mock).mockReturnValue(settings);
  return { ear, recognition, settings };
};

describe('MusicageApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the stage, starts the ear, and shows LISTENING', async () => {
    const { ear } = mockApp();
    const screen = await renderApp();

    expect(screen.getByTestId('musicage-root')).toBeTruthy();
    expect(screen.getByTestId('lyric-stage')).toBeTruthy();
    expect(screen.getByText('MUSICAGE')).toBeTruthy();
    expect(screen.getByText('LISTENING')).toBeTruthy();
    expect(ear.start).toHaveBeenCalledTimes(1);
    expect(useEarRecognition).toHaveBeenCalledWith(ear.recognizer, 'listening');
  });

  it.each([
    ['denied', 'MIC OFF'],
    ['error', 'MIC ERROR'],
    ['idle', 'IDLE'],
  ] as const)('renders %s as %s over a quiet idle stage', async (status, expectedLabel) => {
    mockApp({ ear: createEar({ status }) });
    const screen = await renderApp();

    expect(screen.getByText(expectedLabel)).toBeTruthy();
    expect(screen.getByTestId('lyric-stage')).toBeTruthy();
    expect(lastStageProps().beat.pulse).toBe(0);
  });

  it('shows MATCHING while listening for a match and LYRICS while resolving', async () => {
    mockApp({ recognition: createRecognition({ ...IDLE_STATE, phase: 'listening' }) });
    const screen = await renderApp();
    expect(screen.getByText('MATCHING')).toBeTruthy();
    expect(screen.getByRole('button', { name: '聴き取り中…' })).toBeTruthy();

    mockApp({ recognition: createRecognition({ ...IDLE_STATE, phase: 'resolving_lyrics' }) });
    await screen.rerender(app());
    expect(screen.getByText('LYRICS')).toBeTruthy();
    expect(screen.queryByText('MATCHING')).toBeNull();
  });

  it('starts the ear on mount but recognition only after an explicit press (when auto recognition is disabled)', async () => {
    const emitter = createEarEmitter();
    const { ear, recognition } = mockApp({
      ear: createEar({ emitter }),
      settings: createSettings(false),
    });
    const screen = await renderApp();
    expect(ear.start).toHaveBeenCalledTimes(1);

    await silenceThenSound(emitter);
    expect(recognition.recognize).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: '曲を読み取る' }));
    expect(recognition.recognize).toHaveBeenCalledTimes(1);
  });

  it('cancels a match from the listening button', async () => {
    const { recognition } = mockApp({
      recognition: createRecognition({ ...IDLE_STATE, phase: 'listening' }),
    });
    const screen = await renderApp();

    await fireEvent.press(screen.getByRole('button', { name: '聴き取り中…' }));
    expect(recognition.cancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the recognition and microphone controls and no player controls', async () => {
    mockApp();
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

  it('shows a plain-lyrics result as the lyric sheet, with its honest note', async () => {
    const plain: LyricResult = { kind: 'plain', track, text: '夜の底で' };
    mockApp({ recognition: createRecognition({ ...IDLE_STATE, result: plain }) });
    const screen = await renderApp();

    expect(lastStageProps().source).toMatchObject({
      kind: 'plain',
      text: '夜の底で',
      track: { title: track.title, artist: track.artist },
    });
    expect(screen.getByTestId('plain-note').props.text).toBe(RECOGNITION_COPY.lyrics_plain_sheet);
    expect(screen.getByTestId('plain-body')).toBeTruthy();
    expect(screen.queryByTestId('unsynced-note')).toBeNull();
    expect(screen.queryByTestId('idle-caption')).toBeNull();
    // The chrome takes the song's palette, as for a synced song.
    expect(lastStageProps().source.direction).not.toBeNull();
  });

  it('keeps a plain result with nothing printable as the nameplate, with its note', async () => {
    const plain: LyricResult = { kind: 'plain', track, text: '  \n \n' };
    mockApp({ recognition: createRecognition({ ...IDLE_STATE, result: plain }) });
    const screen = await renderApp();

    expect(lastStageProps().source).toMatchObject({ kind: 'unsynced', reason: 'plain' });
    expect(screen.getByTestId('unsynced-note').props.text).toBe(RECOGNITION_COPY.lyrics_unsynced);
  });

  it('renders the lyric stage in idle with no track', async () => {
    mockApp();
    const screen = await renderApp();

    expect(lastStageProps().source).toEqual({ kind: 'idle', direction: null, track: null });
    expect(screen.queryByTestId('idle-caption')).toBeNull();
  });

  it('in Expo Go the recognize button is disabled with the development build copy and the fixture still plays', async () => {
    const emitter = createEarEmitter();
    const { recognition } = mockApp({
      ear: createEar({ kind: 'meter', emitter }),
      recognition: createRecognition(UNAVAILABLE_STATE),
    });
    const screen = await renderApp();

    const button = screen.getByRole('button', { name: '曲を読み取る' });
    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.getByText(RECOGNITION_COPY.unavailable)).toBeTruthy();
    await fireEvent.press(button);
    expect(recognition.recognize).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('fixture-control'));
    const props = lastStageProps();
    if (props.source.kind !== 'synced') throw new Error(`expected a synced source, got ${props.source.kind}`);
    expect(props.source.track).toEqual(FIXTURE_TRACK);
    // Stop the fixture so its pill's refresh interval cannot fire after the test.
    await fireEvent(screen.getByTestId('fixture-control'), 'longPress');
  });

  it('auto recognition fires on the first sound when enabled and native, not when disabled or on the meter ear', async () => {
    const cases: Array<{ kind: Ear['kind']; autoRecognize: boolean; fires: boolean }> = [
      { kind: 'native', autoRecognize: true, fires: true },
      { kind: 'native', autoRecognize: false, fires: false },
      { kind: 'meter', autoRecognize: true, fires: false },
    ];
    for (const { kind, autoRecognize, fires } of cases) {
      const emitter = createEarEmitter();
      const { recognition } = mockApp({
        ear: createEar({ kind, emitter }),
        recognition: createRecognition(kind === 'meter' ? UNAVAILABLE_STATE : IDLE_STATE),
        settings: createSettings(autoRecognize),
      });
      const screen = await renderApp();

      // Silence never fires...
      for (let t = 0; t <= 700; t += 20) {
        await act(async () => emitter.emit(frame(t, 0)));
      }
      expect(recognition.recognize).not.toHaveBeenCalled();

      // ...the first sound does, once, only for the enabled native ear.
      for (let t = 720; t <= 860; t += 20) {
        await act(async () => emitter.emit(frame(t, 0.3)));
      }
      expect(recognition.recognize).toHaveBeenCalledTimes(fires ? 1 : 0);
      await screen.unmount();
    }
  });

  it('does not auto-recognize while the ear is not listening', async () => {
    const emitter = createEarEmitter();
    const { recognition } = mockApp({ ear: createEar({ status: 'requesting', emitter }) });
    await renderApp();

    await silenceThenSound(emitter);
    expect(recognition.recognize).not.toHaveBeenCalled();
  });

  it('does not auto-recognize before the stored settings have loaded', async () => {
    const emitter = createEarEmitter();
    const { recognition } = mockApp({
      ear: createEar({ emitter }),
      settings: createSettings(true, false),
    });
    await renderApp();

    await silenceThenSound(emitter);
    expect(recognition.recognize).not.toHaveBeenCalled();
  });

  it('opens the settings sheet from the controls and toggles auto recognition', async () => {
    const { settings } = mockApp({ settings: createSettings(true) });
    const screen = await renderApp();
    expect(screen.queryByLabelText('曲の自動読み取り')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: '設定' }));
    const toggle = screen.getByLabelText('曲の自動読み取り');
    expect(toggle.props.value).toBe(true);

    await fireEvent(toggle, 'valueChange', false);
    expect(settings.update).toHaveBeenCalledWith({ autoRecognize: false });

    await fireEvent.press(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByLabelText('曲の自動読み取り')).toBeNull();
  });

  it('ignores the auto recognition toggle until the settings have loaded', async () => {
    const { settings } = mockApp({ settings: createSettings(false, false) });
    const screen = await renderApp();

    await fireEvent.press(screen.getByRole('button', { name: '設定' }));
    await fireEvent(screen.getByLabelText('曲の自動読み取り'), 'valueChange', true);
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('hides and restores the controls when the empty scene is tapped', async () => {
    mockApp();
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

  it('shows the fixture control in development and activates fixture playback', async () => {
    mockApp();
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
    mockApp();
    const screen = await renderApp();

    const textLayer = screen.getByTestId('text-layer');
    expect(within(textLayer).getByTestId('lyric-stage')).toBeTruthy();
    expect(within(textLayer).getByText('MUSICAGE')).toBeTruthy();
  });

  it('does not re-anchor the stage clock on ear frames', async () => {
    const emitter = createEarEmitter();
    mockApp({ ear: createEar({ emitter }), settings: createSettings(false) });
    await renderApp();
    const anchor = lastStageProps().nowMonotonicMs;
    const renders = (LyricStage as unknown as jest.Mock).mock.calls.length;

    for (let t = 0; t <= 300; t += 20) {
      await act(async () => emitter.emit(frame(t, 0.1)));
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

    it('passes a timestamped result to the stage as a synced source', async () => {
      const result: TimestampedLyricResult = {
        kind: 'timestamped',
        track,
        lines: [
          { startMs: 0, text: '夜の底で' },
          { startMs: 4_000, text: '走れ！' },
        ],
        anchor: { offsetMs: 1_000, anchoredAtMonotonicMs: 10_000 },
      };
      mockApp({ recognition: createRecognition({ ...IDLE_STATE, result }) });
      await renderApp();

      const synced = () => {
        const { source } = lastStageProps();
        if (source.kind !== 'synced') throw new Error(`expected a synced source, got ${source.kind}`);
        return source;
      };
      expect(synced().lines).toBe(result.lines);
      expect(synced().track).toEqual({ title: track.title, artist: track.artist });
      expect(synced().scheduled.index).toBe(0);

      clockMs = 13_100; // song position 4_100 ms → line 1
      await waitFor(() => expect(synced().scheduled.index).toBe(1));
      expect(lastStageProps().nowMonotonicMs).toBe(synced().scheduled.startedAtMs);
    });

    it('advances the fixture from its first line to its second on the scheduler tick', async () => {
      mockApp();
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
      await fireEvent(screen.getByTestId('fixture-control'), 'longPress');
    });

    it('returns the stage to idle 15 s after the last fixture line', async () => {
      mockApp();
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
      await fireEvent(screen.getByTestId('fixture-control'), 'longPress');
    });
  });
});

describe('MusicageApp chrome (stage F)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const styleOf = (element: { props: { style?: unknown } }) =>
    StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

  const stagePalette = () => lastStageProps().source.direction?.palette ?? DEFAULT_PALETTE;

  it('marks the status with a still dot: hollow idle, filled listening, ringed matching', async () => {
    mockApp({ ear: createEar({ status: 'idle' }) });
    const screen = await renderApp();
    expect(screen.getByTestId('status-dot-hollow')).toBeTruthy();

    mockApp();
    await screen.rerender(app());
    expect(screen.getByTestId('status-dot-filled')).toBeTruthy();

    mockApp({ recognition: createRecognition({ ...IDLE_STATE, phase: 'listening' }) });
    await screen.rerender(app());
    const ring = styleOf(screen.getByTestId('status-dot-ringed'));
    expect(ring.borderColor).toBe(DEFAULT_PALETTE.accent);
    expect(ring.borderWidth).toBe(1);
  });

  it('prints the wordmark and status from the stage palette and follows a palette change', async () => {
    mockApp();
    const screen = await renderApp();

    const before = chromeTheme(DEFAULT_PALETTE);
    expect(styleOf(screen.getByTestId('wordmark'))).toMatchObject({
      color: withAlpha(before.ink, 0.85),
      fontSize: 12,
      letterSpacing: 5,
    });
    expect(styleOf(screen.getByText('LISTENING')).color).toBe(before.inkMuted);

    await fireEvent.press(screen.getByTestId('fixture-control'));
    const fixture = chromeTheme(stagePalette());
    expect(fixture.ink).not.toBe(before.ink);
    expect(styleOf(screen.getByTestId('wordmark')).color).toBe(withAlpha(fixture.ink, 0.85));
    expect(styleOf(screen.getByTestId('recognize-button')).borderColor).toBe(fixture.accent);

    await fireEvent.press(screen.getByTestId('fixture-palette'));
    const next = chromeTheme(stagePalette());
    expect(next.ink).not.toBe(fixture.ink);
    expect(styleOf(screen.getByTestId('wordmark')).color).toBe(withAlpha(next.ink, 0.85));
    expect(styleOf(screen.getByTestId('fixture-palette')).borderColor).toBe(next.border);

    await fireEvent(screen.getByTestId('fixture-control'), 'longPress');
  });

  it('uses the system font until fonts are handed in, then the gothic', async () => {
    mockApp();
    const screen = await renderApp();
    expect(styleOf(screen.getByTestId('wordmark')).fontFamily).toBeUndefined();

    await screen.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <MusicageApp chromeFonts={{ regular: 'Gothic-R', bold: 'Gothic-B' }} reducedMotion />
      </SafeAreaProvider>,
    );
    expect(styleOf(screen.getByTestId('wordmark')).fontFamily).toBe('Gothic-B');
    expect(styleOf(screen.getByText('LISTENING')).fontFamily).toBe('Gothic-R');
  });
});
