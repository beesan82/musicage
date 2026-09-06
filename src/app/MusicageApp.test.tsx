import { fireEvent, render } from '@testing-library/react-native';

import type { AudioFeatures } from '../audio/types';
import { useMicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import type { ListeningStatus, MicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import { useSongRecognition } from '../recognition/useSongRecognition';
import type { SongRecognition } from '../recognition/useSongRecognition';
import { MusicageApp } from './MusicageApp';

jest.mock('../audio/useMicrophoneAnalysis', () => ({
  useMicrophoneAnalysis: jest.fn(),
}));

jest.mock('../recognition/useSongRecognition', () => ({
  useSongRecognition: jest.fn(),
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

const createRecognition = (): SongRecognition => ({
  state: {
    phase: 'idle',
    result: null,
    message: null,
    retryable: false,
  },
  hasToken: false,
  pendingDiagnosticTrial: null,
  recognize: jest.fn(),
  retry: jest.fn(),
  refreshTokenPresence: jest.fn().mockResolvedValue(undefined),
});

describe('MusicageApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSongRecognition as jest.Mock).mockReturnValue(createRecognition());
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
});
