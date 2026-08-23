import { StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import type { ListeningStatus } from '../audio/useMicrophoneAnalysis';
import { ListeningControls } from '../components/ListeningControls';
import { LyricTypography } from '../components/LyricTypography';
import { SceneRenderer } from '../scenes/SceneRenderer';
import { createInitialVisualState, selectVisualState } from '../style/styleEngine';
import type { VisualState } from '../style/types';

interface MusicageAppProps {
  reducedMotion?: boolean;
}

function statusLabel(status: ListeningStatus): string {
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
  const visualRef = useRef<VisualState>(createInitialVisualState(0));
  const visual = useMemo(() => {
    const nowMs = Date.now();

    if (microphone.status === 'denied' || microphone.status === 'error') {
      return createInitialVisualState(nowMs);
    }

    return selectVisualState(microphone.features, visualRef.current, nowMs);
  }, [microphone.features, microphone.status]);

  visualRef.current = visual;

  useEffect(() => {
    void microphone.start();
  }, [microphone.start]);

  return (
    <View style={styles.root} testID="musicage-root">
      <View pointerEvents="none" style={styles.sceneLayer}>
        <SceneRenderer reducedMotion={reducedMotion} visual={visual} />
      </View>
      <View pointerEvents="none" style={styles.scrim} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmark}>MUSICAGE</Text>
          <Text style={styles.status}>{statusLabel(microphone.status)}</Text>
        </View>
        <View style={styles.content}>
          <View pointerEvents="none" style={styles.copyRegion}>
            <LyricTypography reducedMotion={reducedMotion} visual={visual} />
          </View>
          <ListeningControls
            errorMessage={microphone.errorMessage}
            onRetry={microphone.retry}
            onStart={microphone.start}
            onStop={microphone.stop}
            status={microphone.status}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#101112',
  },
  sceneLayer: {
    ...StyleSheet.absoluteFill,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0B0C0C',
    opacity: 0.2,
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
    justifyContent: 'space-between',
    paddingBottom: 18,
    paddingHorizontal: 24,
  },
  copyRegion: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 96,
  },
});
