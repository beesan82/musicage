export type VisualStyle = 'ambient' | 'jazz' | 'pop' | 'dance' | 'rock';

export interface VisualState {
  style: VisualStyle;
  intensity: number;
  motion: number;
  textScale: number;
  accent: number;
  changedAtMs: number;
}
