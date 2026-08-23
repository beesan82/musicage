import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ListeningStatus } from '../audio/useMicrophoneAnalysis';

interface ListeningControlsProps {
  status: ListeningStatus;
  errorMessage: string | null;
  onRetry(): void;
  onStop(): void;
  onStart(): void;
}

const DENIED_COPY = 'マイクを許可すると、音に反応する映像が動きます。';

export function ListeningControls({
  status,
  errorMessage,
  onRetry,
  onStop,
  onStart,
}: ListeningControlsProps) {
  const isListening = status === 'listening';
  const isDenied = status === 'denied';
  const isRequesting = status === 'requesting';
  const accessibleLabel = isListening
    ? 'マイクを止める'
    : isDenied
      ? 'マイクをもう一度試す'
      : 'マイクを開始する';
  const onPress = isListening ? onStop : isDenied ? onRetry : onStart;

  return (
    <View style={styles.root} testID="listening-controls">
      {isDenied ? <Text style={styles.message}>{DENIED_COPY}</Text> : null}
      {status === 'error' && errorMessage ? (
        <Text style={styles.message}>{errorMessage}</Text>
      ) : null}
      <Pressable
        accessibilityLabel={accessibleLabel}
        accessibilityRole="button"
        disabled={isRequesting}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          isRequesting ? styles.buttonDisabled : null,
          pressed && !isRequesting ? styles.buttonPressed : null,
        ]}
      >
        <Text style={styles.buttonText}>{accessibleLabel}</Text>
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
    color: '#D8D4CA',
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 280,
  },
  button: {
    alignItems: 'center',
    borderColor: '#A9AAA4',
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    opacity: 0.42,
  },
  buttonPressed: {
    opacity: 0.68,
  },
  buttonText: {
    color: '#F4F0E6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
});
