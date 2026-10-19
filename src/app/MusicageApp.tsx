import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMicrophoneAnalysis } from '../audio/useMicrophoneAnalysis';
import type { ListeningStatus } from '../audio/useMicrophoneAnalysis';
import { ListeningControls } from '../components/ListeningControls';
import { RecognitionControls } from '../components/RecognitionControls';
import { FixtureControl } from '../dev/fixture/FixtureControl';
import { useFixturePlayback } from '../dev/fixture/useFixturePlayback';
import { DEFAULT_PALETTE } from '../direction/types';
import { useBurnInDrift } from '../display/useBurnInDrift';
import { useKeepScreenOn } from '../display/useKeepScreenOn';
import type { RecognitionViewState } from '../recognition/types';
import { LyricStage } from '../typesetting/LyricStage';
import { useStageSource } from './useStageSource';

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

const noop = () => {};

// Recognition is unwired until the native recognizer lands; the controls show
// it as unavailable.
const RECOGNITION_UNAVAILABLE: RecognitionViewState = {
  phase: 'unavailable',
  result: null,
  message: null,
  retryable: false,
};

export function MusicageApp({ reducedMotion = false }: MusicageAppProps) {
  const microphone = useMicrophoneAnalysis();
  // Tapping the empty stage hides the bottom controls so the object can sit
  // next to a record with nothing but the picture and the words.
  const [controlsVisible, setControlsVisible] = useState(true);
  const playback = useFixturePlayback();
  const stage = useStageSource({
    ear: microphone.ear,
    status: microphone.status,
    playback,
    result: null,
  });
  // Always-on object manners: no sleep while listening, and a slow wander of
  // the text layer so an OLED does not burn the stage and wordmark in.
  useKeepScreenOn(microphone.status === 'listening');
  const drift = useBurnInDrift(reducedMotion);

  useEffect(() => {
    void microphone.start();
  }, [microphone.start]);

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
              {statusLabel(microphone.status)}
            </Text>
          </View>
          <View pointerEvents="box-none" style={styles.content}>
            <View
              pointerEvents={controlsVisible ? 'auto' : 'none'}
              style={[styles.controlsStack, controlsVisible ? null : styles.controlsHidden]}
              testID="controls-stack"
            >
              <RecognitionControls
                onCancel={noop}
                onOpenSettings={noop}
                onRecognize={noop}
                state={RECOGNITION_UNAVAILABLE}
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
