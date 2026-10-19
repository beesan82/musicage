import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import type { ListeningStatus } from '../audio/useMicrophoneAnalysis';
import { AudDTokenSheet } from '../components/AudDTokenSheet';
import { ListeningControls } from '../components/ListeningControls';
import { RecognitionControls } from '../components/RecognitionControls';
import { SyncDiagnosticsSheet } from '../components/SyncDiagnosticsSheet';
import { FixtureControl } from '../dev/fixture/FixtureControl';
import { useFixturePlayback } from '../dev/fixture/useFixturePlayback';
import { DEFAULT_PALETTE } from '../direction/types';
import { useBurnInDrift } from '../display/useBurnInDrift';
import { useKeepScreenOn } from '../display/useKeepScreenOn';
import { clearAudDToken, saveAudDToken } from '../recognition/tokenStore';
import { useSyncDiagnostics } from '../recognition/syncDiagnostics/useSyncDiagnostics';
import type { RecognitionPhase, RecognitionRequest } from '../recognition/types';
import { useSongRecognition } from '../recognition/useSongRecognition';
import { LyricStage } from '../typesetting/LyricStage';
import { useStageSource } from './useStageSource';

interface MusicageAppProps {
  reducedMotion?: boolean;
}

/**
 * While a recognition pass is running the local meter is paused, so the
 * corner status says what the app is doing instead of going quiet.
 */
function recognitionLabel(phase: RecognitionPhase): string | null {
  switch (phase) {
    case 'capturing':
      return 'CAPTURING';
    case 'identifying':
      return 'IDENTIFYING';
    case 'resolving_lyrics':
      return 'LYRICS';
    default:
      return null;
  }
}

function statusLabel(status: ListeningStatus, phase: RecognitionPhase): string {
  const recognition = recognitionLabel(phase);
  if (recognition) {
    return recognition;
  }

  switch (status) {
    case 'listening':
      return 'LISTENING';
    case 'denied':
      return 'MIC OFF';
    case 'error':
      return 'MIC ERROR';
    default:
      return 'IDLE';
  }
}

export function MusicageApp({ reducedMotion = false }: MusicageAppProps) {
  const microphone = useMicrophoneAnalysis();
  const {
    hasToken,
    recognize,
    refreshTokenPresence,
    retry: retryRecognition,
    state: recognitionState,
    pendingDiagnosticTrial,
  } = useSongRecognition({
    pauseForRecognition: microphone.pauseForRecognition,
    resumeAfterRecognition: microphone.resumeAfterRecognition,
  });
  const diagnostics = useSyncDiagnostics();
  const [tokenSheetVisible, setTokenSheetVisible] = useState(false);
  const [diagnosticsSheetVisible, setDiagnosticsSheetVisible] = useState(false);
  // Tapping the empty stage hides the bottom controls so the object can sit
  // next to a record with nothing but the picture and the words.
  const [controlsVisible, setControlsVisible] = useState(true);
  const playback = useFixturePlayback();
  const stage = useStageSource({
    ear: microphone.ear,
    status: microphone.status,
    playback,
    result: recognitionState.result,
  });
  // Always-on object manners: no sleep while listening, and a slow wander of
  // the text layer so an OLED does not burn the stage and wordmark in.
  useKeepScreenOn(microphone.status === 'listening');
  const drift = useBurnInDrift(reducedMotion);

  useEffect(() => {
    void microphone.start();
  }, [microphone.start]);

  const saveToken = useCallback(async (token: string) => {
    await saveAudDToken(token);
    await refreshTokenPresence();
    setTokenSheetVisible(false);
  }, [refreshTokenPresence]);

  const clearToken = useCallback(async () => {
    await clearAudDToken();
    await refreshTokenPresence();
    setTokenSheetVisible(false);
  }, [refreshTokenPresence]);

  const readNormally = useCallback(() => {
    void recognize({
      mode: 'normal',
      clipDurationMs: diagnostics.approvedCalibration?.clipDurationMs ?? 12_000,
    });
  }, [diagnostics.approvedCalibration?.clipDurationMs, recognize]);

  const openDiagnostics = useCallback(() => {
    setTokenSheetVisible(false);
    setDiagnosticsSheetVisible(true);
  }, []);

  const runDiagnosticTrial = useCallback((request: RecognitionRequest) => {
    void recognize(request);
  }, [recognize]);

  return (
    <View style={styles.root} testID="musicage-root">
      <Pressable
        accessibilityLabel={controlsVisible ? '操作を隠す' : '操作を表示'}
        accessibilityRole="button"
        onPress={() => setControlsVisible((visible) => !visible)}
        style={styles.fill}
        testID="immersive-toggle"
      />
      <Animated.View
        pointerEvents="box-none"
        style={[styles.fill, drift]}
        testID="text-layer"
      >
        {/* Full-screen and untouchable: taps on the empty stage reach the toggle below. */}
        <View pointerEvents="none" style={styles.fill}>
          <LyricStage
            beat={stage.beat}
            nowMonotonicMs={stage.nowMonotonicMs}
            reducedMotion={reducedMotion}
            source={stage.source}
          />
        </View>
        <SafeAreaView pointerEvents="box-none" style={styles.safeArea}>
          <View pointerEvents="none" style={styles.wordmarkRow}>
            <Text style={styles.wordmark}>MUSICAGE</Text>
            <Text style={styles.status}>
              {statusLabel(microphone.status, recognitionState.phase)}
            </Text>
          </View>
          <View pointerEvents="box-none" style={styles.content}>
            <View
              pointerEvents={controlsVisible ? 'auto' : 'none'}
              style={[styles.controlsStack, controlsVisible ? null : styles.controlsHidden]}
              testID="controls-stack"
            >
              <RecognitionControls
                onOpenSettings={() => setTokenSheetVisible(true)}
                onRecognize={readNormally}
                onRetry={retryRecognition}
                state={recognitionState}
              />
              <ListeningControls
                errorMessage={microphone.errorMessage}
                onRetry={microphone.retry}
                onStart={microphone.start}
                onStop={microphone.stop}
                status={microphone.status}
              />
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
      <SafeAreaView pointerEvents="box-none" style={styles.fill}>
        <FixtureControl playback={playback} />
      </SafeAreaView>
      <AudDTokenSheet
        hasToken={hasToken}
        onClear={clearToken}
        onClose={() => setTokenSheetVisible(false)}
        onOpenDiagnostics={openDiagnostics}
        onSave={saveToken}
        visible={tokenSheetVisible}
      />
      <SyncDiagnosticsSheet
        diagnostics={diagnostics}
        onClose={() => setDiagnosticsSheetVisible(false)}
        onRunTrial={runDiagnosticTrial}
        pendingTrial={pendingDiagnosticTrial}
        visible={diagnosticsSheetVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DEFAULT_PALETTE.background,
  },
  fill: {
    ...StyleSheet.absoluteFill,
  },
  safeArea: {
    flex: 1,
  },
  wordmarkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  wordmark: {
    color: '#F4F0E6',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
  },
  status: {
    color: '#A9AAA4',
    fontSize: 10,
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 18,
    paddingHorizontal: 24,
  },
  controlsStack: {
    alignItems: 'flex-start',
    gap: 16,
  },
  controlsHidden: {
    opacity: 0,
  },
});
