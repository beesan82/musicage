import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PALETTE_FAMILIES } from '../../direction/palettes';
import { DEFAULT_CHROME_THEME, chromeTheme, withAlpha } from '../../theme/chrome';
import { ChromeButton } from '../ChromeButton';

const ai = PALETTE_FAMILIES.find((f) => f.key === 'ai')!.palette;

const styleOf = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

describe('ChromeButton', () => {
  test('prints a ruled field from the theme (§3f.3)', async () => {
    const theme = chromeTheme(ai);
    const screen = await render(<ChromeButton label="設定" onPress={jest.fn()} testID="b" theme={theme} />);

    const button = styleOf(screen.getByTestId('b'));
    expect(button).toMatchObject({
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.scrim,
    });
    const text = styleOf(screen.getByText('設定'));
    expect(text).toMatchObject({ fontSize: 12, letterSpacing: 1.5, color: withAlpha(theme.ink, 0.9) });
  });

  test('the primary button is ruled in the accent', async () => {
    const theme = chromeTheme(ai);
    const screen = await render(
      <ChromeButton label="曲を読み取る" onPress={jest.fn()} primary testID="b" theme={theme} />,
    );
    expect(styleOf(screen.getByTestId('b')).borderColor).toBe(theme.accent);
  });

  test('disabled is 0.4 and does not press', async () => {
    const onPress = jest.fn();
    const screen = await render(<ChromeButton disabled label="x" onPress={onPress} testID="b" />);
    const button = screen.getByTestId('b');
    expect(styleOf(button).opacity).toBe(0.4);
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('without a theme it uses the default palette, in the system font', async () => {
    const screen = await render(<ChromeButton label="x" onPress={jest.fn()} testID="b" />);
    expect(styleOf(screen.getByTestId('b')).borderColor).toBe(DEFAULT_CHROME_THEME.border);
    const text = styleOf(screen.getByText('x'));
    expect(text.fontFamily).toBeUndefined();
    expect(text.fontWeight).toBe('700');
  });

  test('uses the bundled gothic bold once loaded', async () => {
    const theme = chromeTheme(ai, { regular: 'Gothic-R', bold: 'Gothic-B' });
    const screen = await render(<ChromeButton label="x" onPress={jest.fn()} theme={theme} />);
    const text = styleOf(screen.getByText('x'));
    expect(text.fontFamily).toBe('Gothic-B');
    expect(text.fontWeight).toBeUndefined();
  });
});
