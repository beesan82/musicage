import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AmbientScene } from '../AmbientScene';
import { AmbientSceneSkia } from '../AmbientSceneSkia';
import { JazzScene } from '../JazzScene';
import { PopScene } from '../PopScene';
import { SceneRenderer } from '../SceneRenderer';
import { LyricTypography } from '../../components/LyricTypography';

const ambient = {
  style: 'ambient' as const,
  intensity: 0.2,
  motion: 0.1,
  textScale: 0.95,
  accent: 0.1,
  changedAtMs: 0,
};

const jazz = {
  style: 'jazz' as const,
  intensity: 0.55,
  motion: 0.4,
  textScale: 1,
  accent: 0.3,
  changedAtMs: 0,
};

const visualCopy = ['VISUAL', 'COPY'].join(' ');
const notALyricCopy = ['NOT', 'A', 'LYRIC'].join(' ');

interface SceneUniforms {
  iResolution: [number, number];
  iTime: number;
  iIntensity: number;
  iMotion: number;
  iAccent: number;
}

interface JsonNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
}

function findJsonNode(node: JsonNode | string | null, type: string): JsonNode | null {
  if (node === null || typeof node === 'string') {
    return null;
  }
  if (node.type === type) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findJsonNode(child, type);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Lays the scene out and reads the uniforms its runtime shader receives.
 * Under the jest Skia mock `<Shader>` renders a plain `skShader` host element
 * whose `uniforms` prop is the derived value SkiaShaderScene builds; the
 * worklets mock hands that over as a plain object rather than `{ value }`.
 */
async function shaderUniformsAt(
  screen: Awaited<ReturnType<typeof render>>,
  testID: string,
): Promise<SceneUniforms> {
  await fireEvent(screen.getByTestId(testID), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
  const shader = findJsonNode(screen.toJSON() as JsonNode | null, 'skShader');
  const raw = shader?.props?.uniforms as
    | SceneUniforms
    | { value: SceneUniforms }
    | undefined;
  const uniforms = raw && 'value' in raw ? raw.value : raw;

  if (!uniforms || typeof uniforms.iIntensity !== 'number') {
    throw new Error(`Expected ${testID} to mount a runtime shader with uniforms.`);
  }

  return uniforms;
}

function translateYAt(screen: Awaited<ReturnType<typeof render>>, testID: string): number {
  const style = StyleSheet.flatten(screen.getByTestId(testID).props.style);
  const translateY = style.transform?.find(
    (transform: Record<string, unknown>) => transform.translateY !== undefined,
  )?.translateY;

  if (typeof translateY !== 'number') {
    throw new Error(`Expected ${testID} to expose a numeric translateY.`);
  }

  return translateY;
}

it('renders the legacy forward landscape markers for Ambient', async () => {
  const screen = await render(<AmbientScene visual={ambient} reducedMotion />);

  expect(screen.getByTestId('scene-ambient')).toBeTruthy();
  expect(screen.getByTestId('ambient-horizon-near')).toBeTruthy();
});

it('renders the legacy band-response markers for Jazz', async () => {
  const screen = await render(<JazzScene visual={jazz} reducedMotion />);

  expect(screen.getByTestId('scene-jazz')).toBeTruthy();
  expect(screen.getByTestId('jazz-bass')).toBeTruthy();
  expect(screen.getByTestId('jazz-percussion')).toBeTruthy();
  expect(screen.getByTestId('jazz-horn')).toBeTruthy();
});

it('uses a quiet status before a real lyric result exists', async () => {
  const screen = await render(<LyricTypography lyricResult={null} reducedMotion visual={ambient} />);

  expect(screen.getByText('曲を読み取ると、ここに実際の歌詞が表示されます。')).toBeTruthy();
  expect(screen.queryByText(visualCopy)).toBeNull();
  expect(screen.queryByText(notALyricCopy)).toBeNull();
});

it('feeds louder live input straight into the Ambient shader uniforms', async () => {
  // One render at a time: with two trees mounted RNTL only tracks the latest.
  const quiet = await render(
    <SceneRenderer
      reducedMotion
      visual={{
        ...ambient,
        intensity: 0.08,
        motion: 0.06,
        accent: 0.04,
      }}
    />,
  );
  const quietUniforms = await shaderUniformsAt(quiet, 'scene-ambient');
  await quiet.unmount();

  const loud = await render(
    <SceneRenderer
      reducedMotion
      visual={{
        ...ambient,
        intensity: 0.82,
        motion: 0.88,
        accent: 0.72,
      }}
    />,
  );
  const loudUniforms = await shaderUniformsAt(loud, 'scene-ambient');

  expect(loud.getByTestId('scene-ambient-canvas')).toBeTruthy();
  expect(loudUniforms.iIntensity).toBeGreaterThan(quietUniforms.iIntensity);
  expect(loudUniforms.iMotion).toBeGreaterThan(quietUniforms.iMotion);
  expect(loudUniforms.iAccent).toBeGreaterThan(quietUniforms.iAccent);
});

it('renders a scene without any overlay bars on top of the shader', async () => {
  const screen = await render(<SceneRenderer reducedMotion visual={ambient} />);

  expect(screen.queryByTestId('audio-reactive-wave')).toBeNull();
  expect(screen.queryByTestId('audio-reactive-bar-3')).toBeNull();
});

it('pushes the Ambient landscape forward beyond its idle drift when live input rises', async () => {
  const quiet = await render(
    <AmbientScene
      reducedMotion
      visual={{
        ...ambient,
        intensity: 0.08,
        motion: 0.06,
      }}
    />,
  );
  const loud = await render(
    <AmbientScene
      reducedMotion
      visual={{
        ...ambient,
        intensity: 0.82,
        motion: 0.88,
      }}
    />,
  );

  expect(
    translateYAt(loud, 'ambient-horizon-near') -
      translateYAt(quiet, 'ambient-horizon-near'),
  ).toBeLessThan(-30);
});

it.each(['ambient', 'jazz', 'pop', 'dance', 'rock'] as const)(
  'routes %s to a Skia shader scene and mounts its canvas once laid out',
  async (style) => {
    const screen = await render(
      <SceneRenderer reducedMotion visual={{ ...ambient, style }} />,
    );

    const root = screen.getByTestId(`scene-${style}`);
    expect(screen.queryByTestId(`scene-${style}-canvas`)).toBeNull();

    await fireEvent(root, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
    });

    expect(screen.getByTestId(`scene-${style}-canvas`)).toBeTruthy();
  },
);

it('renders the Skia Ambient scene as a still frame under reduced motion', async () => {
  const screen = await render(
    <AmbientSceneSkia reducedMotion visual={{ ...ambient, intensity: 0.7, motion: 0.6 }} />,
  );

  expect(screen.getByTestId('scene-ambient')).toBeTruthy();
});

it.each(['ambient', 'jazz', 'pop', 'dance', 'rock'] as const)(
  'routes %s to one scene root',
  async (style) => {
    const screen = await render(
      <SceneRenderer
        visual={{
          style,
          intensity: 0.5,
          motion: 0.5,
          textScale: 1,
          accent: 0.5,
          changedAtMs: 0,
        }}
        reducedMotion
      />,
    );

    expect(screen.getByTestId(`scene-${style}`)).toBeTruthy();
  },
);

it('keeps the legacy Pop poster card tilt while it responds to motion', async () => {
  const screen = await render(
    <PopScene
      visual={{
        style: 'pop',
        intensity: 0.5,
        motion: 0.5,
        textScale: 1,
        accent: 0.5,
        changedAtMs: 0,
      }}
      reducedMotion
    />,
  );

  const style = StyleSheet.flatten(
    screen.getByTestId('pop-card-pink').props.style,
  );

  expect(style.transform).toEqual(
    expect.arrayContaining([{ rotate: '8deg' }]),
  );
});
