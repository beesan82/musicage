import { fireEvent, render } from '@testing-library/react-native';

import { ListeningControls } from '../ListeningControls';

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
