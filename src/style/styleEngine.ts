import { clamp01 } from '../utils/clamp';
import type { AudioFeatures } from '../audio/types';
import type { VisualState, VisualStyle } from './types';

const MINIMUM_DWELL_MS = 6_000;
const SCORE_MARGIN = 0.12;

type StyleScores = Record<VisualStyle, number>;

function calculateScores(features: AudioFeatures): StyleScores {
  const { energy, low, mid, high, transient } = features;

  return {
    ambient: (1 - energy) * 0.6 + low * 0.2 + (1 - transient) * 0.2,
    jazz:
      mid * 0.45 +
      low * 0.25 +
      (1 - transient) * 0.2 +
      (1 - Math.abs(low - mid)) * 0.1,
    pop: mid * 0.4 + high * 0.25 + energy * 0.2 + (1 - transient) * 0.15,
    dance: low * 0.35 + energy * 0.35 + transient * 0.3,
    rock: high * 0.35 + energy * 0.35 + transient * 0.3,
  };
}

function highestScoringStyle(scores: StyleScores): VisualStyle {
  const styles: VisualStyle[] = ['ambient', 'jazz', 'pop', 'dance', 'rock'];

  return styles.reduce((best, style) =>
    scores[style] > scores[best] ? style : best,
  );
}

export function createInitialVisualState(nowMs = Date.now()): VisualState {
  return {
    style: 'ambient',
    intensity: 0.08,
    motion: 0.04,
    textScale: 0.92,
    accent: 0.06,
    changedAtMs: nowMs,
  };
}

export function selectVisualState(
  features: AudioFeatures,
  previous: VisualState,
  nowMs: number,
): VisualState {
  if (features.silence) {
    return {
      style: 'ambient',
      intensity: Math.min(0.12, clamp01(features.energy * 0.7)),
      motion: Math.min(0.08, clamp01(features.energy * 0.45)),
      textScale: 0.92,
      accent: clamp01(features.high * 0.2),
      changedAtMs:
        previous.style === 'ambient' ? previous.changedAtMs : nowMs,
    };
  }

  const scores = calculateScores(features);
  const candidate = highestScoringStyle(scores);
  const canSwitch = nowMs - previous.changedAtMs >= MINIMUM_DWELL_MS;
  const candidateWinsClearly =
    scores[candidate] >= scores[previous.style] + SCORE_MARGIN;
  const style =
    candidate === previous.style || (canSwitch && candidateWinsClearly)
      ? candidate
      : previous.style;

  const intensity = clamp01(features.energy * 0.7 + features.transient * 0.3);
  const motion = clamp01(
    features.energy * 0.45 + features.transient * 0.4 + features.high * 0.15,
  );

  return {
    style,
    intensity,
    motion,
    textScale: 0.92 + intensity * 0.18,
    accent: clamp01(features.high * 0.55 + features.transient * 0.45),
    changedAtMs: style === previous.style ? previous.changedAtMs : nowMs,
  };
}
