import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseGroundTruthInput } from '../recognition/syncDiagnostics/observationInput';
import type { ClipDurationMs, GroundTruth } from '../recognition/syncDiagnostics/types';
import type { SyncDiagnosticsController } from '../recognition/syncDiagnostics/useSyncDiagnostics';
import type { PendingDiagnosticTrial, RecognitionRequest } from '../recognition/types';

const DURATIONS: readonly ClipDurationMs[] = [3_000, 5_000, 7_000, 12_000];

export interface SyncDiagnosticsContentProps {
  diagnostics: SyncDiagnosticsController;
  pendingTrial: PendingDiagnosticTrial | null;
  onRunTrial(request: RecognitionRequest): void;
  onClose(): void;
}

export function SyncDiagnosticsContent({ diagnostics, pendingTrial, onRunTrial, onClose }: SyncDiagnosticsContentProps) {
  const [duration, setDuration] = useState<ClipDurationMs>(5_000);
  const [position, setPosition] = useState('');
  const [precision, setPrecision] = useState('');
  const [method] = useState<GroundTruth['method']>('video-timed-controlled-playback');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const observation = pendingTrial && parseGroundTruthInput(position, precision, method);
    if (!pendingTrial || !observation) {
      setError('再生位置はMM:SS.mmm、精度は0以上のミリ秒で入力してください。');
      return;
    }
    setError(null);
    await diagnostics.saveTrial(pendingTrial.sample, observation);
  };

  return <View style={styles.content}>
    {diagnostics.captureFlashVisible ? <View style={styles.flash} testID="diagnostic-capture-flash" /> : null}
    <Text style={styles.title}>同期診断</Text>
    <Text style={styles.copy}>動画の再生位置と録音開始フラッシュを照合して保存します。</Text>
    <View style={styles.row}>{DURATIONS.map((value) => <Pressable key={value} accessibilityLabel={`${value / 1_000}秒`} accessibilityRole="button" onPress={() => setDuration(value)} style={styles.choice}><Text>{value / 1_000}秒</Text></Pressable>)}</View>
    <Pressable accessibilityLabel="診断用に読み取る" accessibilityRole="button" onPress={() => onRunTrial({ mode: 'diagnostic', clipDurationMs: duration, onCaptureStarted: diagnostics.notifyCaptureStarted })} style={styles.primary}><Text>診断用に読み取る</Text></Pressable>
    {pendingTrial ? <View><Text>{pendingTrial.sample.audd.title && pendingTrial.sample.audd.artist ? `${pendingTrial.sample.audd.artist} — ${pendingTrial.sample.audd.title}` : '曲を特定できませんでした'}</Text><Text>AudD時刻: {pendingTrial.sample.audd.timecodeRaw ?? 'なし'}</Text><Text>録音: {pendingTrial.sample.capture.requestedDurationMs / 1_000}秒</Text></View> : null}
    <TextInput accessibilityLabel="再生位置" onChangeText={setPosition} placeholder="01:23.450" style={styles.input} value={position} />
    <TextInput accessibilityLabel="観測精度（ms）" keyboardType="number-pad" onChangeText={setPrecision} placeholder="80" style={styles.input} value={precision} />
    {error ? <Text>{error}</Text> : null}
    <Pressable accessibilityLabel="この測定を保存" accessibilityRole="button" onPress={() => void save()} style={styles.primary}><Text>この測定を保存</Text></Pressable>
    <Pressable accessibilityLabel="閉じる" accessibilityRole="button" onPress={onClose}><Text>閉じる</Text></Pressable>
  </View>;
}

export interface SyncDiagnosticsSheetProps extends SyncDiagnosticsContentProps { visible: boolean }

export function SyncDiagnosticsSheet({ visible, ...props }: SyncDiagnosticsSheetProps) {
  return <Modal animationType="slide" onRequestClose={props.onClose} transparent visible={visible}><View style={styles.backdrop}><SyncDiagnosticsContent {...props} /></View></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(5,6,7,0.72)', flex: 1, justifyContent: 'flex-end' }, content: { backgroundColor: '#171A19', gap: 12, padding: 24 }, flash: { ...StyleSheet.absoluteFill, backgroundColor: '#fff', opacity: 0.92 }, title: { color: '#F5F0E5', fontSize: 24, fontWeight: '800' }, copy: { color: '#C7C8BD' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { backgroundColor: '#E3E0D6', borderRadius: 10, padding: 10 }, primary: { alignItems: 'center', backgroundColor: '#E7DEC8', borderRadius: 12, minHeight: 46, justifyContent: 'center' }, input: { backgroundColor: '#fff', borderRadius: 10, minHeight: 44, paddingHorizontal: 12 },
});
