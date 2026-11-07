import { DEFAULT_IDLE_GLYPHS } from '../direction/types';
import { SIZE_RATIO } from './layout';
import type { GlyphMeasure, PlacedGlyph, Viewport } from './layout';

// Idle composition: shown while no lyric line is active. The composition is
// seeded by an 8-bar epoch, so inside an epoch the cells, count and sizes are
// fixed and neighbouring bars differ only in one swapped glyph (see below).
// Glyphs sit on a 3-column x 5-row grid over the same usable area as layout.ts
// (viewport minus insets and a 24px margin). Each chosen cell holds one glyph,
// centred horizontally (x = cell centre - advance / 2) with its baseline at
// cell centre + sizePx * 0.35 (y down). Idle glyphs are never rotated: the
// vertical-writing rotation rule made digits and marks lie sideways here.
// Each glyph also carries `phaseOffset` from its cell, (col + row) / 8, so the
// breathe hold crosses the grid as a wave.
// The caption's `x`, `y` is its baseline origin: left margin, 24px above the bottom inset.

export type IdleTrack = { title: string; artist: string } | null;

export interface IdleComposition {
  glyphs: PlacedGlyph[];
  caption: { text: string; x: number; y: number; sizePx: number } | null;
}

/** Bars per epoch: at 120 BPM an epoch is about 16 seconds. */
export const IDLE_EPOCH_BARS = 8;

const MARGIN = 24;
const COLUMNS = 3;
const ROWS = 5;
const MIN_GLYPHS = 5;
const MAX_GLYPHS = 9;
const BASELINE_OFFSET = 0.35;

// Aligned epochs use one straight line of three cells: the centre column's
// middle rows, or the middle row. Cell index = row * COLUMNS + col.
const ALIGNED_VERTICAL = [1 + COLUMNS, 1 + 2 * COLUMNS, 1 + 3 * COLUMNS];
const ALIGNED_HORIZONTAL = [2 * COLUMNS, 2 * COLUMNS + 1, 2 * COLUMNS + 2];

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
  epoch: number,
  barInEpoch: number,
  glyphs: string,
  viewport: Viewport,
  track: IdleTrack,
  measure: GlyphMeasure,
): IdleComposition {
  const pool = [...(glyphs === '' ? DEFAULT_IDLE_GLYPHS : glyphs)];
  const pick = (key: string, n: number) => fnv1a(`${epoch}:${key}`) % n;

  const top = viewport.insetTop + MARGIN;
  const cellWidth = (viewport.width - 2 * MARGIN) / COLUMNS;
  const cellHeight = (viewport.height - viewport.insetTop - viewport.insetBottom - 2 * MARGIN) / ROWS;

  // Two shapes alternate by epoch (the hash parity alternates with the epoch):
  // scattered over the whole grid, or aligned on one straight line of three.
  const aligned = pick('mode', 2) === 1;
  let cells: number[];
  if (aligned) {
    cells = [...(pick('align', 2) === 0 ? ALIGNED_VERTICAL : ALIGNED_HORIZONTAL)];
  } else {
    const count = MIN_GLYPHS + pick('count', MAX_GLYPHS - MIN_GLYPHS + 1);
    const free = Array.from({ length: COLUMNS * ROWS }, (_, i) => i);
    cells = [];
    for (let index = 0; index < count; index++) {
      cells.push(free.splice(pick(`cell${index}`, free.length), 1)[0]!);
    }
  }
  const count = cells.length;

  const chars = cells.map((_, slot) => pool[pick(`char${slot}`, pool.length)]!);
  // One swap per bar inside the epoch, cumulative: bar `barInEpoch` has seen
  // that many swaps, the j-th targeting slot j % count and redrawing its char
  // (never the char already there, so the change is always visible). The most
  // recently swapped slot is marked by a unique index below.
  let swappedSlot = -1;
  for (let j = 0; j < barInEpoch; j++) {
    const slot = j % count;
    swappedSlot = slot;
    if (pool.length > 1) {
      const current = chars[slot]!;
      const draw = fnv1a(`${epoch}:${j}:swap`) % (pool.length - 1);
      let seen = -1;
      for (const candidate of pool) {
        if (candidate === current) continue;
        seen += 1;
        if (seen === draw) {
          chars[slot] = candidate;
          break;
        }
      }
    }
  }

  const placed: PlacedGlyph[] = cells.map((cell, slot) => {
    const char = chars[slot]!;
    const sizePx = viewport.width * SIZE_RATIO[pick(`size${slot}`, 2) === 0 ? 's' : 'm'];
    const col = cell % COLUMNS;
    const row = Math.floor(cell / COLUMNS);
    const centerX = MARGIN + (col + 0.5) * cellWidth;
    const centerY = top + (row + 0.5) * cellHeight;
    return {
      char,
      // The swapped glyph gets a one-off index so its key in GlyphLayer
      // changes and its `rise` entrance replays; every other slot keeps its
      // slot number as a stable key.
      index: slot === swappedSlot ? 1000 + epoch * IDLE_EPOCH_BARS + barInEpoch : slot,
      x: centerX - measure(char, sizePx).advance / 2,
      y: centerY + sizePx * BASELINE_OFFSET,
      rotateDeg: 0,
      sizePx,
      emphasized: false,
      phaseOffset: (col + row) / 8,
    };
  });

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
