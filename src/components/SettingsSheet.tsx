import { Modal, StyleSheet, Switch, Text, View } from 'react-native';

import type { Settings } from '../settings/settingsStore';
import { DEFAULT_CHROME_THEME, chromeFont } from '../theme/chrome';
import type { ChromeTheme } from '../theme/chrome';
import { ChromeButton } from './ChromeButton';

export interface SettingsSheetProps {
  visible: boolean;
  settings: Settings;
  onToggleAutoRecognize(next: boolean): void;
  onClose(): void;
  theme?: ChromeTheme;
}

export function SettingsSheet({
  visible,
  settings,
  onToggleAutoRecognize,
  onClose,
  theme = DEFAULT_CHROME_THEME,
}: SettingsSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={[styles.backdrop, { backgroundColor: theme.scrim }]} testID="settings-backdrop">
        <View
          style={[styles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
          testID="settings-sheet"
        >
          <Text style={[styles.heading, chromeFont(theme, 'bold'), { color: theme.ink }]}>設定</Text>
          <View style={styles.row}>
            <Text style={[styles.label, chromeFont(theme, 'regular'), { color: theme.ink }]}>
              曲の自動読み取り
            </Text>
            <Switch
              accessibilityLabel="曲の自動読み取り"
              onValueChange={onToggleAutoRecognize}
              thumbColor={theme.ink}
              trackColor={{ true: theme.accent, false: theme.border }}
              value={settings.autoRecognize}
            />
          </View>
          <Text style={[styles.description, chromeFont(theme, 'regular'), { color: theme.inkMuted }]}>
            曲が終わった後や無音のあとに音が戻ったとき、自動で曲を読み取ります。
          </Text>
          <ChromeButton label="閉じる" onPress={onClose} testID="settings-close" theme={theme} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    gap: 14,
    padding: 24,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 15,
    letterSpacing: 2,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 14,
  },
  description: {
    fontSize: 12,
    lineHeight: 19,
  },
});
