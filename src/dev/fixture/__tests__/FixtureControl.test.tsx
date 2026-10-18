import { act, fireEvent, render } from '@testing-library/react-native';

import { useFrameRate } from '../../useFrameRate';
import { FIXTURE_DIRECTION } from '../fixtureSong';
import { FixtureControl } from '../FixtureControl';
import type { FixturePlayback } from '../useFixturePlayback';

jest.mock('../../useFrameRate', () => ({
  useFrameRate: jest.fn(),
}));

let nowMs = 0;

const playback = (overrides: Partial<FixturePlayback> = {}): FixturePlayback => ({
  enabled: true,
  active: false,
  paused: false,
  anchor: null,
  direction: FIXTURE_DIRECTION,
  toggle: jest.fn(),
  playPause: jest.fn(),
  seek: jest.fn(),
  reloadDirection: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  nowMs = 20_000;
  jest.spyOn(performance, 'now').mockImplementation(() => nowMs);
  (useFrameRate as jest.Mock).mockReturnValue(null);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('renders nothing when disabled', async () => {
  const screen = await render(<FixtureControl playback={playback({ enabled: false })} />);
  expect(screen.queryByTestId('fixture-control')).toBeNull();
  expect(screen.queryByTestId('fixture-seek-back')).toBeNull();
});

test('shows FIX OFF when inactive and toggles on by tap', async () => {
  const pb = playback();
  const screen = await render(<FixtureControl playback={pb} />);
  expect(screen.getByText('FIX OFF')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('fixture-control'));
  expect(pb.toggle).toHaveBeenCalledTimes(1);
  expect(pb.playPause).not.toHaveBeenCalled();
});

test('shows the playing position, refreshes it on an interval, and appends fps', async () => {
  (useFrameRate as jest.Mock).mockReturnValue(58);
  const pb = playback({
    active: true,
    anchor: { offsetMs: 0, anchoredAtMonotonicMs: 8_000 },
  });
  const screen = await render(<FixtureControl playback={pb} />);
  expect(screen.getByText('FIX ▶ 0:12 · 58')).toBeTruthy();

  nowMs = 21_000;
  await act(async () => {
    jest.advanceTimersByTime(250);
  });
  expect(screen.getByText('FIX ▶ 0:13 · 58')).toBeTruthy();
});

test('shows the frozen position while paused and taps play/pause', async () => {
  const pb = playback({
    active: true,
    paused: true,
    anchor: { offsetMs: 12_000, anchoredAtMonotonicMs: 1_000 },
  });
  const screen = await render(<FixtureControl playback={pb} />);
  expect(screen.getByText('FIX ❚❚ 0:12')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('fixture-control'));
  expect(pb.playPause).toHaveBeenCalledTimes(1);
});

test('long press toggles and the side buttons seek by 5 seconds', async () => {
  const pb = playback({ active: true, anchor: { offsetMs: 0, anchoredAtMonotonicMs: 20_000 } });
  const screen = await render(<FixtureControl playback={pb} />);
  await fireEvent(screen.getByTestId('fixture-control'), 'longPress');
  expect(pb.toggle).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByTestId('fixture-seek-back'));
  expect(pb.seek).toHaveBeenLastCalledWith(-5_000);
  await fireEvent.press(screen.getByTestId('fixture-seek-forward'));
  expect(pb.seek).toHaveBeenLastCalledWith(5_000);
});
