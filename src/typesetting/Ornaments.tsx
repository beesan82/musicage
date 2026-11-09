import { Circle, Group, Line, Rect, Text } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

import type { LineDirection, Ornament as OrnamentKind } from '../direction/types';
import type { LineLayout, PrintArea } from './layout';

// The ornaments are printed marks (visual overhaul spec §3d): spot colour and
// weight, the rule overhanging the line, the frame doubled. All of them stay
// inside the print area; `ornamentReach` tells the layout how much room the
// rule, the frame and the numeral need around the line.

const RULE_GAP = 8;
const RULE_WIDTH = 3;
/** How far the rule runs past each end of the line. */
const RULE_OVERHANG = 12;
const RULE_INK_OPACITY = 0.7;
const FRAME_OPACITY = 0.6;
const FRAME_GAP = 8;
const FRAME_WIDTH = 1.5;
/** The double rule: a hairline this far outside the frame. */
const FRAME_OUTER_GAP = 4;
const FRAME_OUTER_WIDTH = 0.5;
const CIRCLE_OPACITY = 0.7;
const CIRCLE_WIDTH = 1.5;
const CIRCLE_RADIUS = 0.6;
const GRID_COLUMNS = 3;
const GRID_ROWS = 5;
const GRID_OPACITY = 0.1;
const GRID_WIDTH = 1;
/** The numeral's ink rule: 24×2px, this far below the numeral's descent. */
const NUMERAL_RULE_WIDTH = 24;
const NUMERAL_RULE_HEIGHT = 2;
const NUMERAL_RULE_GAP = 4;
/** Between the numeral's rule and the line (and its context lines) below. */
const NUMERAL_SPACE = 12;

export interface Reach {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_REACH: Reach = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Room an ornament takes outside the line's bounds (or, for the numeral, at
 * the head of the print area), so the line can be laid out inside the print
 * area minus this and the ornament still lands inside the print area.
 * The circle and the grid need none: the circle's radius is capped to the
 * print area instead, and the grid is the print area itself.
 */
export function ornamentReach(
  ornament: OrnamentKind,
  orientation: LineDirection['orientation'],
  numeral: { ascent: number; descent: number },
): Reach {
  if (ornament === 'rule') {
    const across = RULE_GAP + RULE_WIDTH / 2;
    return orientation === 'vertical'
      ? { top: RULE_OVERHANG, right: across, bottom: RULE_OVERHANG, left: 0 }
      : { top: 0, right: RULE_OVERHANG, bottom: across, left: RULE_OVERHANG };
  }
  if (ornament === 'frame') {
    const r = FRAME_GAP + FRAME_OUTER_GAP + FRAME_OUTER_WIDTH / 2;
    return { top: r, right: r, bottom: r, left: r };
  }
  if (ornament === 'numeral') {
    const block = -numeral.ascent + numeral.descent + NUMERAL_RULE_GAP + NUMERAL_RULE_HEIGHT;
    return { ...NO_REACH, top: block + NUMERAL_SPACE };
  }
  return NO_REACH;
}

/** The print area less an ornament's reach: where the line and its context lines go. */
export function lineArea(
  area: PrintArea,
  direction: Pick<LineDirection, 'ornament' | 'orientation'>,
  numeral: { ascent: number; descent: number },
): PrintArea {
  const reach = ornamentReach(direction.ornament, direction.orientation, numeral);
  return {
    ...area,
    left: area.left + reach.left,
    right: area.right - reach.right,
    top: area.top + reach.top,
    bottom: area.bottom - reach.bottom,
  };
}

export interface OrnamentProps {
  ornament: OrnamentKind;
  orientation: LineDirection['orientation'];
  bounds: LineLayout['bounds'];
  /** The whole print area (not the line's area): the grid fills it, the numeral heads it. */
  area: PrintArea;
  ink: SharedValue<string>;
  accent: SharedValue<string>;
  /** The line is an accent line: its rule is printed in the accent. */
  accentLine: boolean;
  bar: number;
  /** gothic s, used by `numeral`. */
  numeralFont: SkFont;
}

// Skia's component types omit testID; it is only read by tests under the Skia mock.
const tid = (id: string) => ({ testID: id }) as object;

/** Static decoration drawn behind a lyric line, in the palette's ink and accent. `none` draws nothing. */
export function Ornament({
  ornament,
  orientation,
  bounds,
  area,
  ink,
  accent,
  accentLine,
  bar,
  numeralFont,
}: OrnamentProps) {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  if (ornament === 'rule') {
    // Under a horizontal line, to the right of a vertical one, overhanging both ends.
    const [p1, p2] =
      orientation === 'vertical'
        ? [
            { x: right + RULE_GAP, y: bounds.y - RULE_OVERHANG },
            { x: right + RULE_GAP, y: bottom + RULE_OVERHANG },
          ]
        : [
            { x: bounds.x - RULE_OVERHANG, y: bottom + RULE_GAP },
            { x: right + RULE_OVERHANG, y: bottom + RULE_GAP },
          ];
    return (
      <Line
        p1={p1}
        p2={p2}
        color={accentLine ? accent : ink}
        opacity={accentLine ? 1 : RULE_INK_OPACITY}
        style="stroke"
        strokeWidth={RULE_WIDTH}
        {...tid('ornament-rule')}
      />
    );
  }
  if (ornament === 'frame') {
    const around = (gap: number) => ({
      x: bounds.x - gap,
      y: bounds.y - gap,
      width: bounds.width + 2 * gap,
      height: bounds.height + 2 * gap,
    });
    return (
      <Group opacity={FRAME_OPACITY} {...tid('ornament-frame')}>
        <Rect
          {...around(FRAME_GAP)}
          color={ink}
          style="stroke"
          strokeWidth={FRAME_WIDTH}
          {...tid('ornament-frame-inner')}
        />
        <Rect
          {...around(FRAME_GAP + FRAME_OUTER_GAP)}
          color={ink}
          style="stroke"
          strokeWidth={FRAME_OUTER_WIDTH}
          {...tid('ornament-frame-outer')}
        />
      </Group>
    );
  }
  if (ornament === 'circle') {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    // The radius stays 0.6 of the line's height unless that would leave the
    // print area (a tall vertical line), then it touches the area's nearest edge.
    const fit = Math.min(cx - area.left, area.right - cx, cy - area.top, area.bottom - cy) - CIRCLE_WIDTH / 2;
    return (
      <Circle
        cx={cx}
        cy={cy}
        r={Math.max(0, Math.min(bounds.height * CIRCLE_RADIUS, fit))}
        color={accent}
        opacity={CIRCLE_OPACITY}
        style="stroke"
        strokeWidth={CIRCLE_WIDTH}
        {...tid('ornament-circle')}
      />
    );
  }
  if (ornament === 'grid') {
    // The print area itself, its outer lines inset by half a stroke.
    const half = GRID_WIDTH / 2;
    const [left, top, gridRight, gridBottom] = [area.left + half, area.top + half, area.right - half, area.bottom - half];
    const verticals = Array.from({ length: GRID_COLUMNS + 1 }, (_, i) => left + (i * (gridRight - left)) / GRID_COLUMNS);
    const horizontals = Array.from({ length: GRID_ROWS + 1 }, (_, i) => top + (i * (gridBottom - top)) / GRID_ROWS);
    return (
      <Group opacity={GRID_OPACITY} {...tid('ornament-grid')}>
        {verticals.map((x) => (
          <Line
            key={`v${x}`}
            p1={{ x, y: top }}
            p2={{ x, y: gridBottom }}
            color={ink}
            style="stroke"
            strokeWidth={GRID_WIDTH}
          />
        ))}
        {horizontals.map((y) => (
          <Line
            key={`h${y}`}
            p1={{ x: left, y }}
            p2={{ x: gridRight, y }}
            color={ink}
            style="stroke"
            strokeWidth={GRID_WIDTH}
          />
        ))}
      </Group>
    );
  }
  if (ornament === 'numeral') {
    // Top right of the print area, the ink rule right-aligned beneath it.
    const text = String(bar % 100);
    const { ascent, descent } = numeralFont.getMetrics();
    const x = area.right - numeralFont.measureText(text).width;
    const y = area.top - ascent;
    return (
      <>
        <Text x={x} y={y} text={text} font={numeralFont} color={accent} {...tid('ornament-numeral')} />
        <Rect
          x={area.right - NUMERAL_RULE_WIDTH}
          y={y + descent + NUMERAL_RULE_GAP}
          width={NUMERAL_RULE_WIDTH}
          height={NUMERAL_RULE_HEIGHT}
          color={ink}
          {...tid('ornament-numeral-rule')}
        />
      </>
    );
  }
  return null;
}
