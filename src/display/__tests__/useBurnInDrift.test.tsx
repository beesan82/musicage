import { render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';

import { DRIFT_RADIUS_PX, useBurnInDrift } from '../useBurnInDrift';

function Drifter({ reducedMotion }: { reducedMotion: boolean }) {
  const drift = useBurnInDrift(reducedMotion);

  return <Animated.View style={drift} testID="drifter" />;
}

function translation(screen: Awaited<ReturnType<typeof render>>): { x: number; y: number } {
  const style = StyleSheet.flatten(screen.getByTestId('drifter').props.style);
  const read = (key: 'translateX' | 'translateY'): number => {
    const entry = style.transform?.find(
      (transform: Record<string, unknown>) => transform[key] !== undefined,
    );
    const value = entry?.[key];
    return typeof value === 'number' ? value : Number(value?.__getValue?.() ?? NaN);
  };

  return { x: read('translateX'), y: read('translateY') };
}

it('starts centred and stays still under reduced motion', async () => {
  const screen = await render(<Drifter reducedMotion />);

  expect(translation(screen)).toEqual({ x: 0, y: 0 });
});

it('starts one slow loop per axis from the centre when motion is allowed', async () => {
  // The loops run on the native driver, so jest cannot watch the values
  // move; what can be checked is that both axes start centred, one loop is
  // started per axis, and the radius stays small enough to go unnoticed.
  const loop = jest.spyOn(Animated, 'loop');
  const screen = await render(<Drifter reducedMotion={false} />);

  expect(translation(screen)).toEqual({ x: 0, y: 0 });
  expect(loop).toHaveBeenCalledTimes(2);
  expect(DRIFT_RADIUS_PX).toBeLessThanOrEqual(12);

  loop.mockRestore();
});
