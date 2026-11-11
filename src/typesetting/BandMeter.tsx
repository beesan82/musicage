import { Rect } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect } from 'react';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import type { FrameInfo, SharedValue } from 'react-native-reanimated';

import {
  METER_OPACITY,
  METER_RULE_COUNT,
  METER_RULE_WIDTH,
  meterBandAt,
  meterFollow,
  meterRuleHeight,
  meterRuleX,
  meterShape,
  meterTarget,
} from './bandMeter';
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
  count?: number;
  /** testID of each rule is `${testIDPrefix}-${index}`. */
  testIDPrefix?: string;
}

/**
 * The band meter (see bandMeter.ts): METER_RULE_COUNT thin rules whose heights
 * follow the low / mid / high envelopes across the row. One frame callback
 * runs the three followers on the UI thread (meterFollow, heading for
 * meterTarget: 0 while the room is silent); each rule derives its rectangle
 * from them. Nothing here re-renders per frame. Under reduced motion the
 * followers stand still at 0 and the row is the printed base scale.
 */
export const BandMeter = memo(function BandMeter({
  x,
  width,
  baseline,
  beat,
  ink,
  reducedMotion,
  count = METER_RULE_COUNT,
  testIDPrefix = 'band-rule',
}: BandMeterProps) {
  const lowNow = useSharedValue(0);
  const midNow = useSharedValue(0);
  const highNow = useSharedValue(0);
  const { low, mid, high, silence } = beat;

  const onFrame = useCallback(
    (info: FrameInfo) => {
      'worklet';
      const dt = info.timeSincePreviousFrame ?? 0;
      const quiet = silence.value;
      lowNow.value = meterFollow(lowNow.value, meterTarget(low.value, quiet), dt);
      midNow.value = meterFollow(midNow.value, meterTarget(mid.value, quiet), dt);
      highNow.value = meterFollow(highNow.value, meterTarget(high.value, quiet), dt);
    },
    [high, highNow, low, lowNow, mid, midNow, silence],
  );
  const frame = useFrameCallback(onFrame, !reducedMotion);
  useEffect(() => {
    frame.setActive(!reducedMotion);
    if (reducedMotion) {
      lowNow.value = 0;
      midNow.value = 0;
      highNow.value = 0;
    }
  }, [frame, highNow, lowNow, midNow, reducedMotion]);

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <MeterRule
          key={index}
          index={index}
          count={count}
          x={meterRuleX(index, count, x, width)}
          baseline={baseline}
          low={lowNow}
          mid={midNow}
          high={highNow}
          ink={ink}
          testID={`${testIDPrefix}-${index}`}
        />
      ))}
    </>
  );
});

interface MeterRuleProps {
  index: number;
  count: number;
  x: number;
  baseline: number;
  low: SharedValue<number>;
  mid: SharedValue<number>;
  high: SharedValue<number>;
  ink: SharedValue<string>;
  testID: string;
}

function MeterRule({ index, count, x, baseline, low, mid, high, ink, testID }: MeterRuleProps) {
  const p = count <= 1 ? 0 : index / (count - 1);
  const shape = meterShape(index, count);
  const rect = useDerivedValue(() => {
    const height = meterRuleHeight(meterBandAt(p, low.value, mid.value, high.value), shape);
    return { x, y: baseline - height, width: METER_RULE_WIDTH, height };
  }, [p, shape, x, baseline]);
  // Skia's Rect types omit testID; it is only read by tests under the Skia mock.
  const testProps = { testID } as object;
  return <Rect rect={rect} color={ink} opacity={METER_OPACITY} {...testProps} />;
}
