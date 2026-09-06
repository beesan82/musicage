import { act, fireEvent, render } from '@testing-library/react-native';

import { AudDTokenSheet } from '../AudDTokenSheet';

describe('AudDTokenSheet', () => {
  it('saves typed token without rendering a stored token', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const screen = await render(
      <AudDTokenSheet
        hasToken
        onClear={jest.fn().mockResolvedValue(undefined)}
        onClose={jest.fn()}
        onOpenDiagnostics={jest.fn()}
        onSave={save}
        visible
      />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('AudD APIトークン'), 'owner-private-token');
      await Promise.resolve();
    });
    await act(async () => {
      expect(screen.getByLabelText('AudD APIトークン').props.value).toBe('owner-private-token');
      fireEvent.press(screen.getByRole('button', { name: '保存する' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledWith('owner-private-token');
    expect(screen.queryByText('owner-private-token')).toBeNull();
    expect(screen.getByLabelText('AudD APIトークン').props.secureTextEntry).toBe(true);
  });

  it('shows only the fixed message when token storage fails', async () => {
    const screen = await render(
      <AudDTokenSheet
        hasToken={false}
        onClear={jest.fn().mockResolvedValue(undefined)}
        onClose={jest.fn()}
        onOpenDiagnostics={jest.fn()}
        onSave={jest.fn().mockRejectedValue(new Error('private failure detail'))}
        visible
      />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('AudD APIトークン'), 'owner-private-token');
      await Promise.resolve();
    });
    await act(async () => {
      expect(screen.getByLabelText('AudD APIトークン').props.value).toBe('owner-private-token');
      fireEvent.press(screen.getByRole('button', { name: '保存する' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('トークンを保存できませんでした。')).toBeTruthy();
    expect(screen.queryByText('private failure detail')).toBeNull();
    expect(screen.queryByText('owner-private-token')).toBeNull();
  });

  it('opens owner-only sync diagnostics from settings without exposing the token', async () => {
    const openDiagnostics = jest.fn();
    const screen = await render(
      <AudDTokenSheet
        hasToken
        onClear={jest.fn().mockResolvedValue(undefined)}
        onClose={jest.fn()}
        onOpenDiagnostics={openDiagnostics}
        onSave={jest.fn().mockResolvedValue(undefined)}
        visible
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: '同期診断' }));

    expect(openDiagnostics).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('owner-private-token')).toBeNull();
  });
});
