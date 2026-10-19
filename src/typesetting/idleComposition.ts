import { DEFAULT_IDLE_GLYPHS } from '../direction/types';
import { ROTATED_IN_VERTICAL, SIZE_RATIO } from './layout';
import type { GlyphMeasure, PlacedGlyph, Viewport } from './layout';

// Idle composition: shown while no lyric line is active. `bar` is the only seed, so a
// bar always yields the same arrangement and neighbouring bars differ.
// Glyphs sit on a 3-column x 5-row grid over the same usable area as layout.ts (viewport
// minus insets and a 24px margin). Each chosen cell holds one glyph, centred horizontally
// (x = cell centre - advance / 2) with its baseline at cell centre + sizePx * 0.35 (y down).
// Glyphs are treated as vertical-writing: `rotateDeg` follows ROTATED_IN_VERTICAL.
// The caption's `x`, `y` is its baseline origin: left margin, 24px above the bottom inset.

export type IdleTrack = { title: string; artist: string } | null;

export interface IdleComposition {
  glyphs: PlacedGlyph[];
  caption: { text: string; x: number; y: number; sizePx: number } | null;
}

const MARGIN = 24;
const COLUMNS = 3;
const ROWS = 5;
const MIN_GLYPHS = 5;
const MAX_GLYPHS = 9;
const BASELINE_OFFSET = 0.35;

/** FNV-1a 32-bit hash. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function composeIdle(
  bar: number,
  glyphs: string,
  viewport: Viewport,
  track: IdleTrack,
  measure: GlyphMeasure,
): IdleComposition {
  const pool = [...(glyphs === '' ? DEFAULT_IDLE_GLYPHS : glyphs)];
  const pick = (key: string, n: number) => fnv1a(`${bar}:${key}`) % n;

  const top = viewport.insetTop + MARGIN;
  const cellWidth = (viewport.width - 2 * MARGIN) / COLUMNS;
  const cellHeight = (viewport.height - viewport.insetTop - viewport.insetBottom - 2 * MARGIN) / ROWS;

  const count = MIN_GLYPHS + pick('count', MAX_GLYPHS - MIN_GLYPHS + 1);
  const free = Array.from({ length: COLUMNS * ROWS }, (_, i) => i);
  const placed: PlacedGlyph[] = [];
  for (let index = 0; index < count; index++) {
    const cell = free.splice(pick(`cell${index}`, free.length), 1)[0]!;
    const char = pool[pick(`char${index}`, pool.length)]!;
    const sizePx = viewport.width * SIZE_RATIO[pick(`size${index}`, 2) === 0 ? 's' : 'm'];
    const centerX = MARGIN + ((cell % COLUMNS) + 0.5) * cellWidth;
    const centerY = top + (Math.floor(cell / COLUMNS) + 0.5) * cellHeight;
    placed.push({
      char,
      index,
      x: centerX - measure(char, sizePx).advance / 2,
      y: centerY + sizePx * BASELINE_OFFSET,
      rotateDeg: ROTATED_IN_VERTICAL.test(char) ? 90 : 0,
      sizePx,
      emphasized: false,
    });
  }

  return {
    glyphs: placed,
    caption: track && {
      text: `${track.artist} — ${track.title}`,
      x: MARGIN,
      y: viewport.height - viewport.insetBottom - MARGIN,
      sizePx: viewport.width * SIZE_RATIO.xs,
    },
  };
}
