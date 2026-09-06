import { fireEvent, render } from '@testing-library/react-native';

import { RecognitionControls } from '../RecognitionControls';
import type { RecognitionViewState } from '../../recognition/types';

const setupRequiredState: RecognitionViewState = {
  phase: 'setup_required',
  result: null,
  message: 'AudDのトークンを設定してください。',
  retryable: false,
};

const idleState: RecognitionViewState = {
  phase: 'idle',
  result: null,
  message: null,
  retryable: false,
};

describe('RecognitionControls', () => {
  it('opens setup instead of capture when no token exists', async () => {
    const recognize = jest.fn();
    const openSettings = jest.fn();
    const screen = await render(
      <RecognitionControls
        onOpenSettings={openSettings}
        onRecognize={recognize}
        onRetry={jest.fn()}
        state={setupRequiredState}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'AudDキーを設定' }));

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(recognize).not.toHaveBeenCalled();
  });

  it('shows a disabled progress label during capture', async () => {
    const screen = await render(
      <RecognitionControls
        onOpenSettings={jest.fn()}
        onRecognize={jest.fn()}
        onRetry={jest.fn()}
        state={{ ...idleState, phase: 'capturing' }}
      />,
    );

    const button = screen.getByRole('button', { name: '音を読み取っています…' });

    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it('offers a manual retry after no match without suggesting lyrics', async () => {
    const retry = jest.fn();
    const screen = await render(
      <RecognitionControls
        onOpenSettings={jest.fn()}
        onRecognize={jest.fn()}
        onRetry={retry}
        state={{ ...idleState, result: { kind: 'not_recognized' } }}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'もう一度読み取る' }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/提案|suggest/i)).toBeNull();
  });
});
