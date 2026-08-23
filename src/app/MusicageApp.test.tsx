import { render } from '@testing-library/react-native';

import { useMicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import type { ListeningStatus, MicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import { MusicageApp } from './MusicageApp';

jest.mock('../audio/useMicrophoneAnalysis', () => ({
  useMicrophoneAnalysis: jest.fn(),
}));

const createAnalysis = (
  status: ListeningStatus,
  start = jest.fn().mockResolvedValue(undefined),
): MicrophoneAnalysis => ({
  status,
  features: {
    timestampMs: 0,
    energy: 0,
    low: 0,
    mid: 0,
    high: 0,
    transient: 0,
    silence: true,
  },
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
    const screen = await render(<MusicageApp />);

    expect(screen.getByTestId('musicage-root')).toBeTruthy();
    expect(screen.getByText('MUSICAGE')).toBeTruthy();
    expect(screen.getByText('LISTENING')).toBeTruthy();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['denied', 'MIC OFF'],
    ['error', 'MIC ERROR'],
  ] as const)('renders %s as %s', async (status, expectedLabel) => {
    (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis(status));
    const screen = await render(<MusicageApp />);

    expect(screen.getByText(expectedLabel)).toBeTruthy();
  });
});
