import type { FontKey, FontWeight } from '../typesetting/fonts';

export type Size = 'xs' | 's' | 'm' | 'l' | 'xl';
export type Entrance = 'cut' | 'drop' | 'rise' | 'scatter' | 'trace' | 'fade';
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
}

export interface Palette {
  background: string;
  ink: string;
  accent: string;
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
};

export const DEFAULT_IDLE_GLYPHS = '0123456789○△□＝ー';
