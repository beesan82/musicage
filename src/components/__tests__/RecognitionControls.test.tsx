import { fireEvent, render } from '@testing-library/react-native';

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
});
