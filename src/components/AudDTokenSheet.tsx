import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export interface AudDTokenSheetProps {
  visible: boolean;
  hasToken: boolean;
  onSave(token: string): Promise<void>;
  onClear(): Promise<void>;
  onOpenDiagnostics(): void;
  onClose(): void;
}

const SAVE_ERROR_MESSAGE = 'トークンを保存できませんでした。';

export function AudDTokenSheet({
  visible,
  hasToken,
  onSave,
  onClear,
  onOpenDiagnostics,
  onClose,
}: AudDTokenSheetProps) {
  const [draft, setDraft] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setDraft('');
      setErrorMessage(null);
      setIsSaving(false);
    }
  }, [visible]);

  const saveToken = async () => {
    const token = draft.trim();

    if (!token || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await onSave(token);
      setDraft('');
      onClose();
    } catch {
      setErrorMessage(SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  };

  const clearToken = async () => {
    if (!hasToken || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await onClear();
      setDraft('');
      onClose();
    } catch {
      setErrorMessage(SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <Text style={styles.eyebrow}>PRIVATE SETUP</Text>
          <Text style={styles.title}>AudDキーを設定</Text>
          <Text style={styles.body}>
            曲を読み取るときだけ、最大12秒の音をAudDへ直接送信します。
          </Text>
          <Text style={styles.storageState}>
            {hasToken
              ? 'このiPhoneにトークンを保存済みです。'
              : 'AudDのトークンを入力してください。'}
          </Text>
          <TextInput
            accessibilityLabel="AudD APIトークン"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setDraft}
            placeholder="AudD APIトークン"
            placeholderTextColor="#7D827B"
            secureTextEntry
            style={styles.input}
            value={draft}
          />
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel="保存する"
              accessibilityRole="button"
              disabled={!draft.trim() || isSaving}
              onPress={saveToken}
              style={({ pressed }) => [
                styles.saveButton,
                (!draft.trim() || isSaving) && styles.buttonDisabled,
                pressed && !isSaving && styles.buttonPressed,
              ]}
            >
              <Text style={styles.saveButtonText}>{isSaving ? '保存中…' : '保存する'}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="削除する"
              accessibilityRole="button"
              disabled={!hasToken || isSaving}
              onPress={clearToken}
              style={({ pressed }) => [
                styles.removeButton,
                (!hasToken || isSaving) && styles.buttonDisabled,
                pressed && !isSaving && styles.buttonPressed,
              ]}
            >
              <Text style={styles.removeButtonText}>削除する</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel="同期診断"
            accessibilityRole="button"
            onPress={onOpenDiagnostics}
            style={styles.diagnosticsButton}
          >
            <Text style={styles.diagnosticsButtonText}>同期診断</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="閉じる"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>閉じる</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(5, 6, 7, 0.72)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#171A19',
    borderColor: 'rgba(230, 225, 208, 0.16)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    gap: 14,
    paddingBottom: 34,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  eyebrow: {
    color: '#B7BCA5',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  title: {
    color: '#F5F0E5',
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  body: {
    color: '#C7C8BD',
    fontSize: 13,
    lineHeight: 21,
  },
  storageState: {
    color: '#9FA59B',
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#0D0F0F',
    borderColor: '#4F554E',
    borderRadius: 14,
    borderWidth: 1,
    color: '#F5F0E5',
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  error: {
    color: '#F2A99B',
    fontSize: 13,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#E7DEC8',
    borderRadius: 15,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  removeButton: {
    alignItems: 'center',
    borderColor: '#62675F',
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#151716',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  removeButtonText: {
    color: '#E3E0D6',
    fontSize: 13,
    fontWeight: '700',
  },
  diagnosticsButton: {
    alignItems: 'center',
    borderColor: '#62675F',
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  diagnosticsButtonText: {
    color: '#B7BCA5',
    fontSize: 13,
    fontWeight: '700',
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  closeButtonText: {
    color: '#B7BCA5',
    fontSize: 13,
    fontWeight: '700',
  },
});
