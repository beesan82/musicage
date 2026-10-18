import { fireEvent, render, userEvent } from '@testing-library/react-native';

import type { AudioFeatures } from '../audio/types';
import { useMicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import type { ListeningStatus, MicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import { useSongRecognition } from '../recognition/useSongRecognition';
import type { SongRecognition } from '../recognition/useSongRecognition';
import type { LyricResult } from '../recognition/types';
import { useSyncDiagnostics } from '../recognition/syncDiagnostics/useSyncDiagnostics';
import type { SyncDiagnosticsController } from '../recognition/syncDiagnostics/useSyncDiagnostics';
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

const silentFeatures: AudioFeatures = {
  timestampMs: 0,
  energy: 0,
  low: 0,
  mid: 0,
  high: 0,
  transient: 0,
  silence: true,
};

const nowPlayingCopy = ['NOW', 'PLAYING'].join(' ');
const visualCopy = ['VISUAL', 'COPY'].join(' ');

const createAnalysis = (
  status: ListeningStatus,
  start = jest.fn().mockResolvedValue(undefined),
  features: AudioFeatures = silentFeatures,
): MicrophoneAnalysis => ({
  status,
  features,
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
    const screen = await render(<MusicageApp reducedMotion />);

    expect(screen.getByTestId('musicage-root')).toBeTruthy();
    expect(screen.getByText('MUSICAGE')).toBeTruthy();
    expect(screen.getByText('LISTENING')).toBeTruthy();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['denied', 'MIC OFF'],
    ['error', 'MIC ERROR'],
  ] as const)('renders %s as %s with a quiet Ambient fallback', async (status, expectedLabel) => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis(status));
    const screen = await render(<MusicageApp reducedMotion />);

    expect(screen.getByText(expectedLabel)).toBeTruthy();
    expect(screen.getByTestId('scene-ambient')).toBeTruthy();
  });

  it('composes a responsive visual scene with truthful idle copy and no player controls', async () => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(
      createAnalysis('listening', jest.fn(), {
        timestampMs: 0,
        energy: 0.7,
        low: 0.66,
        mid: 0.2,
        high: 0.14,
        transient: 0.8,
        silence: false,
      }),
    );
    const screen = await render(<MusicageApp reducedMotion />);

    expect(screen.getByTestId('musicage-root')).toBeTruthy();
    expect(screen.getByTestId('scene-dance')).toBeTruthy();
    expect(screen.getByText('曲を読み取ると、ここに実際の歌詞が表示されます。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '曲を読み取る' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'マイクを止める' })).toBeTruthy();
    expect(screen.queryByText(nowPlayingCopy)).toBeNull();
    expect(screen.queryByText(visualCopy)).toBeNull();
  });

  it('keeps the visual object free of playback controls after audio migration', async () => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await render(<MusicageApp reducedMotion />);

    expect(screen.queryByText(nowPlayingCopy)).toBeNull();
    expect(screen.queryByRole('button', { name: /再生|pause|play/i })).toBeNull();
  });

  it('starts local metering on mount but recognition only after an explicit press', async () => {
    const recognition = createRecognition();
    (useSongRecognition as jest.Mock).mockReturnValue(recognition);
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await render(<MusicageApp reducedMotion />);

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
    const screen = await render(<MusicageApp reducedMotion />);

    fireEvent.press(screen.getByRole('button', { name: '曲を読み取る' }));

    expect(recognition.recognize).toHaveBeenCalledWith({ mode: 'normal', clipDurationMs: 5_000 });
  });

  it('closes token settings before opening owner-only sync diagnostics', async () => {
    const recognition = createRecognition();
    recognition.state = { ...recognition.state, phase: 'setup_required' };
    (useSongRecognition as jest.Mock).mockReturnValue(recognition);
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await render(<MusicageApp reducedMotion />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'AudDキーを設定' }));
    await user.press(screen.getByRole('button', { name: '同期診断' }));

    expect(screen.getByText('動画の再生位置と録音開始フラッシュを照合して保存します。')).toBeTruthy();
    expect(screen.queryByText('PRIVATE SETUP')).toBeNull();
  });

  describe('dev scene lock', () => {
    const danceFeatures: AudioFeatures = {
      timestampMs: 0,
      energy: 0.7,
      low: 0.66,
      mid: 0.2,
      high: 0.14,
      transient: 0.8,
      silence: false,
    };

    it('cycles through all five scenes and releases back to the style engine', async () => {
      (useMicrophoneAnalysis as jest.Mock).mockReturnValue(
        createAnalysis('listening', jest.fn(), danceFeatures),
      );
      const screen = await render(<MusicageApp reducedMotion />);
      const user = userEvent.setup();

      expect(screen.getByTestId('scene-dance')).toBeTruthy();
      expect(screen.getByText('AUTO')).toBeTruthy();

      for (const style of ['ambient', 'jazz', 'pop', 'dance', 'rock'] as const) {
        await user.press(screen.getByTestId('scene-lock'));
        expect(await screen.findByTestId(`scene-${style}`)).toBeTruthy();
        expect(screen.getByText(style.toUpperCase())).toBeTruthy();
      }

      await user.press(screen.getByTestId('scene-lock'));
      expect(await screen.findByTestId('scene-dance')).toBeTruthy();
      expect(screen.getByText('AUTO')).toBeTruthy();
    });

    it('hides the lock control outside development builds', async () => {
      // __DEV__ is a global declared by react-native; the hook reads it at render time.
      const devGlobal = globalThis as { __DEV__?: boolean };
      const previous = devGlobal.__DEV__;
      devGlobal.__DEV__ = false;
      try {
        (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
        const screen = await render(<MusicageApp reducedMotion />);

        expect(screen.queryByTestId('scene-lock')).toBeNull();
        expect(screen.queryByText('AUTO')).toBeNull();
      } finally {
        devGlobal.__DEV__ = previous;
      }
    });
  });
});
