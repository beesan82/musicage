import { useFonts } from 'expo-font';
import { useMemo } from 'react';

import type { ChromeFonts } from './chrome';

export const CHROME_FONT_REGULAR = 'ZenKakuGothicNew-Regular';
export const CHROME_FONT_BOLD = 'ZenKakuGothicNew-Bold';

const CHROME_FONT_SOURCES = {
  [CHROME_FONT_REGULAR]: require('../../assets/fonts/ZenKakuGothicNew-Regular.ttf'),
  [CHROME_FONT_BOLD]: require('../../assets/fonts/ZenKakuGothicNew-Bold.ttf'),
};

/**
 * Loads the bundled gothic for React Native `<Text>` (the stage reads the same
 * files through Skia on its own). Nothing waits for it: until it loads, or if
 * it fails, both names are undefined and the chrome uses the system font.
 * The returned object only changes when loading finishes.
 */
export function useChromeFonts(): ChromeFonts {
  const [loaded] = useFonts(CHROME_FONT_SOURCES);
  return useMemo(
    () => (loaded ? { regular: CHROME_FONT_REGULAR, bold: CHROME_FONT_BOLD } : {}),
    [loaded],
  );
}
