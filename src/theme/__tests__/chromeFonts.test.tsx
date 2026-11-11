import { renderHook } from '@testing-library/react-native';
import { useFonts } from 'expo-font';

import { CHROME_FONT_BOLD, CHROME_FONT_REGULAR, useChromeFonts } from '../chromeFonts';

jest.mock('expo-font', () => ({ useFonts: jest.fn() }));

describe('useChromeFonts', () => {
  test('loads the bundled gothic regular and bold', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, null]);
    await renderHook(() => useChromeFonts());
    const map = (useFonts as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(map).sort()).toEqual([CHROME_FONT_BOLD, CHROME_FONT_REGULAR].sort());
  });

  test('is empty (system font) until loaded, then names both faces', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, null]);
    const hook = await renderHook(() => useChromeFonts());
    expect(hook.result.current).toEqual({});

    (useFonts as jest.Mock).mockReturnValue([true, null]);
    await hook.rerender(undefined);
    expect(hook.result.current).toEqual({ regular: CHROME_FONT_REGULAR, bold: CHROME_FONT_BOLD });
  });

  test('a failed load stays on the system font', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, new Error('no font')]);
    const hook = await renderHook(() => useChromeFonts());
    expect(hook.result.current).toEqual({});
  });

  test('the result is stable across renders while the state holds', async () => {
    (useFonts as jest.Mock).mockReturnValue([true, null]);
    const hook = await renderHook(() => useChromeFonts());
    const first = hook.result.current;
    await hook.rerender(undefined);
    expect(hook.result.current).toBe(first);
  });
});
