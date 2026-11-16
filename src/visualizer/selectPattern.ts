import { fnv1a } from '../direction/hash';
import { DEFAULT_PATTERN } from './patterns';
import type { VisualizerKey } from './patterns';

// Choosing a song's pattern (design spec §9.1 "選択規則"). Once a song is
// confirmed, the stage watches it until it has heard OBSERVE_AUDIBLE_MS of
// sound (at most OBSERVE_LIMIT_MS from the confirmation; failing that the
// song keeps `bars`). What it heard is reduced to four coarse classes (tempo,
// energy, low / mid / high balance, how steady the beat is), the classes are
// looked up in PATTERN_TABLE (first matching row), and when the row has more
// than one candidate the song's seed (`artist/title`, fnv1a) picks one. The
// material is the beat engine and the ear's features only, and the choice is
// a pure function of them and the seed: the same summary and seed always give
// the same pattern. Nothing here keeps the feature values once the choice is
// made; only the chosen key is remembered (patternStore.ts).
//
// All thresholds are first guesses, to be tuned on the device.

/** Sound the stage hears before it chooses, ms. */
export const OBSERVE_AUDIBLE_MS = 8000;
/** The longest it waits from the confirmation, ms; after that the song keeps `bars`. */
export const OBSERVE_LIMIT_MS = 20_000;
/** A gap between ear frames counts at most this long (a hitch is not sound heard). */
export const OBSERVE_FRAME_MAX_MS = 100;

/** BPM at or above which the tempo is fast. */
export const TEMPO_FAST_BPM = 130;
/** BPM below which the tempo is slow. */
export const TEMPO_SLOW_BPM = 90;
/** Mean energy (the beat engine's rms follower) below which the song is quiet. */
export const ENERGY_LOW = 0.05;
/** Mean energy at or above which the song is loud. */
export const ENERGY_HIGH = 0.12;
/** The low band's share of low + mid + high at or above which the low end leads. */
export const LOW_LEADS_SHARE = 0.45;
/** The high band's share at or above which the top leads. */
export const HIGH_LEADS_SHARE = 0.38;
/** Mean beat confidence at or above which (with a tight tempo) the beat is steady. */
export const STEADY_CONFIDENCE = 0.55;
/** Mean beat confidence below which the beat is loose. */
export const LOOSE_CONFIDENCE = 0.3;
/** Tempo spread (median absolute deviation / median) at or below which the beat is steady. */
export const STEADY_SPREAD = 0.03;
/** Tempo spread above which the beat is loose. */
export const LOOSE_SPREAD = 0.08;
/** The share of the heard time with a tempo below which the beat counts as loose. */
export const TEMPO_COVERAGE_MIN = 0.5;

/** One ear frame and the beat it produced, as the observer reads it. */
export interface PatternSample {
  timestampMs: number;
  bpm: number | null;
  confidence: number;
  energy: number;
  low: number;
  mid: number;
  high: number;
  silence: boolean;
}

/** What was heard, as time-weighted means over the audible frames. */
export interface AcousticSummary {
  /** Median tempo over the frames that had one; null if none did. */
  bpm: number | null;
  /** Median absolute deviation of the tempo over its median; null without a tempo. */
  bpmSpread: number | null;
  /** Share of the heard time that had a tempo. */
  tempoCoverage: number;
  confidence: number;
  energy: number;
  low: number;
  mid: number;
  high: number;
}

export interface AcousticClass {
  tempo: 'slow' | 'mid' | 'fast' | 'unknown';
  energy: 'low' | 'mid' | 'high';
  balance: 'low' | 'even' | 'high';
  stability: 'steady' | 'fair' | 'loose';
}

const finite = (v: number) => (Number.isFinite(v) ? v : 0);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The coarse classes of a summary. */
export function quantize(summary: AcousticSummary): AcousticClass {
  const bpm = summary.bpm;
  const tempo: AcousticClass['tempo'] =
    bpm === null || !Number.isFinite(bpm)
      ? 'unknown'
      : bpm >= TEMPO_FAST_BPM
        ? 'fast'
        : bpm < TEMPO_SLOW_BPM
          ? 'slow'
          : 'mid';

  const e = finite(summary.energy);
  const energy: AcousticClass['energy'] = e < ENERGY_LOW ? 'low' : e >= ENERGY_HIGH ? 'high' : 'mid';

  const low = Math.max(0, finite(summary.low));
  const mid = Math.max(0, finite(summary.mid));
  const high = Math.max(0, finite(summary.high));
  const total = low + mid + high;
  const balance: AcousticClass['balance'] =
    total <= 0
      ? 'even'
      : low / total >= LOW_LEADS_SHARE
        ? 'low'
        : high / total >= HIGH_LEADS_SHARE
          ? 'high'
          : 'even';

  const confidence = finite(summary.confidence);
  const spread = summary.bpmSpread;
  const noTempo = tempo === 'unknown' || spread === null || summary.tempoCoverage < TEMPO_COVERAGE_MIN;
  const stability: AcousticClass['stability'] =
    noTempo || confidence < LOOSE_CONFIDENCE || spread > LOOSE_SPREAD
      ? 'loose'
      : confidence >= STEADY_CONFIDENCE && spread <= STEADY_SPREAD
        ? 'steady'
        : 'fair';

  return { tempo, energy, balance, stability };
}

/**
 * The first table (§9.1), top to bottom; the first row that matches gives the
 * candidates.
 */
export const PATTERN_TABLE: readonly {
  when: (c: AcousticClass) => boolean;
  candidates: readonly VisualizerKey[];
}[] = [
  {
    when: (c) => c.tempo === 'fast' && c.energy === 'high' && c.stability === 'steady',
    candidates: ['landscape'],
  },
  { when: (c) => c.balance === 'low' && c.stability === 'steady', candidates: ['ripple', 'bars-bold'] },
  { when: (c) => c.balance === 'high', candidates: ['stipple', 'ring'] },
  { when: (c) => c.stability === 'loose', candidates: ['wave', 'curtain'] },
  { when: (c) => c.tempo === 'slow' && c.energy === 'low', candidates: ['curtain', 'wave'] },
  { when: () => true, candidates: ['ring', 'bars-bold', 'bars'] },
];

export function patternCandidates(c: AcousticClass): readonly VisualizerKey[] {
  return PATTERN_TABLE.find((row) => row.when(c))!.candidates;
}

/** The song's pattern: its row's candidate picked by the seed (`artist/title`). */
export function choosePattern(summary: AcousticSummary, seed: string): VisualizerKey {
  const candidates = patternCandidates(quantize(summary));
  return candidates[fnv1a(seed) % candidates.length] ?? DEFAULT_PATTERN;
}

export type PatternVerdict =
  | { status: 'observing' }
  | { status: 'chosen'; key: VisualizerKey }
  /** OBSERVE_LIMIT_MS passed without enough sound: the song keeps `bars`, nothing is remembered. */
  | { status: 'gave-up' };

export interface PatternObserver {
  /** One ear frame; the verdict once the window is full (or given up), and the same verdict after. */
  push(sample: PatternSample): PatternVerdict;
}

/**
 * The observation window of one confirmed song. Frame time is measured from
 * the timestamps (each step capped at OBSERVE_FRAME_MAX_MS); only frames the
 * beat does not call silent count as heard, and only they feed the summary.
 */
export function createPatternObserver(seed: string): PatternObserver {
  let previousMs: number | null = null;
  let elapsedMs = 0;
  let heardMs = 0;
  let tempoMs = 0;
  const sums = { confidence: 0, energy: 0, low: 0, mid: 0, high: 0 };
  const tempos: number[] = [];
  let verdict: PatternVerdict = { status: 'observing' };

  const summary = (): AcousticSummary => {
    const w = heardMs > 0 ? heardMs : 1;
    const bpm = tempos.length > 0 ? median(tempos) : null;
    const bpmSpread =
      bpm === null || bpm <= 0 ? null : median(tempos.map((t) => Math.abs(t - bpm))) / bpm;
    return {
      bpm,
      bpmSpread,
      tempoCoverage: heardMs > 0 ? tempoMs / heardMs : 0,
      confidence: sums.confidence / w,
      energy: sums.energy / w,
      low: sums.low / w,
      mid: sums.mid / w,
      high: sums.high / w,
    };
  };

  return {
    push(sample) {
      if (verdict.status !== 'observing') return verdict;
      const t = sample.timestampMs;
      const raw = previousMs === null || !Number.isFinite(t) ? 0 : t - previousMs;
      const dt = raw > OBSERVE_FRAME_MAX_MS ? OBSERVE_FRAME_MAX_MS : raw > 0 ? raw : 0;
      if (Number.isFinite(t)) previousMs = t;
      elapsedMs += dt;
      if (!sample.silence && dt > 0) {
        heardMs += dt;
        sums.confidence += finite(sample.confidence) * dt;
        sums.energy += finite(sample.energy) * dt;
        sums.low += finite(sample.low) * dt;
        sums.mid += finite(sample.mid) * dt;
        sums.high += finite(sample.high) * dt;
        if (sample.bpm !== null && Number.isFinite(sample.bpm) && sample.bpm > 0) {
          tempoMs += dt;
          tempos.push(sample.bpm);
        }
      }
      if (heardMs >= OBSERVE_AUDIBLE_MS) {
        verdict = { status: 'chosen', key: choosePattern(summary(), seed) };
      } else if (elapsedMs >= OBSERVE_LIMIT_MS) {
        verdict = { status: 'gave-up' };
      }
      return verdict;
    },
  };
}
