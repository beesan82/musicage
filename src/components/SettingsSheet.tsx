import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { Settings } from '../settings/settingsStore';

export interface SettingsSheetProps {
  visible: boolean;
  settings: Settings;
  onToggleAutoRecognize(next: boolean): void;
  onClose(): void;
}

export function SettingsSheet({
  visible,
  settings,
  onToggleAutoRecognize,
  onClose,
}: SettingsSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>設定</Text>
          <View style={styles.row}>
            <Text style={styles.label}>曲の自動読み取り</Text>
            <Switch
              accessibilityLabel="曲の自動読み取り"
              onValueChange={onToggleAutoRecognize}
              value={settings.autoRecognize}
            />
          </View>
          <Text style={styles.description}>
            曲が終わった後や無音のあとに音が戻ったとき、自動で曲を読み取ります。
          </Text>
          <Pressable
            accessibilityLabel="閉じる"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
          >
            <Text style={styles.closeText}>閉じる</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#171B1A',
    borderColor: '#D8D0BA',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 24,
    paddingBottom: 40,
  },
  heading: {
    color: '#F7F2E5',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#F7F2E5',
    fontSize: 14,
    fontWeight: '700',
  },
  description: {
    color: '#C8C6B8',
    fontSize: 12,
    lineHeight: 19,
  },
  close: {
    alignItems: 'center',
    borderColor: '#D8D0BA',
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  closePressed: {
    backgroundColor: 'rgba(226, 219, 198, 0.16)',
  },
  closeText: {
    color: '#F7F2E5',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});
