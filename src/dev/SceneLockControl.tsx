import { Pressable, StyleSheet, Text } from 'react-native';

import { sceneLockLabel } from './sceneLock';
import type { SceneLockController } from './useSceneLock';

interface SceneLockControlProps {
  sceneLock: SceneLockController;
}

/**
 * Small translucent pill in the top-right corner. Each tap advances
 * ambient → jazz → pop → dance → rock → AUTO. Renders nothing outside
 * development builds.
 */
export function SceneLockControl({ sceneLock }: SceneLockControlProps) {
  if (!sceneLock.enabled) {
    return null;
  }

  const isLocked = sceneLock.locked !== null;

  return (
    <Pressable
      accessibilityLabel="シーンを固定"
      accessibilityRole="button"
      hitSlop={12}
      onPress={sceneLock.cycle}
      style={({ pressed }) => [
        styles.pill,
        isLocked ? styles.pillLocked : null,
        pressed ? styles.pillPressed : null,
      ]}
      testID="scene-lock"
    >
      <Text style={[styles.label, isLocked ? styles.labelLocked : null]}>
        {sceneLockLabel(sceneLock.locked)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    right: 20,
    top: 40,
    borderColor: 'rgba(169, 170, 164, 0.35)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(16, 17, 18, 0.35)',
  },
  pillLocked: {
    borderColor: 'rgba(244, 240, 230, 0.6)',
    backgroundColor: 'rgba(16, 17, 18, 0.6)',
  },
  pillPressed: {
    opacity: 0.6,
  },
  label: {
    color: 'rgba(169, 170, 164, 0.7)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  labelLocked: {
    color: '#F4F0E6',
  },
});
