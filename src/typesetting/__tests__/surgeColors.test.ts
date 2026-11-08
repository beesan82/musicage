import { interpolateColor } from 'react-native-reanimated';

import { INK_TINT_MAX, surgeHighHex } from '../../direction/surge';
import type { Palette } from '../../direction/types';
import {
  GLOW_MAX_GLYPHS,
  GLOW_RADIUS_MAX_PX,
  glowAmount,
  glowOpacity,
  glowRadiusPx,
  surgeAccent,
  surgeInk,
} from '../surgeColors';

const single: Palette = { background: '#000000', ink: '#EEEEEE', accent: '#FF0000' };
const palette: Palette = { ...single, accentHigh: '#FFFF00' };

test('the high colour is the second accent, or the accent itself without one', () => {
  expect(surgeHighHex(palette)).toBe('#FFFF00');
  expect(surgeHighHex(single)).toBe('#FF0000');
});

test('outside a surge the ink and accent are the palette strings, untouched', () => {
  expect(surgeInk(palette, 0)).toBe('#EEEEEE');
  expect(surgeAccent(palette, 0)).toBe('#FF0000');
  expect(surgeInk(palette, -1)).toBe('#EEEEEE');
});

test('at full surge the accent reaches the high accent and the ink takes only a trace of it', () => {
  expect(surgeAccent(palette, 1)).toBe(interpolateColor(1, [0, 1], ['#FF0000', '#FFFF00']));
  expect(surgeAccent(palette, 0.5)).toBe(interpolateColor(0.5, [0, 1], ['#FF0000', '#FFFF00']));
  expect(surgeInk(palette, 1)).toBe(interpolateColor(INK_TINT_MAX, [0, 1], ['#EEEEEE', '#FFFF00']));
  expect(INK_TINT_MAX).toBeLessThanOrEqual(0.2);
});

test('without a second accent the accent is fixed and the ink leans towards the accent', () => {
  expect(surgeAccent(single, 1)).toBe(interpolateColor(1, [0, 1], ['#FF0000', '#FF0000']));
  expect(surgeInk(single, 1)).toBe(interpolateColor(INK_TINT_MAX, [0, 1], ['#EEEEEE', '#FF0000']));
});

test('the glow needs both a beat head and a surge, and is quartered on a doubtful beat', () => {
  expect(glowAmount(1, 0, 0.9)).toBe(0);
  expect(glowAmount(0, 1, 0.9)).toBe(0);
  expect(glowAmount(1, 1, 0.9)).toBe(1);
  expect(glowAmount(1, 0.5, 0.9)).toBe(0.5);
  expect(glowAmount(1, 1, 0.3)).toBe(0.25);
});

test('the glow radius never exceeds the spec ceiling of 10 px, and the limit is three glyphs', () => {
  expect(GLOW_RADIUS_MAX_PX).toBeLessThanOrEqual(10);
  expect(glowRadiusPx(1)).toBe(GLOW_RADIUS_MAX_PX);
  expect(glowRadiusPx(5)).toBe(GLOW_RADIUS_MAX_PX);
  expect(glowRadiusPx(0)).toBe(0);
  expect(glowOpacity(0)).toBe(0);
  expect(glowOpacity(1)).toBeLessThanOrEqual(1);
  expect(GLOW_MAX_GLYPHS).toBe(3);
});
