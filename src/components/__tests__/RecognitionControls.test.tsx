import { fireEvent, render } from '@testing-library/react-native';

import { RecognitionControls } from '../RecognitionControls';
import type { RecognitionViewState } from '../../recognition/types';

const idleState: RecognitionViewState = {
  phase: 'idle',
  result: null,
  message: null,
  retryable: false,
};

describe('RecognitionControls', () => {
  it('shows a disabled progress label during capture', async () => {
    const screen = await render(
      <RecognitionControls
        onRecognize={jest.fn()}
        onRetry={jest.fn()}
        state={{ ...idleState, phase: 'listening' }}
      />,
    );

    const button = screen.getByRole('button', { name: '聴いています…' });

    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it('offers a manual retry after no match without suggesting lyrics', async () => {
    const retry = jest.fn();
    const screen = await render(
      <RecognitionControls
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
