import { render } from '@testing-library/react-native';

import type { AudioFeatures } from '../audio/types';
import { useMicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import type { ListeningStatus, MicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import { MusicageApp } from './MusicageApp';

jest.mock('../audio/useMicrophoneAnalysis', () => ({
  useMicrophoneAnalysis: jest.fn(),
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

describe('MusicageApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('composes a responsive visual scene without player controls', async () => {
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
    expect(screen.getByText('VISUAL COPY')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'マイクを止める' })).toBeTruthy();
    expect(screen.queryByText('NOW PLAYING')).toBeNull();
  });

  it('keeps the visual object free of playback controls after audio migration', async () => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
    const screen = await render(<MusicageApp reducedMotion />);

    expect(screen.queryByText('NOW PLAYING')).toBeNull();
    expect(screen.queryByRole('button', { name: /再生|pause|play/i })).toBeNull();
  });
});
