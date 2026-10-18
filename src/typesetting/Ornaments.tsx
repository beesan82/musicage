import { Circle, Group, Line, Rect, Text } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';

import type { LineDirection, Ornament as OrnamentKind } from '../direction/types';
import type { LineLayout, Viewport } from './layout';

const MARGIN = 24;
const RULE_GAP = 8;
const GRID_COLUMNS = 3;
const GRID_ROWS = 5;
const GRID_OPACITY = 0.18;

export interface OrnamentProps {
  ornament: OrnamentKind;
  orientation: LineDirection['orientation'];
  bounds: LineLayout['bounds'];
  viewport: Viewport;
  ink: string;
  bar: number;
  /** gothic xs, used by `numeral`. */
  numeralFont: SkFont;
}

// Skia's component types omit testID; it is only read by tests under the Skia mock.
const tid = (id: string) => ({ testID: id }) as object;

/** Static decoration drawn behind a lyric line, in `ink`. `none` draws nothing. */
export function Ornament({ ornament, orientation, bounds, viewport, ink, bar, numeralFont }: OrnamentProps) {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  if (ornament === 'rule') {
    // Under a horizontal line, to the right of a vertical one.
    const [p1, p2] =
      orientation === 'vertical'
        ? [
            { x: right + RULE_GAP, y: bounds.y },
            { x: right + RULE_GAP, y: bottom },
          ]
        : [
            { x: bounds.x, y: bottom + RULE_GAP },
            { x: right, y: bottom + RULE_GAP },
          ];
    return <Line p1={p1} p2={p2} color={ink} style="stroke" strokeWidth={2} {...tid('ornament-rule')} />;
  }
  if (ornament === 'frame') {
    return <Rect {...bounds} color={ink} style="stroke" strokeWidth={1} {...tid('ornament-frame')} />;
  }
  if (ornament === 'circle') {
    return (
      <Circle
        cx={bounds.x + bounds.width / 2}
        cy={bounds.y + bounds.height / 2}
        r={bounds.height * 0.6}
        color={ink}
        style="stroke"
        strokeWidth={1}
        {...tid('ornament-circle')}
      />
    );
  }
  if (ornament === 'grid') {
    const left = MARGIN;
    const top = viewport.insetTop + MARGIN;
    const width = viewport.width - 2 * MARGIN;
    const height = viewport.height - viewport.insetTop - viewport.insetBottom - 2 * MARGIN;
    const verticals = Array.from({ length: GRID_COLUMNS + 1 }, (_, i) => left + (i * width) / GRID_COLUMNS);
    const horizontals = Array.from({ length: GRID_ROWS + 1 }, (_, i) => top + (i * height) / GRID_ROWS);
    return (
      <Group opacity={GRID_OPACITY} {...tid('ornament-grid')}>
        {verticals.map((x) => (
          <Line
            key={`v${x}`}
            p1={{ x, y: top }}
            p2={{ x, y: top + height }}
            color={ink}
            style="stroke"
            strokeWidth={0.5}
          />
        ))}
        {horizontals.map((y) => (
          <Line
            key={`h${y}`}
            p1={{ x: left, y }}
            p2={{ x: left + width, y }}
            color={ink}
            style="stroke"
            strokeWidth={0.5}
          />
        ))}
      </Group>
    );
  }
  if (ornament === 'numeral') {
    const text = String(bar % 100);
    const x = viewport.width - MARGIN - numeralFont.measureText(text).width;
    const y = viewport.insetTop + MARGIN - numeralFont.getMetrics().ascent;
    return <Text x={x} y={y} text={text} font={numeralFont} color={ink} {...tid('ornament-numeral')} />;
  }
  return null;
}
