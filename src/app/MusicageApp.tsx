import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ListeningStatus } from '../audio/types';
import { useEar } from '../audio/useEar';
import { ListeningControls } from '../components/ListeningControls';
import { RecognitionControls } from '../components/RecognitionControls';
import { SettingsSheet } from '../components/SettingsSheet';
import { FixtureControl } from '../dev/fixture/FixtureControl';
import { useFixturePlayback } from '../dev/fixture/useFixturePlayback';
import { DEFAULT_PALETTE } from '../direction/types';
import { useBurnInDrift } from '../display/useBurnInDrift';
import { useKeepScreenOn } from '../display/useKeepScreenOn';
import { createAutoRecognitionTrigger } from '../recognition/autoRecognition';
import type { RecognitionPhase } from '../recognition/types';
import { useEarRecognition } from '../recognition/useEarRecognition';
import { useSettings } from '../settings/useSettings';
import { chromeFont, chromeTheme, withAlpha } from '../theme/chrome';
import type { ChromeFonts, ChromeTheme } from '../theme/chrome';
import { LyricStage } from '../typesetting/LyricStage';
import { useStageSource } from './useStageSource';

interface MusicageAppProps {
  reducedMotion?: boolean;
  /** The bundled gothic once `App` has loaded it; the system font until then. */
  chromeFonts?: ChromeFonts;
}

const NO_FONTS: ChromeFonts = {};

type StatusMark = 'hollow' | 'filled' | 'ringed';

/** Idle (and a stopped or failed mic) is hollow, listening is filled, a match in progress is ringed. */
function statusMark(status: ListeningStatus, phase: RecognitionPhase): StatusMark {
  if (phase === 'listening' || phase === 'resolving_lyrics') return 'ringed';
  return status === 'listening' ? 'filled' : 'hollow';
}

/** A still 6px dot in the spot colour. It never blinks. */
function StatusDot({ mark, theme }: { mark: StatusMark; theme: ChromeTheme }) {
  return (
    <View
      style={[styles.statusRing, mark === 'ringed' ? { borderColor: theme.accent } : null]}
      testID={`status-dot-${mark}`}
    >
      <View
        style={[
          styles.statusDot,
          mark === 'hollow'
            ? { borderColor: theme.accent, borderWidth: 1 }
            : { backgroundColor: theme.accent },
        ]}
      />
    </View>
  );
}

function statusLabel(status: ListeningStatus, phase: RecognitionPhase): string {
  if (phase === 'listening') return 'MATCHING';
  if (phase === 'resolving_lyrics') return 'LYRICS';
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

export function MusicageApp({ reducedMotion = false, chromeFonts = NO_FONTS }: MusicageAppProps) {
  const ear = useEar();
  const recognition = useEarRecognition(ear.recognizer, ear.status);
  const { settings, ready, update } = useSettings();
  // Tapping the empty stage hides the bottom controls so the object can sit
  // next to a record with nothing but the picture and the words.
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const playback = useFixturePlayback();
  const { phase, result } = recognition.state;
  const stage = useStageSource({
    earStream: ear.earStream,
    status: ear.status,
    playback,
    result,
  });
  // Always-on object manners: no sleep while listening, and a slow wander of
  // the text layer so an OLED does not burn the stage and wordmark in.
  useKeepScreenOn(ear.status === 'listening');
  const drift = useBurnInDrift(reducedMotion);
  // The chrome is printed in the stage's palette. Keyed on the colours, not
  // the palette object, so it is rebuilt only when the song's colours change.
  const palette = stage.source.direction?.palette ?? DEFAULT_PALETTE;
  const { background, ink, accent } = palette;
  const theme = useMemo(
    () => chromeTheme({ background, ink, accent }, chromeFonts),
    [background, ink, accent, chromeFonts],
  );

  useEffect(() => {
    void ear.start();
  }, [ear.start]);

  // Automatic re-recognition: sound returning after silence, or the song's
  // clock running past its outro, asks ShazamKit again. The beat is published
  // at most every 60 ms (and on pulse heads), so this runs at that rate, not
  // per audio frame. Only a listening native ear can be matched.
  const triggerRef = useRef(createAutoRecognitionTrigger());
  const autoInputRef = useRef({ recognition, settings, ready, ear, result, phase });
  autoInputRef.current = { recognition, settings, ready, ear, result, phase };
  useEffect(() => {
    const { recognition: current, settings: s, ready: loaded, ear: e, result: r, phase: p } =
      autoInputRef.current;
    const fire = triggerRef.current.push({
      nowMs: performance.now(),
      silence: stage.beat.silence,
      pastOutro: stage.pastOutro,
      hasResult: r !== null && r.kind !== 'not_recognized',
      recognizing: p === 'listening' || p === 'resolving_lyrics',
      // The default (on) must not fire before a stored "off" has loaded.
      enabled: loaded && s.autoRecognize && e.kind === 'native' && e.status === 'listening',
    });
    if (fire) current.recognize();
  }, [stage.beat, stage.pastOutro]);

  // An update before the stored settings load would be overwritten by them.
  const toggleAutoRecognize = useCallback(
    (next: boolean) => {
      if (!ready) return;
      void update({ autoRecognize: next });
    },
    [ready, update],
  );

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
            beatValues={stage.beatValues}
            nowMonotonicMs={stage.nowMonotonicMs}
            reducedMotion={reducedMotion}
            source={stage.source}
          />
        </View>
        <SafeAreaView pointerEvents="box-none" style={styles.safeArea}>
          <View pointerEvents="none" style={styles.wordmarkRow}>
            <Text
              style={[styles.wordmark, chromeFont(theme, 'bold'), { color: withAlpha(theme.ink, 0.85) }]}
              testID="wordmark"
            >
              MUSICAGE
            </Text>
            <View style={styles.statusGroup}>
              <StatusDot mark={statusMark(ear.status, phase)} theme={theme} />
              <Text style={[styles.status, chromeFont(theme, 'regular'), { color: theme.inkMuted }]}>
                {statusLabel(ear.status, phase)}
              </Text>
            </View>
          </View>
          <View pointerEvents="box-none" style={styles.content}>
            <View
              pointerEvents={controlsVisible ? 'auto' : 'none'}
              style={[styles.controlsStack, controlsVisible ? null : styles.controlsHidden]}
              testID="controls-stack"
            >
              <RecognitionControls
                onCancel={recognition.cancel}
                onOpenSettings={() => setSettingsVisible(true)}
                onRecognize={recognition.recognize}
                state={recognition.state}
                theme={theme}
              />
              <ListeningControls
                errorMessage={ear.errorMessage}
                onRetry={ear.retry}
                onStart={ear.start}
                onStop={ear.stop}
                status={ear.status}
                theme={theme}
              />
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
      <SafeAreaView pointerEvents="box-none" style={styles.fill}>
        <FixtureControl playback={playback} theme={theme} />
      </SafeAreaView>
      <SettingsSheet
        onClose={() => setSettingsVisible(false)}
        onToggleAutoRecognize={toggleAutoRecognize}
        settings={settings}
        theme={theme}
        visible={settingsVisible}
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
    fontSize: 12,
    letterSpacing: 5,
  },
  statusGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  // A fixed 10px box, so the word does not shift when the ring appears.
  statusRing: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    justifyContent: 'center',
    width: 10,
  },
  statusDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  status: {
    fontSize: 10,
    letterSpacing: 2.5,
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
