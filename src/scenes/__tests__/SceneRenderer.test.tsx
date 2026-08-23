import { act, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AmbientScene } from '../AmbientScene';
import { JazzScene } from '../JazzScene';
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

it('renders the forward landscape markers for Ambient', async () => {
  const screen = await render(<AmbientScene visual={ambient} reducedMotion />);

  expect(screen.getByTestId('scene-ambient')).toBeTruthy();
  expect(screen.getByTestId('ambient-horizon-near')).toBeTruthy();
});

it('renders individual band-response markers for Jazz', async () => {
  const screen = await render(<JazzScene visual={jazz} reducedMotion />);

  expect(screen.getByTestId('scene-jazz')).toBeTruthy();
  expect(screen.getByTestId('jazz-bass')).toBeTruthy();
  expect(screen.getByTestId('jazz-percussion')).toBeTruthy();
  expect(screen.getByTestId('jazz-horn')).toBeTruthy();
});

it('labels the local typography as visual copy rather than lyrics', async () => {
  jest.useFakeTimers();

  try {
    const screen = await render(<LyricTypography visual={ambient} />);

    await act(() => {
      jest.runAllTimers();
    });

    expect(screen.getByText('VISUAL COPY')).toBeTruthy();
    expect(screen.getByText('THE ROOM MOVES')).toBeTruthy();
    expect(screen.queryByText('LYRICS')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
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

it('keeps the Pop poster card tilt while it responds to motion', async () => {
  const screen = await render(
    <SceneRenderer
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
