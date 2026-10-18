import { fireEvent, render } from '@testing-library/react-native';

import { SceneLockControl } from '../SceneLockControl';
import { useFrameRate } from '../useFrameRate';
import type { SceneLockController } from '../useSceneLock';

jest.mock('../useFrameRate', () => ({
  useFrameRate: jest.fn(),
}));

const controller = (overrides: Partial<SceneLockController> = {}): SceneLockController => ({
  enabled: true,
  locked: null,
  cycle: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  (useFrameRate as jest.Mock).mockReturnValue(null);
});

it('shows only the lock state until a frame rate has been measured', async () => {
  const screen = await render(<SceneLockControl sceneLock={controller({ locked: 'jazz' })} />);

  expect(screen.getByText('JAZZ')).toBeTruthy();
  expect(useFrameRate).toHaveBeenCalledWith(true);
});

it('shows the UI-thread frame rate next to the lock state', async () => {
  (useFrameRate as jest.Mock).mockReturnValue(58);
  const screen = await render(<SceneLockControl sceneLock={controller({ locked: 'jazz' })} />);

  expect(screen.getByText('JAZZ · 58')).toBeTruthy();
});

it('cycles the lock on press', async () => {
  const sceneLock = controller();
  const screen = await render(<SceneLockControl sceneLock={sceneLock} />);

  fireEvent.press(screen.getByTestId('scene-lock'));

  expect(sceneLock.cycle).toHaveBeenCalledTimes(1);
});

it('renders nothing and keeps the probe off when disabled', async () => {
  const screen = await render(<SceneLockControl sceneLock={controller({ enabled: false })} />);

  expect(screen.queryByTestId('scene-lock')).toBeNull();
  expect(useFrameRate).toHaveBeenCalledWith(false);
});
