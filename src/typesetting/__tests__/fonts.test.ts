import { FONT_SOURCES, resolveFontSource } from '../fonts';

test('every font key has a regular source', () => {
  for (const key of ['mincho', 'mincho-old', 'gothic', 'gothic-heavy', 'gothic-round', 'brush'] as const) {
    expect(FONT_SOURCES[key].regular).toBeDefined();
  }
});

test('bold falls back to regular when the family has no bold file', () => {
  expect(resolveFontSource('brush', 'bold')).toBe(FONT_SOURCES.brush.regular);
  expect(resolveFontSource('gothic', 'bold')).toBe(FONT_SOURCES.gothic.bold);
  expect(resolveFontSource('mincho', 'light')).toBe(FONT_SOURCES.mincho.regular);
});
