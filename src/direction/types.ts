import type { FontKey, FontWeight } from '../typesetting/fonts';

export type Size = 'xs' | 's' | 'm' | 'l' | 'xl';
export type Entrance =
  | 'cut'
  | 'drop'
  | 'rise'
  | 'scatter'
  | 'trace'
  | 'fade'
  // Design spec §4, §5 (2026-11-11 evening): printed on glyph by glyph,
  // gathered in from afar, slid in from the side.
  | 'print'
  | 'gather'
  | 'slide';
/**
 * Where the line's block sits in its area (design spec §4, 2026-11-11
 * evening). Absent: the classic placement (vertical top-aligned in the centre
 * column, horizontal left-aligned and centred top to bottom).
 */
export type Placement = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type Hold = 'still' | 'pulse' | 'drift' | 'shake' | 'breathe';
export type Ornament = 'none' | 'rule' | 'frame' | 'grid' | 'circle' | 'numeral';
export type Texture = 'paper' | 'grain' | 'void' | 'scan';
export type TempoFeel = 'still' | 'sway' | 'march' | 'drive';

export interface LineDirection {
  font: FontKey;
  weight: FontWeight;
  size: Size;
  orientation: 'vertical' | 'horizontal';
  entrance: Entrance;
  hold: Hold;
  emphasis: number[];
  accent: boolean;
  ornament: Ornament;
  placement?: Placement;
}

export interface Palette {
  background: string;
  ink: string;
  accent: string;
  /**
   * Optional second accent for surge passages (design spec §4, 2026-11-07):
   * the accent moves towards it, and the ink takes a trace of it, as the
   * surge strength rises. Without it the accent itself is the high colour.
   */
  accentHigh?: string;
  /**
   * Optional lamp colour (visual overhaul spec §3a.1, 2026-11-09): the tint of
   * the one pool of light on the surface. Without it, `lightHexFor` derives
   * mix(ink, accent, 0.4).
   */
  light?: string;
}

export interface SongDirection {
  palette: Palette;
  texture: Texture;
  tempoFeel: TempoFeel;
  idleGlyphs: string;
  lines: LineDirection[];
}

export const DEFAULT_PALETTE: Palette = {
  background: '#0B0B0C',
  ink: '#F2EFE6',
  accent: '#D7263D',
  accentHigh: '#FF4D5E',
};

export const DEFAULT_IDLE_GLYPHS = '0123456789○△□＝ー';
