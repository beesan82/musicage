import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PALETTE_FAMILIES } from '../../direction/palettes';
import { DEFAULT_CHROME_THEME, chromeTheme } from '../../theme/chrome';
import { RecognitionControls } from '../RecognitionControls';
import { RECOGNITION_COPY } from '../../recognition/recognitionCopy';
import type { RecognitionPhase, RecognitionViewState } from '../../recognition/types';

const idleState: RecognitionViewState = {
  phase: 'idle',
  result: null,
  message: null,
  retryable: false,
};

function setup(state: RecognitionViewState) {
  const handlers = { onRecognize: jest.fn(), onCancel: jest.fn(), onOpenSettings: jest.fn() };
  return { handlers, render: () => render(<RecognitionControls state={state} {...handlers} />) };
}

describe('RecognitionControls', () => {
  test.each<[RecognitionPhase, string, boolean]>([
    ['idle', '曲を読み取る', false],
    ['listening', '聴き取り中…', false],
    ['resolving_lyrics', '歌詞を探しています…', true],
    ['unavailable', '曲を読み取る', true],
  ])('phase %s shows %s (disabled %s)', async (phase, label, disabled) => {
    const screen = await setup({ ...idleState, phase }).render();
    const button = screen.getByRole('button', { name: label });
    expect(Boolean(button.props.accessibilityState.disabled)).toBe(disabled);
  });

  test('listening press cancels, idle press recognizes', async () => {
    const listening = setup({ ...idleState, phase: 'listening' });
    const a = await listening.render();
    await fireEvent.press(a.getByRole('button', { name: '聴き取り中…' }));
    expect(listening.handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(listening.handlers.onRecognize).not.toHaveBeenCalled();
    await a.unmount();

    const idle = setup(idleState);
    const b = await idle.render();
    await fireEvent.press(b.getByRole('button', { name: '曲を読み取る' }));
    expect(idle.handlers.onRecognize).toHaveBeenCalledTimes(1);
  });

  test.each<RecognitionPhase>(['resolving_lyrics', 'unavailable'])(
    'pressing the disabled button in phase %s calls neither onRecognize nor onCancel',
    async (phase) => {
      const s = setup({ ...idleState, phase });
      const screen = await s.render();
      const button = screen.getByRole('button', { name: phase === 'unavailable' ? '曲を読み取る' : '歌詞を探しています…' });
      expect(button.props.accessibilityState.disabled).toBe(true);

      await fireEvent.press(button);

      expect(s.handlers.onRecognize).not.toHaveBeenCalled();
      expect(s.handlers.onCancel).not.toHaveBeenCalled();
    },
  );

  test('an error message is shown with もう一度読み取る', async () => {
    const s = setup({ ...idleState, phase: 'error', message: RECOGNITION_COPY.match_failed });
    const screen = await s.render();
    expect(screen.getByText(RECOGNITION_COPY.match_failed)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'もう一度読み取る' }));
    expect(s.handlers.onRecognize).toHaveBeenCalledTimes(1);
  });

  test('not_recognized offers a retry', async () => {
    const screen = await setup({ ...idleState, result: { kind: 'not_recognized' } }).render();
    expect(screen.getByRole('button', { name: 'もう一度読み取る' })).toBeTruthy();
  });

  test('unavailable shows the development build copy', async () => {
    const screen = await setup({
      ...idleState,
      phase: 'unavailable',
      message: RECOGNITION_COPY.unavailable,
    }).render();
    expect(screen.getByText(RECOGNITION_COPY.unavailable)).toBeTruthy();
    expect(screen.getByRole('button', { name: '曲を読み取る' })).toBeTruthy();
  });

  test('the settings button opens settings', async () => {
    const s = setup(idleState);
    const screen = await s.render();
    await fireEvent.press(screen.getByRole('button', { name: '設定' }));
    expect(s.handlers.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  describe('chrome (stage F)', () => {
    const styleOf = (element: { props: { style?: unknown } }) =>
      StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;
    const kohaku = PALETTE_FAMILIES.find((f) => f.key === 'kohaku')!.palette;

    test('colours come from the theme: recognize is ruled in accent, settings in border', async () => {
      const theme = chromeTheme(kohaku);
      const handlers = { onRecognize: jest.fn(), onCancel: jest.fn(), onOpenSettings: jest.fn() };
      const screen = await render(
        <RecognitionControls
          state={{ ...idleState, message: RECOGNITION_COPY.unavailable }}
          theme={theme}
          {...handlers}
        />,
      );
      expect(styleOf(screen.getByTestId('recognize-button')).borderColor).toBe(theme.accent);
      expect(styleOf(screen.getByTestId('settings-button')).borderColor).toBe(theme.border);
      expect(styleOf(screen.getByText(RECOGNITION_COPY.unavailable))).toMatchObject({
        color: theme.inkMuted,
        fontSize: 13,
      });
    });

    test('without a theme the colours come from DEFAULT_PALETTE, in the system font', async () => {
      const screen = await setup({ ...idleState, message: RECOGNITION_COPY.unavailable }).render();
      expect(styleOf(screen.getByTestId('recognize-button')).borderColor).toBe(
        DEFAULT_CHROME_THEME.accent,
      );
      const message = styleOf(screen.getByText(RECOGNITION_COPY.unavailable));
      expect(message.color).toBe(DEFAULT_CHROME_THEME.inkMuted);
      expect(message.fontFamily).toBeUndefined();
    });
  });
});
