import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PALETTE_FAMILIES } from '../../direction/palettes';
import { DEFAULT_CHROME_THEME, chromeTheme } from '../../theme/chrome';
import type { ChromeTheme } from '../../theme/chrome';
import { SettingsSheet } from '../SettingsSheet';

test('shows the auto-recognize switch with its value and calls onToggleAutoRecognize', async () => {
  const onToggle = jest.fn();
  const onClose = jest.fn();
  const screen = await render(
    <SettingsSheet
      onClose={onClose}
      onToggleAutoRecognize={onToggle}
      settings={{ autoRecognize: true }}
      visible
    />,
  );

  expect(screen.getByText('設定')).toBeTruthy();
  expect(
    screen.getByText('曲が終わった後や無音のあとに音が戻ったとき、自動で曲を読み取ります。'),
  ).toBeTruthy();
  const toggle = screen.getByLabelText('曲の自動読み取り');
  expect(toggle.props.value).toBe(true);

  await fireEvent(toggle, 'valueChange', false);
  expect(onToggle).toHaveBeenCalledWith(false);

  await fireEvent.press(screen.getByRole('button', { name: '閉じる' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

const styleOf = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

const renderSheet = (theme?: ChromeTheme) =>
  render(
    <SettingsSheet
      onClose={jest.fn()}
      onToggleAutoRecognize={jest.fn()}
      settings={{ autoRecognize: true }}
      theme={theme}
      visible
    />,
  );

test('the sheet is printed from the theme (stage F)', async () => {
  const theme = chromeTheme(PALETTE_FAMILIES.find((f) => f.key === 'midori')!.palette, {
    regular: 'Gothic-R',
    bold: 'Gothic-B',
  });
  const screen = await renderSheet(theme);

  expect(styleOf(screen.getByTestId('settings-backdrop')).backgroundColor).toBe(theme.scrim);
  expect(styleOf(screen.getByTestId('settings-sheet'))).toMatchObject({
    backgroundColor: theme.surface,
    borderTopColor: theme.border,
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  });
  expect(styleOf(screen.getByText('設定'))).toMatchObject({
    color: theme.ink,
    fontFamily: 'Gothic-B',
    fontSize: 15,
    letterSpacing: 2,
  });
  expect(styleOf(screen.getByText('曲の自動読み取り'))).toMatchObject({
    color: theme.ink,
    fontFamily: 'Gothic-R',
    fontSize: 14,
  });
  expect(
    styleOf(screen.getByText('曲が終わった後や無音のあとに音が戻ったとき、自動で曲を読み取ります。')),
  ).toMatchObject({ color: theme.inkMuted, fontSize: 12 });
  // iOS host props of Switch: trackColor.true → onTintColor, .false → tintColor.
  const toggle = screen.getByLabelText('曲の自動読み取り');
  expect(toggle.props.onTintColor).toBe(theme.accent);
  expect(toggle.props.tintColor).toBe(theme.border);
  expect(toggle.props.thumbTintColor).toBe(theme.ink);
  expect(styleOf(screen.getByTestId('settings-close')).borderColor).toBe(theme.border);
});

test('without a theme the sheet uses DEFAULT_PALETTE, in the system font', async () => {
  const screen = await renderSheet();
  expect(styleOf(screen.getByTestId('settings-sheet')).backgroundColor).toBe(
    DEFAULT_CHROME_THEME.surface,
  );
  expect(styleOf(screen.getByText('設定')).fontFamily).toBeUndefined();
});
