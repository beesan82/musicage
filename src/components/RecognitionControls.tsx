import { StyleSheet, Text, View } from 'react-native';

import type { RecognitionViewState } from '../recognition/types';
import { DEFAULT_CHROME_THEME, chromeFont } from '../theme/chrome';
import type { ChromeTheme } from '../theme/chrome';
import { ChromeButton } from './ChromeButton';

export interface RecognitionControlsProps {
  state: RecognitionViewState;
  onRecognize(): void;
  onCancel(): void;
  onOpenSettings(): void;
  theme?: ChromeTheme;
}

export function RecognitionControls({
  state,
  onRecognize,
  onCancel,
  onOpenSettings,
  theme = DEFAULT_CHROME_THEME,
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
      {state.message ? (
        <Text style={[styles.message, chromeFont(theme, 'regular'), { color: theme.inkMuted }]}>
          {state.message}
        </Text>
      ) : null}
      <View style={styles.row}>
        <ChromeButton
          disabled={disabled}
          label={label}
          onPress={onPress}
          primary
          testID="recognize-button"
          theme={theme}
        />
        <ChromeButton label="設定" onPress={onOpenSettings} testID="settings-button" theme={theme} />
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
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 300,
  },
});
