import { Pressable, StyleSheet, Text } from 'react-native';

import { DEFAULT_CHROME_THEME, chromeFont, withAlpha } from '../theme/chrome';
import type { ChromeTheme } from '../theme/chrome';

export interface ChromeButtonProps {
  label: string;
  onPress(): void;
  /** Spoken name when it differs from the printed label. */
  accessibilityLabel?: string;
  disabled?: boolean;
  /** The one main action: its rule is printed in the spot colour. */
  primary?: boolean;
  theme?: ChromeTheme;
  testID?: string;
}

/** The chrome's single button: a ruled field on the stage, not a pill. */
export function ChromeButton({
  label,
  onPress,
  accessibilityLabel = label,
  disabled = false,
  primary = false,
  theme = DEFAULT_CHROME_THEME,
  testID,
}: ChromeButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed && !disabled ? theme.pressed : theme.scrim,
          borderColor: primary ? theme.accent : theme.border,
        },
        disabled ? styles.disabled : null,
      ]}
      testID={testID}
    >
      <Text style={[styles.label, chromeFont(theme, 'bold'), { color: withAlpha(theme.ink, 0.9) }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
