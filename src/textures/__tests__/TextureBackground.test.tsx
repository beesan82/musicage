import { render } from '@testing-library/react-native';
import { makeMutable } from 'react-native-reanimated';

import { DEFAULT_PALETTE } from '../../direction/types';
import type { Texture } from '../../direction/types';
import { GRAIN_SKSL } from '../grain';
import { PAPER_SKSL } from '../paper';
import { SCAN_SKSL } from '../scan';
import { TextureBackground } from '../TextureBackground';
import { hexToRgb01, TEXTURE_EFFECTS, TEXTURE_SKSL_PRELUDE } from '../textureShader';
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

test('the prelude declares the band and confidence uniforms', () => {
  for (const name of ['iLow', 'iMid', 'iHigh', 'iConfidence']) {
    expect(TEXTURE_SKSL_PRELUDE).toMatch(new RegExp(`uniform float\\s+${name};`));
  }
});

test('every texture gates its pulse response with iConfidence and reads its band', () => {
  const bands: [string, string][] = [
    [GRAIN_SKSL, 'iHigh'],
    [PAPER_SKSL, 'iLow'],
    [SCAN_SKSL, 'iMid'],
    [VOID_SKSL, 'iLow'],
  ];
  for (const [body, band] of bands) {
    expect(body).toContain('iPulse * iConfidence');
    expect(body).toContain(band);
  }
});

test('the derived uniforms carry the band values and the confidence', async () => {
  const { container, unmount } = await render(
    <TextureBackground
      texture="grain"
      palette={DEFAULT_PALETTE}
      pulse={makeMutable(0.5)}
      energy={makeMutable(0.3)}
      low={makeMutable(0.11)}
      mid={makeMutable(0.22)}
      high={makeMutable(0.33)}
      confidence={makeMutable(0.9)}
      width={390}
      height={844}
    />,
  );
  const withUniforms = container.queryAll(
    (node) => (node.props as { uniforms?: { value?: unknown } })?.uniforms?.value !== undefined,
  );
  expect(withUniforms.length).toBeGreaterThan(0);
  const uniforms = (
    withUniforms[0]!.props as { uniforms: { value: Record<string, number> } }
  ).uniforms.value;
  expect(uniforms.iPulse).toBeCloseTo(0.5);
  expect(uniforms.iLow).toBeCloseTo(0.11);
  expect(uniforms.iMid).toBeCloseTo(0.22);
  expect(uniforms.iHigh).toBeCloseTo(0.33);
  expect(uniforms.iConfidence).toBeCloseTo(0.9);
  await unmount();
});
