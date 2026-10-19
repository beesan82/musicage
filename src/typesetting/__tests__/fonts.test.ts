import { renderHook } from '@testing-library/react-native';

import { FONT_SOURCES, resolveFontSource, useStageTypefaces } from '../fonts';

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

// Under Jest every .ttf require resolves to the same asset stub, so the file
// choice is checked against the source text and the files on disk. The app's
// tsconfig has no Node types, hence the typed require.
const { existsSync, readFileSync } = require('fs') as {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
};
const ROOT = (process as unknown as { cwd(): string }).cwd();
test('fonts are static files that exist, with gothic in separate Regular and Bold files', () => {
  const source = readFileSync(`${ROOT}/src/typesetting/fonts.ts`, 'utf8');
  const files = [...source.matchAll(/require\('\.\.\/\.\.\/assets\/fonts\/([^']+)'\)/g)].map((m) => m[1]!);
  expect(files).toHaveLength(7);
  expect(files).toEqual(expect.arrayContaining(['ZenKakuGothicNew-Regular.ttf', 'ZenKakuGothicNew-Bold.ttf']));
  expect(files.some((file) => /variable/i.test(file))).toBe(false);
  for (const file of files) {
    expect(existsSync(`${ROOT}/assets/fonts/${file}`)).toBe(true);
  }
  expect(FONT_SOURCES.gothic.bold).toBeDefined();
});

test('useStageTypefaces loads each of the seven font files once', async () => {
  const skia = jest.requireMock('@shopify/react-native-skia') as { useTypeface: (source: number) => unknown };
  const spy = jest.spyOn(skia, 'useTypeface');
  const { result } = await renderHook(() => useStageTypefaces());

  // Six regular files plus the gothic bold.
  expect(spy).toHaveBeenCalledTimes(7);
  expect(result.current?.gothic?.bold).toBeDefined();
  spy.mockRestore();
});
