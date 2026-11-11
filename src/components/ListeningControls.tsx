import { StyleSheet, Text, View } from 'react-native';

import type { ListeningStatus } from '../audio/useMicrophoneAnalysis';
import { DEFAULT_CHROME_THEME, chromeFont } from '../theme/chrome';
import type { ChromeTheme } from '../theme/chrome';
import { ChromeButton } from './ChromeButton';

interface ListeningControlsProps {
  status: ListeningStatus;
  errorMessage: string | null;
  onRetry(): void;
  onStop(): void;
  onStart(): void;
  theme?: ChromeTheme;
}

const DENIED_COPY = 'マイクを許可すると、音に反応する映像が動きます。';

export function ListeningControls({
  status,
  errorMessage,
  onRetry,
  onStop,
  onStart,
  theme = DEFAULT_CHROME_THEME,
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
  const messageStyle = [styles.message, chromeFont(theme, 'regular'), { color: theme.inkMuted }];

  return (
    <View style={styles.root} testID="listening-controls">
      {isDenied ? <Text style={messageStyle}>{DENIED_COPY}</Text> : null}
      {status === 'error' && errorMessage ? <Text style={messageStyle}>{errorMessage}</Text> : null}
      <ChromeButton
        disabled={isRequesting}
        label={accessibleLabel}
        onPress={onPress}
        testID="microphone-button"
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
    gap: 10,
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 280,
  },
});
