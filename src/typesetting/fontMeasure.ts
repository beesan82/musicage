import type { GlyphMeasure } from './layout';

/** The parts of an SkFont the stage measures with. */
export interface MeasuredFont {
  getGlyphIDs(text: string): number[];
  getGlyphWidths(glyphs: number[]): number[];
  getMetrics(): { ascent: number; descent: number };
}

/**
 * A GlyphMeasure over `fontFor`: a character's advance is its glyphs' advance
 * widths (where the next character starts), not the width of its ink.
 *
 * SkFont.measureText returns the bounding box of the ink. For a full-width
 * bracket that is a narrow stroke at one side of its em box, so laying out
 * with it as the advance packed the clock's date row: the weekday kanji was
 * placed over the stroke of （ and ） over the weekday (2026-11-11, seen on the
 * device as 「11月11日（水）」 with the accent 水 running into its brackets).
 */
export function advanceMeasure(fontFor: (sizePx: number) => MeasuredFont): GlyphMeasure {
  return (char, sizePx) => {
    const font = fontFor(sizePx);
    const { ascent, descent } = font.getMetrics();
    const advance = font.getGlyphWidths(font.getGlyphIDs(char)).reduce((sum, width) => sum + width, 0);
    return { advance, ascent, descent };
  };
}
