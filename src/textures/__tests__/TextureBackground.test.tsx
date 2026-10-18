import { render } from '@testing-library/react-native';
import { makeMutable } from 'react-native-reanimated';

import { DEFAULT_PALETTE } from '../../direction/types';
import type { Texture } from '../../direction/types';
import { GRAIN_SKSL } from '../grain';
import { PAPER_SKSL } from '../paper';
import { SCAN_SKSL } from '../scan';
import { TextureBackground } from '../TextureBackground';
import { hexToRgb01, TEXTURE_EFFECTS } from '../textureShader';
import { VOID_SKSL } from '../void';

const TEXTURES: Texture[] = ['paper', 'grain', 'void', 'scan'];

test('hexToRgb01 converts #D7263D', () =>
  expect(hexToRgb01('#D7263D').map((v) => +v.toFixed(3))).toEqual([0.843, 0.149, 0.239]));

test('hexToRgb01 rejects a malformed colour', () => {
  expect(() => hexToRgb01('#D726')).toThrow('#D726');
});

test('compiles an effect for every texture', () => {
  expect(Object.keys(TEXTURE_EFFECTS).sort()).toEqual([...TEXTURES].sort());
});

test('renders a shader fill for each texture without throwing', async () => {
  const pulse = makeMutable(0.5);
  const energy = makeMutable(0.3);

  for (const texture of TEXTURES) {
    const { getByTestId, unmount } = await render(
      <TextureBackground
        texture={texture}
        palette={DEFAULT_PALETTE}
        pulse={pulse}
        energy={energy}
        width={390}
        height={844}
      />,
    );
    expect(getByTestId('texture-background')).toBeTruthy();
    await unmount();
  }
});

test('renders a still frame with reducedMotion', async () => {
  const { getByTestId } = await render(
    <TextureBackground
      texture="grain"
      palette={DEFAULT_PALETTE}
      pulse={makeMutable(0)}
      energy={makeMutable(0)}
      width={390}
      height={844}
      reducedMotion
    />,
  );
  expect(getByTestId('texture-background')).toBeTruthy();
});

test('every texture body declares main and uses iPulse', () => {
  for (const body of [PAPER_SKSL, GRAIN_SKSL, VOID_SKSL, SCAN_SKSL]) {
    expect(body).toMatch(/half4 main\(/);
    expect(body).toContain('iPulse');
  }
});
