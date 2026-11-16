import type { ComponentType } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { BandMeter } from '../typesetting/BandMeter';
import { meterBudget } from '../typesetting/bandMeter';
import type { PrintArea } from '../typesetting/layout';
import type { BeatSharedValues } from '../typesetting/useBeatSharedValues';
import type { VisualizerBudget } from './discipline';
import { DEFAULT_PATTERN } from './patterns';
import type { Box, VisualizerKey } from './patterns';

// The renderers of the visualizer patterns (design spec §9.1). Build 15a
// draws `bars` (the band meter as it was) and `bars-bold`; build 15b adds the
// rest here, one entry per pattern, each with its worst-case light budget so
// the brightness caps stay checked (see the registry tests). A pattern
// without an entry is drawn as `bars` (planStageVisualizer).

export interface PatternRendererProps {
  /** The band at the foot of the print area, where a foot pattern draws. */
  row: { x: number; width: number; baseline: number };
  /** The print area, where a back pattern draws. */
  area: PrintArea | null;
  /** Where a back pattern on the synced stage must not draw (the line and its clearance). */
  clearance: Box | null;
  /** Multiplies the pattern's own opacity. */
  opacityScale: number;
  beat: BeatSharedValues;
  ink: SharedValue<string>;
  accent: SharedValue<string>;
  reducedMotion: boolean;
  gain: number;
  testIDPrefix: string;
}

export interface PatternRenderer {
  Component: ComponentType<PatternRendererProps>;
  /** Its worst case on any stage (discipline.ts lightBudgetOf checks it against the caps). */
  budget: VisualizerBudget;
}

function Bars({ row, beat, ink, reducedMotion, gain, testIDPrefix }: PatternRendererProps) {
  return (
    <BandMeter
      x={row.x}
      width={row.width}
      baseline={row.baseline}
      beat={beat}
      ink={ink}
      reducedMotion={reducedMotion}
      gain={gain}
      testIDPrefix={testIDPrefix}
    />
  );
}

function BarsBold({ row, beat, ink, accent, reducedMotion, gain, testIDPrefix }: PatternRendererProps) {
  return (
    <BandMeter
      x={row.x}
      width={row.width}
      baseline={row.baseline}
      beat={beat}
      ink={ink}
      accent={accent}
      reducedMotion={reducedMotion}
      variant="bars-bold"
      gain={gain}
      testIDPrefix={testIDPrefix}
    />
  );
}

export const PATTERN_RENDERERS: Readonly<Partial<Record<VisualizerKey, PatternRenderer>>> = {
  bars: { Component: Bars, budget: meterBudget('bars') },
  'bars-bold': { Component: BarsBold, budget: meterBudget('bars-bold') },
};

/** Whether the pattern has a renderer yet. */
export function isDrawable(key: VisualizerKey): boolean {
  return PATTERN_RENDERERS[key] !== undefined;
}

/** The pattern's renderer, or `bars`'s while it has none. */
export function rendererFor(key: VisualizerKey): PatternRenderer {
  return PATTERN_RENDERERS[key] ?? PATTERN_RENDERERS[DEFAULT_PATTERN]!;
}
