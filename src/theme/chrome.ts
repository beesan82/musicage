import type { TextStyle } from 'react-native';

import { mixHex, rgbaOf } from '../direction/palettes';
import { DEFAULT_PALETTE } from '../direction/types';
import type { Palette } from '../direction/types';

/** The bundled gothic as React Native font family names; undefined until loaded. */
export interface ChromeFonts {
  regular?: string;
  bold?: string;
}

/**
 * Colours (and the loaded gothic) for the chrome: wordmark, status, buttons,
 * settings sheet. Every colour comes from the stage palette so the chrome is
 * printed with the same ink and spot colour as the stage.
 */
export interface ChromeTheme {
  /** Wordmark, button text, sheet heading and labels. */
  ink: string;
  /** Status word, messages, descriptions. */
  inkMuted: string;
  /** Button and sheet rules. */
  border: string;
  /** Status dot, primary button rule, Switch. */
  accent: string;
  /** Settings sheet ground. */
  surface: string;
  /** Button ground and modal veil. */
  scrim: string;
  /** Pressed button ground. */
  pressed: string;
  fonts: ChromeFonts;
}

/** A #RRGGBB colour as `rgba(...)`; same as `rgbaOf`, named for the chrome. */
export const withAlpha = rgbaOf;

export function chromeTheme(palette: Palette, fonts: ChromeFonts = {}): ChromeTheme {
  return {
    ink: palette.ink,
    inkMuted: mixHex(palette.ink, palette.background, 0.45),
    border: mixHex(palette.ink, palette.background, 0.65),
    accent: palette.accent,
    surface: mixHex(palette.background, palette.ink, 0.06),
    scrim: withAlpha(palette.background, 0.6),
    pressed: withAlpha(palette.accent, 0.18),
    fonts,
  };
}

/** Used by chrome parts rendered without a theme (system font until loaded). */
export const DEFAULT_CHROME_THEME: ChromeTheme = chromeTheme(DEFAULT_PALETTE);

/**
 * The gothic face at a weight: the bundled family once loaded, otherwise the
 * system font at the matching weight. A bundled family carries its own weight,
 * so `fontWeight` is left off to keep iOS from looking for a synthetic variant.
 */
export function chromeFont(theme: ChromeTheme, weight: 'regular' | 'bold'): TextStyle {
  const family = theme.fonts[weight];
  if (family !== undefined) return { fontFamily: family };
  return { fontWeight: weight === 'bold' ? '700' : '400' };
}
