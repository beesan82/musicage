import { Skia, useTypeface } from '@shopify/react-native-skia';
import type { SkFont, SkTypeface } from '@shopify/react-native-skia';

export type FontKey = 'mincho' | 'mincho-old' | 'gothic' | 'gothic-heavy' | 'gothic-round' | 'brush';
export type FontWeight = 'light' | 'regular' | 'bold';

// Gothic is Zen Kaku Gothic New, bundled as two static files (Regular and Bold),
// because Skia renders a variable font at its default instance only.
export const FONT_SOURCES: Record<FontKey, { regular: number; bold?: number }> = {
  mincho: { regular: require('../../assets/fonts/ShipporiMincho-Regular.ttf') },
  'mincho-old': { regular: require('../../assets/fonts/ZenOldMincho-Regular.ttf') },
  gothic: {
    regular: require('../../assets/fonts/ZenKakuGothicNew-Regular.ttf'),
    bold: require('../../assets/fonts/ZenKakuGothicNew-Bold.ttf'),
  },
  'gothic-heavy': { regular: require('../../assets/fonts/DelaGothicOne-Regular.ttf') },
  'gothic-round': { regular: require('../../assets/fonts/ZenMaruGothic-Regular.ttf') },
  brush: { regular: require('../../assets/fonts/YujiSyuku-Regular.ttf') },
};

export function resolveFontSource(key: FontKey, weight: FontWeight): number {
  const source = FONT_SOURCES[key];
  return weight === 'bold' && source.bold !== undefined ? source.bold : source.regular;
}

export type StageTypefaces = Partial<Record<FontKey, { regular: SkTypeface; bold: SkTypeface }>>;

// Hooks must be called unconditionally, so every file is requested on each render:
// seven files, six regular plus the gothic bold.
export function useStageTypefaces(): StageTypefaces | null {
  const mincho = useTypeface(resolveFontSource('mincho', 'regular'));
  const minchoOld = useTypeface(resolveFontSource('mincho-old', 'regular'));
  const gothic = useTypeface(resolveFontSource('gothic', 'regular'));
  const gothicBold = useTypeface(resolveFontSource('gothic', 'bold'));
  const gothicHeavy = useTypeface(resolveFontSource('gothic-heavy', 'regular'));
  const gothicRound = useTypeface(resolveFontSource('gothic-round', 'regular'));
  const brush = useTypeface(resolveFontSource('brush', 'regular'));

  if (!mincho || !minchoOld || !gothic || !gothicBold || !gothicHeavy || !gothicRound || !brush) {
    return null;
  }
  return {
    mincho: { regular: mincho, bold: mincho },
    'mincho-old': { regular: minchoOld, bold: minchoOld },
    gothic: { regular: gothic, bold: gothicBold },
    'gothic-heavy': { regular: gothicHeavy, bold: gothicHeavy },
    'gothic-round': { regular: gothicRound, bold: gothicRound },
    brush: { regular: brush, bold: brush },
  };
}

export function createStageFont(typeface: SkTypeface, sizePx: number): SkFont {
  return Skia.Font(typeface, sizePx);
}
