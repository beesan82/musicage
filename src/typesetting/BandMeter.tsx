import { Rect } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import type { FrameInfo, SharedValue } from 'react-native-reanimated';

import { VIZ_GAIN } from '../visualizer/discipline';
import {
  METER_OPACITY,
  METER_PEAK_HEIGHT,
  METER_RULE_WIDTH,
  meterBandAt,
  meterFollow,
  meterKickFlash,
  meterKickSide,
  meterPeakFollow,
  meterPeakTop,
  meterRuleCount,
  meterRuleHeight,
  meterRuleX,
  meterShape,
  meterTarget,
} from './bandMeter';
import type { MeterVariant } from './bandMeter';
import type { BeatSharedValues } from './useBeatSharedValues';

export interface BandMeterProps {
  /** Left edge of the row. */
  x: number;
  /** Width of the row; the rules are spread over it edge to edge. */
  width: number;
  /** The rules stand on this y and grow upward. */
  baseline: number;
  /** The stage's shared values; the meter reads the band envelopes. */
  beat: BeatSharedValues;
  /** The rules' colour: the stage's surge-interpolated ink. */
  ink: SharedValue<string>;
  reducedMotion: boolean;
  /** `bars` (the default) or `bars-bold` (more rules, peak ticks, the kick's accent on the low side). */
  variant?: MeterVariant;
  /** The accent a kick lights the low side's ticks in (`bars-bold` only; without it they never light). */
  accent?: SharedValue<string>;
  /** The visualizer gain on the band readings (design spec §9.1). */
  gain?: number;
  count?: number;
  /**
   * testID of each rule is `${testIDPrefix}-${index}`; of a `bars-bold`
   * peak tick `peak-${testIDPrefix}-${index}` and of a lit tick
   * `kick-${testIDPrefix}-${index}`.
   */
  testIDPrefix?: string;
}

/**
 * The band meter (see bandMeter.ts): thin rules whose heights follow the
 * low / mid / high envelopes across the row. One frame callback runs the three
 * followers on the UI thread (meterFollow, heading for meterTarget at the
 * visualizer gain: 0 while the room is silent); each rule derives its
 * rectangle from them. As `bars-bold` the same callback also carries a peak
 * per rule and the kick's flash. Nothing here re-renders per frame. Under
 * reduced motion the followers stand still at 0 and the row is the printed
 * base scale (no peaks, no flash).
 */
export const BandMeter = memo(function BandMeter({
  x,
  width,
  baseline,
  beat,
  ink,
  reducedMotion,
  variant = 'bars',
  accent,
  gain = VIZ_GAIN,
  count: countProp,
  testIDPrefix = 'band-rule',
}: BandMeterProps) {
  const count = countProp ?? meterRuleCount(variant);
  const bold = variant === 'bars-bold';
  const lowNow = useSharedValue(0);
  const midNow = useSharedValue(0);
  const highNow = useSharedValue(0);
  const zeros = useMemo(() => Array.from({ length: count }, () => 0), [count]);
  const shapes = useMemo(() => Array.from({ length: count }, (_, i) => meterShape(i, count)), [count]);
  const peaks = useSharedValue<number[]>(zeros);
  // Every peak sits on its rule's reach and the followers have not moved
  // since: the next frame would compute the same peaks, so it skips them.
  const peaksSettled = useSharedValue(false);
  const flash = useSharedValue(0);
  // The lit ticks' opacity, one for the whole low side (every lit tick shows the same flash).
  const kickOpacity = useDerivedValue(() => METER_OPACITY * flash.value);
  const { low, mid, high, silence, pulse } = beat;

  const onFrame = useCallback(
    (info: FrameInfo) => {
      'worklet';
      const dt = info.timeSincePreviousFrame ?? 0;
      const quiet = silence.value;
      const lowNext = meterFollow(lowNow.value, meterTarget(low.value, quiet, gain), dt);
      const midNext = meterFollow(midNow.value, meterTarget(mid.value, quiet, gain), dt);
      const highNext = meterFollow(highNow.value, meterTarget(high.value, quiet, gain), dt);
      const moved = lowNext !== lowNow.value || midNext !== midNow.value || highNext !== highNow.value;
      lowNow.value = lowNext;
      midNow.value = midNext;
      highNow.value = highNext;
      if (!bold) return;
      flash.value = meterKickFlash(pulse.value, lowNext, quiet);
      if (!moved && peaksSettled.value) return;
      // A new array is a new value to Reanimated (every tick's mapper re-runs),
      // so the peaks are written only on a frame that moves one of them: a
      // settled row (a silent room) costs the ticks nothing per frame.
      const previous = peaks.value;
      let next: number[] | null = null;
      for (let i = 0; i < count; i += 1) {
        const p = count <= 1 ? 0 : i / (count - 1);
        const reach = meterBandAt(p, lowNext, midNext, highNext) * shapes[i]!;
        const peak = meterPeakFollow(previous[i] ?? 0, reach, dt);
        if (next === null && peak !== previous[i]) next = previous.slice(0, i);
        if (next !== null) next.push(peak);
      }
      if (next !== null) peaks.value = next;
      // Settled only on a frame that took time (dt > 0): with no time a peak
      // over its reach does not fall either, and would look settled. With
      // time, a peak that did not move is exactly on its reach, and stays
      // there for as long as the followers stand still.
      peaksSettled.value = !moved && next === null && dt > 0;
    },
    [
      bold,
      count,
      flash,
      gain,
      high,
      highNow,
      low,
      lowNow,
      mid,
      midNow,
      peaks,
      peaksSettled,
      pulse,
      shapes,
      silence,
    ],
  );
  const frame = useFrameCallback(onFrame, !reducedMotion);
  useEffect(() => {
    frame.setActive(!reducedMotion);
    if (reducedMotion) {
      lowNow.value = 0;
      midNow.value = 0;
      highNow.value = 0;
      peaks.value = zeros;
      peaksSettled.value = false;
      flash.value = 0;
    }
  }, [flash, frame, highNow, lowNow, midNow, peaks, peaksSettled, reducedMotion, zeros]);

  return (
    <>
      {Array.from({ length: count }, (_, index) => {
        const ruleX = meterRuleX(index, count, x, width);
        return (
          <MeterRule
            key={index}
            index={index}
            count={count}
            shape={shapes[index]!}
            x={ruleX}
            baseline={baseline}
            low={lowNow}
            mid={midNow}
            high={highNow}
            ink={ink}
            testID={`${testIDPrefix}-${index}`}
          />
        );
      })}
      {bold
        ? Array.from({ length: count }, (_, index) => (
            <PeakTick
              key={`peak-${index}`}
              index={index}
              x={meterRuleX(index, count, x, width)}
              baseline={baseline}
              peaks={peaks}
              ink={ink}
              lit={accent !== undefined && meterKickSide(index, count) ? { accent, opacity: kickOpacity } : null}
              testIDPrefix={testIDPrefix}
            />
          ))
        : null}
    </>
  );
});

interface MeterRuleProps {
  index: number;
  count: number;
  shape: number;
  x: number;
  baseline: number;
  low: SharedValue<number>;
  mid: SharedValue<number>;
  high: SharedValue<number>;
  ink: SharedValue<string>;
  testID: string;
}

function MeterRule({ index, count, shape, x, baseline, low, mid, high, ink, testID }: MeterRuleProps) {
  const p = count <= 1 ? 0 : index / (count - 1);
  const rect = useDerivedValue(() => {
    const height = meterRuleHeight(meterBandAt(p, low.value, mid.value, high.value), shape);
    return { x, y: baseline - height, width: METER_RULE_WIDTH, height };
  }, [p, shape, x, baseline]);
  // Skia's Rect types omit testID; it is only read by tests under the Skia mock.
  const testProps = { testID } as object;
  return <Rect rect={rect} color={ink} opacity={METER_OPACITY} {...testProps} />;
}

interface PeakTickProps {
  index: number;
  x: number;
  baseline: number;
  peaks: SharedValue<number[]>;
  ink: SharedValue<string>;
  /** On the low side: the accent twin the kick lights, at the flash's share of the rules' opacity. */
  lit: { accent: SharedValue<string>; opacity: SharedValue<number> } | null;
  testIDPrefix: string;
}

function PeakTick({ index, x, baseline, peaks, ink, lit, testIDPrefix }: PeakTickProps) {
  const rect = useDerivedValue(
    () => ({
      x,
      y: meterPeakTop(peaks.value[index] ?? 0, baseline),
      width: METER_RULE_WIDTH,
      height: METER_PEAK_HEIGHT,
    }),
    [index, x, baseline],
  );
  return (
    <>
      <Rect
        rect={rect}
        color={ink}
        opacity={METER_OPACITY}
        {...({ testID: `peak-${testIDPrefix}-${index}` } as object)}
      />
      {lit !== null ? (
        <Rect
          rect={rect}
          color={lit.accent}
          opacity={lit.opacity}
          {...({ testID: `kick-${testIDPrefix}-${index}` } as object)}
        />
      ) : null}
    </>
  );
}
