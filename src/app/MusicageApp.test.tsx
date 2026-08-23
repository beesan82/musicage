import { render } from '@testing-library/react-native';

import { MusicageApp } from './MusicageApp';

it('renders the portrait visual-object shell', async () => {
  const screen = await render(<MusicageApp />);

  expect(screen.getByTestId('musicage-root')).toBeTruthy();
  expect(screen.getByText('MUSICAGE')).toBeTruthy();
});
