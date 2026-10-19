import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useSettings } from '../useSettings';
import * as store from '../settingsStore';

jest.mock('../settingsStore', () => ({
  DEFAULT_SETTINGS: { autoRecognize: true },
  loadSettings: jest.fn(),
  saveSettings: jest.fn(),
}));

const loadSettings = store.loadSettings as jest.Mock;
const saveSettings = store.saveSettings as jest.Mock;

test('loads settings on mount, ready flips to true, update saves and reflects', async () => {
  let release!: (v: { autoRecognize: boolean }) => void;
  loadSettings.mockReturnValue(new Promise((r) => (release = r)));
  saveSettings.mockResolvedValue(undefined);

  const { result } = await renderHook(() => useSettings());
  expect(result.current.ready).toBe(false);
  expect(result.current.settings).toEqual({ autoRecognize: true });

  await act(async () => {
    release({ autoRecognize: false });
  });
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.settings).toEqual({ autoRecognize: false });

  await act(async () => {
    await result.current.update({ autoRecognize: true });
  });
  expect(saveSettings).toHaveBeenCalledWith({ autoRecognize: true });
  expect(result.current.settings).toEqual({ autoRecognize: true });
});

test('update resolves and reflects the new value when saving fails', async () => {
  loadSettings.mockResolvedValue({ autoRecognize: true });
  saveSettings.mockResolvedValue(false);

  const { result } = await renderHook(() => useSettings());
  await waitFor(() => expect(result.current.ready).toBe(true));

  await act(async () => {
    await expect(result.current.update({ autoRecognize: false })).resolves.toBeUndefined();
  });
  expect(result.current.settings).toEqual({ autoRecognize: false });
});
