import FFT from 'fft.js';

import { clamp01 } from '../utils/clamp';
import type { AudioFeatures, FeatureProcessor } from './types';

const FFT_SIZE = 2_048;
const SMOOTHING = 0.18;
const SILENCE_THRESHOLD = 0.018;

const silentFeatures = (timestampMs: number): AudioFeatures => ({
  timestampMs,
  energy: 0,
  low: 0,
  mid: 0,
  high: 0,
  transient: 0,
  silence: true,
});

function exponentialMovingAverage(previous: number, value: number): number {
  return previous + (value - previous) * SMOOTHING;
}

function rootMeanSquare(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    sum += sample * sample;
  }

  return Math.sqrt(sum / samples.length);
}

function hannWindow(samples: Float32Array): Float32Array {
  const windowed = new Float32Array(FFT_SIZE);

  for (let index = 0; index < FFT_SIZE; index += 1) {
    const sample = samples[index] ?? 0;
    const coefficient = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1)));
    windowed[index] = sample * coefficient;
  }

  return windowed;
}

function averageMagnitudeInRange(
  spectrum: number[],
  sampleRate: number,
  minimumHz: number,
  maximumHz: number,
): number {
  const firstBin = Math.max(1, Math.ceil((minimumHz * FFT_SIZE) / sampleRate));
  const lastBin = Math.min(
    FFT_SIZE / 2,
    Math.floor((maximumHz * FFT_SIZE) / sampleRate),
  );

  let sum = 0;
  let bins = 0;

  for (let bin = firstBin; bin <= lastBin; bin += 1) {
    const real = spectrum[bin * 2] ?? 0;
    const imaginary = spectrum[bin * 2 + 1] ?? 0;
    sum += real * real + imaginary * imaginary;
    bins += 1;
  }

  return bins === 0 ? 0 : sum / bins;
}

export function createFeatureProcessor(): FeatureProcessor {
  const fft = new FFT(FFT_SIZE);
  let previousFeatures = silentFeatures(0);
  let previousRawEnergy = 0;

  return {
    process(samples, sampleRate, timestampMs) {
      const rawEnergy = clamp01(rootMeanSquare(samples));
      const windowed = hannWindow(samples);
      const spectrum = fft.createComplexArray();
      fft.realTransform(spectrum, windowed);

      const rawLow = averageMagnitudeInRange(spectrum, sampleRate, 20, 250);
      const rawMid = averageMagnitudeInRange(spectrum, sampleRate, 250, 2_000);
      const rawHigh = averageMagnitudeInRange(spectrum, sampleRate, 2_000, 8_000);
      const totalMagnitude = rawLow + rawMid + rawHigh;

      const normalizedLow = totalMagnitude === 0 ? 0 : clamp01(rawLow / totalMagnitude);
      const normalizedMid = totalMagnitude === 0 ? 0 : clamp01(rawMid / totalMagnitude);
      const normalizedHigh = totalMagnitude === 0 ? 0 : clamp01(rawHigh / totalMagnitude);

      const energy = exponentialMovingAverage(previousFeatures.energy, rawEnergy);
      const low = exponentialMovingAverage(previousFeatures.low, normalizedLow);
      const mid = exponentialMovingAverage(previousFeatures.mid, normalizedMid);
      const high = exponentialMovingAverage(previousFeatures.high, normalizedHigh);
      const transient = clamp01((rawEnergy - previousRawEnergy) / 0.35);

      previousRawEnergy = rawEnergy;
      previousFeatures = {
        timestampMs,
        energy,
        low,
        mid,
        high,
        transient,
        silence: energy < SILENCE_THRESHOLD,
      };

      return previousFeatures;
    },
    reset() {
      previousFeatures = silentFeatures(0);
      previousRawEnergy = 0;
    },
  };
}
