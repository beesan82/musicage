import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PALETTE_FAMILIES } from '../../direction/palettes';
import { DEFAULT_CHROME_THEME, chromeTheme } from '../../theme/chrome';
import { ListeningControls } from '../ListeningControls';

const styleOf = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

it('prints the mic button and the denied copy from the theme (stage F)', async () => {
  const theme = chromeTheme(PALETTE_FAMILIES.find((f) => f.key === 'umi')!.palette, {
    regular: 'Gothic-R',
    bold: 'Gothic-B',
  });
  const screen = await render(
    <ListeningControls
      errorMessage={null}
      onRetry={jest.fn()}
      onStart={jest.fn()}
      onStop={jest.fn()}
      status="denied"
      theme={theme}
    />,
  );

  expect(styleOf(screen.getByTestId('microphone-button'))).toMatchObject({
    borderColor: theme.border,
    backgroundColor: theme.scrim,
    borderRadius: 14,
  });
  expect(styleOf(screen.getByText('マイクを許可すると、音に反応する映像が動きます。'))).toMatchObject({
    color: theme.inkMuted,
    fontFamily: 'Gothic-R',
    fontSize: 13,
  });
});

it('falls back to the default palette without a theme', async () => {
  const screen = await render(
    <ListeningControls
      errorMessage={null}
      onRetry={jest.fn()}
      onStart={jest.fn()}
      onStop={jest.fn()}
      status="requesting"
    />,
  );
  const button = styleOf(screen.getByTestId('microphone-button'));
  expect(button.borderColor).toBe(DEFAULT_CHROME_THEME.border);
  expect(button.opacity).toBe(0.4);
});

it('offers retry when access is denied', async () => {
  const onRetry = jest.fn();
  const screen = await render(
    <ListeningControls
      errorMessage={null}
      onRetry={onRetry}
      onStart={jest.fn()}
      onStop={jest.fn()}
      status="denied"
    />,
  );

  fireEvent.press(screen.getByRole('button', { name: 'マイクをもう一度試す' }));

  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('offers a stop control while listening', async () => {
  const onStop = jest.fn();
  const screen = await render(
    <ListeningControls
      errorMessage={null}
      onRetry={jest.fn()}
      onStart={jest.fn()}
      onStop={onStop}
      status="listening"
    />,
  );

  fireEvent.press(screen.getByRole('button', { name: 'マイクを止める' }));

  expect(onStop).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: '曲を読み取る' })).toBeNull();
});

it('shows recovery copy and a start action after an error', async () => {
  const onStart = jest.fn();
  const screen = await render(
    <ListeningControls
      errorMessage="マイクを開始できませんでした。もう一度試してください。"
      onRetry={jest.fn()}
      onStart={onStart}
      onStop={jest.fn()}
      status="error"
    />,
  );

  expect(
    screen.getByText('マイクを開始できませんでした。もう一度試してください。'),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'マイクを開始する' }));

  expect(onStart).toHaveBeenCalledTimes(1);
});
