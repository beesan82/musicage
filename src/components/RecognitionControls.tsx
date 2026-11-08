import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RecognitionViewState } from '../recognition/types';

export interface RecognitionControlsProps {
  state: RecognitionViewState;
  onRecognize(): void;
  onCancel(): void;
  onOpenSettings(): void;
}

export function RecognitionControls({
  state,
  onRecognize,
  onCancel,
  onOpenSettings,
}: RecognitionControlsProps) {
  const listening = state.phase === 'listening';
  const resolving = state.phase === 'resolving_lyrics';
  const unavailable = state.phase === 'unavailable';
  const retries =
    !unavailable &&
    (state.phase === 'error' || state.result?.kind === 'not_recognized' || Boolean(state.message));
  const label = listening
    ? '聴き取り中…'
    : resolving
      ? '歌詞を探しています…'
      : retries
        ? 'もう一度読み取る'
        : '曲を読み取る';
  const disabled = resolving || unavailable;
  const onPress = listening ? onCancel : onRecognize;

  return (
    <View style={styles.root} testID="recognition-controls">
      {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
      <View style={styles.row}>
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [
            styles.button,
            disabled && styles.buttonDisabled,
            pressed && !disabled && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>{label}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="設定"
          accessibilityRole="button"
          onPress={onOpenSettings}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>設定</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
    gap: 10,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  message: {
    color: '#C8C6B8',
    fontSize: 12,
    lineHeight: 19,
    maxWidth: 300,
  },
  button: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 21, 20, 0.68)',
    borderColor: '#D8D0BA',
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    opacity: 0.48,
  },
  buttonPressed: {
    backgroundColor: 'rgba(226, 219, 198, 0.16)',
  },
  buttonText: {
    color: '#F7F2E5',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});
