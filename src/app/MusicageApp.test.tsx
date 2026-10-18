import { act, fireEvent, render, userEvent, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AudioFeatures, EarFeatures } from '../audio/types';
import { useMicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import type { ListeningStatus, MicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import { FIXTURE_TRACK } from '../dev/fixture/fixtureSong';
import { useSongRecognition } from '../recognition/useSongRecognition';
import type { SongRecognition } from '../recognition/useSongRecognition';
import type { LyricResult, Track } from '../recognition/types';
import { useSyncDiagnostics } from '../recognition/syncDiagnostics/useSyncDiagnostics';
import type { SyncDiagnosticsController } from '../recognition/syncDiagnostics/useSyncDiagnostics';
import { LyricStage } from '../typesetting/LyricStage';
import type { LyricStageProps } from '../typesetting/LyricStage';
import { MusicageApp } from './MusicageApp';

jest.mock('../audio/useMicrophoneAnalysis', () => ({
  useMicrophoneAnalysis: jest.fn(),
}));

jest.mock('../recognition/useSongRecognition', () => ({
  useSongRecognition: jest.fn(),
}));

jest.mock('../recognition/syncDiagnostics/useSyncDiagnostics', () => ({
  useSyncDiagnostics: jest.fn(),
}));

jest.mock('../recognition/tokenStore', () => ({
  clearAudDToken: jest.fn(),
  saveAudDToken: jest.fn(),
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

const track: Track = {
  title: 'Song',
  artist: 'Band',
  album: null,
  durationSeconds: null,
  timecodeRaw: null,
  timecodeMs: null,
};

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
  errorMessage: null,
  start,
  stop: jest.fn(),
  retry: jest.fn(),
  pauseForRecognition: jest.fn().mockResolvedValue(false),
  resumeAfterRecognition: jest.fn().mockResolvedValue(undefined),
});

const createRecognition = (result: LyricResult | null = null): SongRecognition => ({
  state: {
    phase: 'idle',
    result,
    message: null,
    retryable: false,
  },
  hasToken: false,
  pendingDiagnosticTrial: null,
  recognize: jest.fn(),
  retry: jest.fn(),
  refreshTokenPresence: jest.fn().mockResolvedValue(undefined),
});

const createDiagnostics = (approvedCalibration: SyncDiagnosticsController['approvedCalibration'] = null): SyncDiagnosticsController => ({
  ready: true, storageError: null, samples: [], evaluations: [], approvedCalibration,
  decision: { kind: 'undecided' }, captureFlashVisible: false,
  notifyCaptureStarted: jest.fn(), saveTrial: jest.fn().mockResolvedValue(undefined),
  approveRecommendedCalibration: jest.fn().mockResolvedValue(undefined),
  rejectAudDAsClock: jest.fn().mockResolvedValue(undefined), clearDiagnostics: jest.fn().mockResolvedValue(undefined),
});

describe('MusicageApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSongRecognition as jest.Mock).mockReturnValue(createRecognition());
    (useSyncDiagnostics as jest.Mock).mockReturnValue(createDiagnostics());
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

  it('starts local metering on mount but recognition only after an explicit press', async () => {
    const recognition = createRecognition();
    (useSongRecognition as jest.Mock).mockReturnValue(recognition);
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();

    expect(recognition.recognize).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: '曲を読み取る' }));
    expect(recognition.recognize).toHaveBeenCalledTimes(1);
  });

  it('uses the approved duration for a normal owner recognition request', async () => {
    const recognition = createRecognition();
    (useSongRecognition as jest.Mock).mockReturnValue(recognition);
    (useSyncDiagnostics as jest.Mock).mockReturnValue(createDiagnostics({
      schemaVersion: 1, clipDurationMs: 5_000, anchorOffsetMs: 4_000, acceptedSampleCount: 9,
    }));
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();

    fireEvent.press(screen.getByRole('button', { name: '曲を読み取る' }));

    expect(recognition.recognize).toHaveBeenCalledWith({ mode: 'normal', clipDurationMs: 5_000 });
  });

  it('closes token settings before opening owner-only sync diagnostics', async () => {
    const recognition = createRecognition();
    recognition.state = { ...recognition.state, phase: 'setup_required' };
    (useSongRecognition as jest.Mock).mockReturnValue(recognition);
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'AudDキーを設定' }));
    await user.press(screen.getByRole('button', { name: '同期診断' }));

    expect(screen.getByText('動画の再生位置と録音開始フラッシュを照合して保存します。')).toBeTruthy();
    expect(screen.queryByText('PRIVATE SETUP')).toBeNull();
  });

  it('names the recognition phase in the corner status while the meter is paused', async () => {
    const recognition = createRecognition();
    recognition.state = { ...recognition.state, phase: 'identifying' };
    (useSongRecognition as jest.Mock).mockReturnValue(recognition);
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();

    expect(screen.getByText('IDENTIFYING')).toBeTruthy();
    expect(screen.queryByText('LISTENING')).toBeNull();
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

  it('passes the recognized track to the stage as idle caption', async () => {
    (useSongRecognition as jest.Mock).mockReturnValue(createRecognition({
      kind: 'timestamped',
      track,
      lines: [
        { startMs: 0, text: '夜の底で' },
        { startMs: 4_000, text: '走れ！' },
      ],
      timingEvidence: { clipDurationMs: 12_000, captureStartedMonotonicMs: 0, auddTimecodeMs: null },
    }));
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();

    expect(screen.getByTestId('idle-caption').props.text).toBe('Band — Song');
    const { source } = lastStageProps();
    expect(source.kind).toBe('idle');
    expect(source.track).toEqual({ title: 'Song', artist: 'Band' });
    // Only timestamped lyrics get a direction (for its idle glyphs and palette).
    expect(source.direction?.lines).toHaveLength(2);
  });

  it('gives a plain-lyrics track a caption but no direction', async () => {
    (useSongRecognition as jest.Mock).mockReturnValue(createRecognition({
      kind: 'plain',
      track,
      text: '夜の底で',
    }));
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await renderApp();

    expect(screen.getByTestId('idle-caption').props.text).toBe('Band — Song');
    expect(lastStageProps().source).toEqual({
      kind: 'idle',
      direction: null,
      track: { title: 'Song', artist: 'Band' },
    });
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
});
