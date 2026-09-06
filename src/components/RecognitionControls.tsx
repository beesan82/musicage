import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RecognitionPhase, RecognitionViewState } from '../recognition/types';

export interface RecognitionControlsProps {
  state: RecognitionViewState;
  onRecognize(): void;
  onRetry(): void;
  onOpenSettings(): void;
}

const PROGRESS_LABELS: Partial<Record<RecognitionPhase, string>> = {
  capturing: '音を読み取っています…',
  identifying: '曲を特定しています…',
  resolving_lyrics: '歌詞を探しています…',
};

export function RecognitionControls({
  state,
  onRecognize,
  onRetry,
  onOpenSettings,
}: RecognitionControlsProps) {
  const progressLabel = PROGRESS_LABELS[state.phase];
  const isNoMatch = state.result?.kind === 'not_recognized';
  const opensSettings = state.phase === 'setup_required';
  const retries = !opensSettings && (state.retryable || isNoMatch);
  const label = progressLabel
    ?? (opensSettings ? 'AudDキーを設定' : retries ? 'もう一度読み取る' : '曲を読み取る');
  const disabled = Boolean(progressLabel);
  const onPress = opensSettings ? onOpenSettings : retries ? onRetry : onRecognize;

  return (
    <View style={styles.root} testID="recognition-controls">
      {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
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
