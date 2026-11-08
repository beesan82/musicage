import { render } from '@testing-library/react-native';
import { makeMutable } from 'react-native-reanimated';

import { DEFAULT_PALETTE } from '../../direction/types';
import type { Palette, Texture } from '../../direction/types';
import { GRAIN_SKSL } from '../grain';
import { PAPER_SKSL } from '../paper';
import { SCAN_SKSL } from '../scan';
import { TextureBackground } from '../TextureBackground';
import { INK_TINT_MAX } from '../../direction/surge';
import {
  DROP_DIP_MS,
  dropDip,
  energyBlend,
  getTextureEffect,
  hexToRgb01,
  mixRgb,
  TEXTURE_BLEND_RANGE,
  TEXTURE_SKSL_PRELUDE,
} from '../textureShader';
import { VOID_SKSL } from '../void';

const TEXTURES: Texture[] = ['paper', 'grain', 'void', 'scan'];

test('hexToRgb01 converts #D7263D', () =>
  expect(hexToRgb01('#D7263D').map((v) => +v.toFixed(3))).toEqual([0.843, 0.149, 0.239]));

test('hexToRgb01 rejects a malformed colour', () => {
  expect(() => hexToRgb01('#D726')).toThrow('#D726');
});

test('compiles an effect for every texture', () => {
  for (const texture of TEXTURES) {
    expect(getTextureEffect(texture)).not.toBeNull();
  }
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

describe('the recognition drop dip (iDrop)', () => {
  test('the prelude declares iDrop and the dip helper, and every texture applies it', () => {
    expect(TEXTURE_SKSL_PRELUDE).toMatch(/uniform float\s+iDrop;/);
    expect(TEXTURE_SKSL_PRELUDE).toContain('float3 dropDip(');
    for (const body of [PAPER_SKSL, GRAIN_SKSL, VOID_SKSL, SCAN_SKSL]) {
      expect(body).toContain('dropDip(');
    }
  });

  test('dropDip is a one-off dip: 0 before the fire, up within 80 ms, back to 0 by 500 ms', () => {
    expect(DROP_DIP_MS).toBe(500);
    expect(dropDip(-10)).toBe(0);
    expect(dropDip(0)).toBe(0);
    expect(dropDip(40)).toBeCloseTo(0.5, 5);
    expect(dropDip(80)).toBe(1);
    expect(dropDip(290)).toBeCloseTo(0.5, 5);
    expect(dropDip(500)).toBe(0);
    expect(dropDip(5_000)).toBe(0);
  });

  const uniformsOf = (container: { queryAll: (p: (n: any) => boolean) => any[] }) => {
    const withUniforms = container.queryAll(
      (node) => (node.props as { uniforms?: { value?: unknown } })?.uniforms?.value !== undefined,
    );
    return (withUniforms[0]!.props as { uniforms: { value: Record<string, number> } }).uniforms.value;
  };

  test('the derived iDrop follows the stage clock from the fire time', async () => {
    const time = makeMutable(10_100);
    const { container, unmount } = await render(
      <TextureBackground
        texture="grain"
        palette={DEFAULT_PALETTE}
        pulse={makeMutable(0)}
        energy={makeMutable(0)}
        time={time}
        dropAtMs={10_000}
        width={390}
        height={844}
      />,
    );
    expect(uniformsOf(container).iDrop).toBeCloseTo(dropDip(100), 5);
    await unmount();
  });

  test('iDrop is 0 without a drop and under reduced motion', async () => {
    const none = await render(
      <TextureBackground
        texture="grain"
        palette={DEFAULT_PALETTE}
        pulse={makeMutable(0)}
        energy={makeMutable(0)}
        time={makeMutable(10_100)}
        dropAtMs={null}
        width={390}
        height={844}
      />,
    );
    expect(uniformsOf(none.container).iDrop).toBe(0);
    await none.unmount();

    const still = await render(
      <TextureBackground
        texture="grain"
        palette={DEFAULT_PALETTE}
        pulse={makeMutable(0)}
        energy={makeMutable(0)}
        time={makeMutable(10_100)}
        dropAtMs={10_000}
        width={390}
        height={844}
        reducedMotion
      />,
    );
    expect(uniformsOf(still.container).iDrop).toBe(0);
    await still.unmount();
  });
});

describe('the surge palette change (iInk / iAccent)', () => {
  const palette = { background: '#0B0B0C', ink: '#EEEEEE', accent: '#FF0000', accentHigh: '#FFFF00' };
  const round = (rgb: number[]) => rgb.map((v) => +v.toFixed(3));
  const uniformsOf = (container: { queryAll: (p: (n: any) => boolean) => any[] }) => {
    const withUniforms = container.queryAll(
      (node) => (node.props as { uniforms?: { value?: unknown } })?.uniforms?.value !== undefined,
    );
    return (withUniforms[0]!.props as { uniforms: { value: Record<string, number[]> } }).uniforms.value;
  };
  const renderWith = (surge: number | undefined, pal: Palette = palette) =>
    render(
      <TextureBackground
        texture="grain"
        palette={pal}
        pulse={makeMutable(0)}
        energy={makeMutable(0)}
        surge={surge === undefined ? undefined : makeMutable(surge)}
        width={390}
        height={844}
      />,
    );

  test('mixRgb interpolates linearly and clamps', () => {
    expect(mixRgb([0, 0, 0], [1, 0.5, 0], 0.5)).toEqual([0.5, 0.25, 0]);
    expect(mixRgb([0, 0, 0], [1, 1, 1], 2)).toEqual([1, 1, 1]);
    expect(mixRgb([0.2, 0.2, 0.2], [1, 1, 1], -1)).toEqual([0.2, 0.2, 0.2]);
  });

  test('without a surge (or undriven) the uniforms are the palette colours', async () => {
    for (const surge of [undefined, 0]) {
      const { container, unmount } = await renderWith(surge);
      const u = uniformsOf(container);
      expect(round(u.iInk!)).toEqual(round(hexToRgb01('#EEEEEE')));
      expect(round(u.iAccent!)).toEqual(round(hexToRgb01('#FF0000')));
      expect(round(u.iBackground!)).toEqual(round(hexToRgb01('#0B0B0C')));
      await unmount();
    }
  });

  test('at full surge the accent is the high accent, the ink takes only INK_TINT_MAX of it, and the background is untouched', async () => {
    const { container, unmount } = await renderWith(1);
    const u = uniformsOf(container);
    expect(round(u.iAccent!)).toEqual(round(hexToRgb01('#FFFF00')));
    expect(round(u.iInk!)).toEqual(round(mixRgb(hexToRgb01('#EEEEEE'), hexToRgb01('#FFFF00'), INK_TINT_MAX)));
    expect(round(u.iBackground!)).toEqual(round(hexToRgb01('#0B0B0C')));
    await unmount();
  });

  test('half way the accent is half way, and without accentHigh the accent itself is the high colour', async () => {
    const half = await renderWith(0.5);
    expect(round(uniformsOf(half.container).iAccent!)).toEqual(
      round(mixRgb(hexToRgb01('#FF0000'), hexToRgb01('#FFFF00'), 0.5)),
    );
    await half.unmount();

    const single = await renderWith(1, { background: '#0B0B0C', ink: '#EEEEEE', accent: '#FF0000' });
    const u = uniformsOf(single.container);
    expect(round(u.iAccent!)).toEqual(round(hexToRgb01('#FF0000')));
    expect(round(u.iInk!)).toEqual(round(mixRgb(hexToRgb01('#EEEEEE'), hexToRgb01('#FF0000'), INK_TINT_MAX)));
    await single.unmount();
  });
});

describe('the energy crossfade (two faces per texture)', () => {
  const bodies: [string, string][] = [
    [PAPER_SKSL, 'paper'],
    [GRAIN_SKSL, 'grain'],
    [VOID_SKSL, 'void'],
    [SCAN_SKSL, 'scan'],
  ];
  // Only comments and string-free SkSL go into the bodies, so stripping the
  // line comments leaves just the code's identifiers.
  const code = (sksl: string) => sksl.replace(/\/\/[^\n]*/g, '');
  const declaredUniforms = () =>
    [...code(TEXTURE_SKSL_PRELUDE).matchAll(/uniform\s+\w+\s+(\w+);/g)].map((m) => m[1]!);
  const usedUniforms = (sksl: string) => new Set(code(sksl).match(/\bi[A-Z][A-Za-z0-9]*\b/g) ?? []);

  test('the prelude declares the blend helpers with the exported range', () => {
    expect(TEXTURE_SKSL_PRELUDE).toContain('float energyBlend()');
    expect(TEXTURE_SKSL_PRELUDE).toContain('float3 blendTextures(float3 calm, float3 lively, float t)');
    expect(TEXTURE_SKSL_PRELUDE).toContain(
      `smoothstep(${TEXTURE_BLEND_RANGE.low.toFixed(2)}, ${TEXTURE_BLEND_RANGE.high.toFixed(2)}, clamp(iEnergy, 0.0, 1.0))`,
    );
    expect(TEXTURE_BLEND_RANGE.low).toBeGreaterThan(0);
    expect(TEXTURE_BLEND_RANGE.high).toBeGreaterThan(TEXTURE_BLEND_RANGE.low);
    expect(TEXTURE_BLEND_RANGE.high).toBeLessThanOrEqual(1);
  });

  test('energyBlend (the TS twin) is 0 below the range, 1 above it, and clamps', () => {
    expect(energyBlend(0)).toBe(0);
    expect(energyBlend(TEXTURE_BLEND_RANGE.low)).toBe(0);
    expect(energyBlend(TEXTURE_BLEND_RANGE.high)).toBe(1);
    expect(energyBlend(1)).toBe(1);
    expect(energyBlend(-5)).toBe(0);
    expect(energyBlend(5)).toBe(1);
    const mid = (TEXTURE_BLEND_RANGE.low + TEXTURE_BLEND_RANGE.high) / 2;
    expect(energyBlend(mid)).toBeCloseTo(0.5, 5);
    expect(energyBlend(mid - 0.1)).toBeLessThan(energyBlend(mid + 0.1));
  });

  test('every texture has a calm and a lively face and mixes them through the prelude helpers', () => {
    for (const [body, name] of bodies) {
      expect(body).toContain(`float3 ${name}Calm(`);
      expect(body).toContain(`float3 ${name}Lively(`);
      expect(body).toContain(`blendTextures(${name}Calm(`);
      expect(body).toContain(`${name}Lively(`);
      expect(body).toContain('energyBlend()');
      // Still exactly one main, declared after both faces.
      expect(body.match(/half4 main\(/g)).toHaveLength(1);
      expect(body.indexOf(`float3 ${name}Lively(`)).toBeLessThan(body.indexOf('half4 main('));
    }
  });

  test('every uniform a texture reads is declared in the prelude (so neither face can reference a missing one)', () => {
    const declared = new Set(declaredUniforms());
    expect(declared).toEqual(
      new Set([
        'iResolution',
        'iTime',
        'iPulse',
        'iEnergy',
        'iLow',
        'iMid',
        'iHigh',
        'iConfidence',
        'iDrop',
        'iBackground',
        'iInk',
        'iAccent',
      ]),
    );
    for (const used of usedUniforms(TEXTURE_SKSL_PRELUDE)) {
      expect(declared).toContain(used);
    }
    for (const [body] of bodies) {
      for (const used of usedUniforms(body)) {
        expect(declared).toContain(used);
      }
    }
  });

  test('the blend weight is the only new place iEnergy enters, and it is clamped at both ends', () => {
    // The prelude reads iEnergy only inside clamp(...) (vignette and energyBlend),
    // so the shader is well-formed at iEnergy = 0 and iEnergy = 1 alike.
    const prelude = code(TEXTURE_SKSL_PRELUDE).replace(/uniform\s+float\s+iEnergy;/, '');
    const reads = prelude.match(/iEnergy/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    expect(prelude.match(/clamp\(iEnergy, 0\.0, 1\.0\)/g)).toHaveLength(reads.length);
    // The bodies take the weight from energyBlend(); the only direct read left
    // is void's calm radius, which predates stage 6 and widens by a bounded amount.
    for (const [body, name] of bodies) {
      const direct = code(body).match(/iEnergy/g) ?? [];
      expect(direct.length).toBe(name === 'void' ? 1 : 0);
    }
  });

  test('paper evaluates a single face outside the crossfade (uniform branch) and both inside', () => {
    const facesAt = PAPER_SKSL.indexOf('float3 paperFaces(float2 fragCoord, float t)');
    const mainAt = PAPER_SKSL.indexOf('half4 main(');
    expect(facesAt).toBeGreaterThan(-1);
    const faces = PAPER_SKSL.slice(facesAt, mainAt);
    const main = PAPER_SKSL.slice(mainAt);
    expect(faces).toMatch(/if \(t <= 0\.0\) return paperCalm\(fragCoord\);/);
    expect(faces).toMatch(/if \(t >= 1\.0\) return paperLively\(fragCoord\);/);
    expect(faces).toContain('return blendTextures(paperCalm(fragCoord), paperLively(fragCoord), t);');
    expect(main).toContain('paperFaces(fragCoord, energyBlend())');
    // The dear noise lives in the faces, not in the branch or main, so a
    // branch really skips it.
    expect(faces + main).not.toContain('fbm3(');
    expect(faces + main).not.toContain('vnoise(');
  });

  test('the shared tail (pulse lift, vignette, drop dip) still follows the crossfade in every texture', () => {
    for (const [body] of bodies) {
      const main = body.slice(body.indexOf('half4 main('));
      const blendAt = main.search(/blendTextures\(|energyBlend\(/);
      expect(blendAt).toBeGreaterThan(-1);
      expect(main.indexOf('iPulse * iConfidence * 0.06')).toBeGreaterThan(blendAt);
      expect(main.indexOf('vignette(uv)')).toBeGreaterThan(main.indexOf('iPulse * iConfidence * 0.06'));
      expect(main.indexOf('dropDip(col)')).toBeGreaterThan(main.indexOf('vignette(uv)'));
    }
  });

  test('the uniforms pass the raw energy through at both ends (the blend lives in the shader)', async () => {
    for (const value of [0, 1]) {
      const { container, unmount } = await render(
        <TextureBackground
          texture="paper"
          palette={DEFAULT_PALETTE}
          pulse={makeMutable(0)}
          energy={makeMutable(value)}
          width={390}
          height={844}
        />,
      );
      const withUniforms = container.queryAll(
        (node) => (node.props as { uniforms?: { value?: unknown } })?.uniforms?.value !== undefined,
      );
      expect((withUniforms[0]!.props as { uniforms: { value: Record<string, number> } }).uniforms.value.iEnergy).toBe(value);
      await unmount();
    }
  });
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
