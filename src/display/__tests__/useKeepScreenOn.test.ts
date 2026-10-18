import { renderHook } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { useKeepScreenOn } from '../useKeepScreenOn';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

it('holds the screen awake only while active and releases it when listening stops', async () => {
  const hook = await renderHook(({ active }: { active: boolean }) => useKeepScreenOn(active), {
    initialProps: { active: false },
  });

  expect(activateKeepAwakeAsync).not.toHaveBeenCalled();

  await hook.rerender({ active: true });
  expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
  expect(deactivateKeepAwake).not.toHaveBeenCalled();

  await hook.rerender({ active: false });
  expect(deactivateKeepAwake).toHaveBeenCalledTimes(1);
});

it('releases the screen on unmount', async () => {
  const hook = await renderHook(() => useKeepScreenOn(true));

  expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);

  await hook.unmount();
  expect(deactivateKeepAwake).toHaveBeenCalledTimes(1);
});
