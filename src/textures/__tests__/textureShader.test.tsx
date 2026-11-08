import { Skia } from '@shopify/react-native-skia';
import { render } from '@testing-library/react-native';
import { makeMutable } from 'react-native-reanimated';

import { DEFAULT_PALETTE } from '../../direction/types';
import { GRAIN_SKSL } from '../grain';
import { TextureBackground } from '../TextureBackground';
import { compileTextureEffect, getTextureEffect, TEXTURE_SKSL_PRELUDE } from '../textureShader';

afterEach(() => {
  jest.restoreAllMocks();
});

// These tests lean on the module-level effect cache in textureShader: each
// test below touches a texture no earlier test in this file has compiled, so
// the Make spy installed at the start of a test is what its texture sees.

const shaderNodes = (container: { queryAll: (p: (n: any) => boolean) => any[] }) =>
  container.queryAll(
    (node) => (node.props as { uniforms?: { value?: unknown } })?.uniforms?.value !== undefined,
  );

test('TextureBackground falls back to a plain fill in the background colour when the shader fails to compile', async () => {
  jest.spyOn(Skia.RuntimeEffect, 'Make').mockReturnValue(null);

  const { container, getByTestId } = await render(
    <TextureBackground
      texture="paper"
      palette={DEFAULT_PALETTE}
      pulse={makeMutable(0)}
      energy={makeMutable(0)}
      width={390}
      height={844}
    />,
  );

  expect(getByTestId('texture-background')).toBeTruthy();
  // No shader on the canvas, and a fill painted in the palette's background.
  expect(shaderNodes(container)).toHaveLength(0);
  const plainFill = container.queryAll(
    (node) => (node.props as { color?: unknown })?.color === DEFAULT_PALETTE.background,
  );
  expect(plainFill.length).toBeGreaterThan(0);
});

test('compileTextureEffect returns null instead of throwing when Make fails, and compiles against the prelude', () => {
  const make = jest.spyOn(Skia.RuntimeEffect, 'Make').mockReturnValue(null);

  expect(compileTextureEffect(GRAIN_SKSL)).toBeNull();
  expect(make).toHaveBeenCalledWith(TEXTURE_SKSL_PRELUDE + GRAIN_SKSL);
});

test('getTextureEffect returns null instead of throwing when Make fails', () => {
  jest.spyOn(Skia.RuntimeEffect, 'Make').mockReturnValue(null);

  expect(getTextureEffect('void')).toBeNull();
});

test('getTextureEffect compiles lazily and caches the result', () => {
  const make = jest.spyOn(Skia.RuntimeEffect, 'Make');
  // Nothing in this file has asked for scan yet, so no compile has happened for it.
  expect(make).not.toHaveBeenCalled();

  const first = getTextureEffect('scan');
  const second = getTextureEffect('scan');

  expect(first).not.toBeNull();
  expect(second).toBe(first);
  expect(make).toHaveBeenCalledTimes(1);
});

test('a shader that compiles is used as the canvas fill', async () => {
  const { container } = await render(
    <TextureBackground
      texture="scan"
      palette={DEFAULT_PALETTE}
      pulse={makeMutable(0)}
      energy={makeMutable(0)}
      width={390}
      height={844}
    />,
  );

  expect(shaderNodes(container).length).toBeGreaterThan(0);
});
