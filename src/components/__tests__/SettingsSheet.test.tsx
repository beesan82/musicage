import { fireEvent, render } from '@testing-library/react-native';

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
