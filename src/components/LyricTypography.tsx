import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { activeLyricIndex } from '../recognition/lrc';
import {
  currentCalibratedSongPositionMs,
  resolveLyricTiming,
} from '../recognition/lyricTiming';
import type { AudDCalibration } from '../recognition/syncDiagnostics/types';
import type { LyricResult, LyricTimingStatus, Track } from '../recognition/types';
import type { VisualState, VisualStyle } from '../style/types';

const IDLE_COPY = '曲を読み取ると、ここに実際の歌詞が表示されます。';
const INSTRUMENTAL_COPY = 'この曲は歌詞のない演奏です。';
const UNAVAILABLE_COPY = 'この曲の歌詞は見つかりませんでした';
const NO_MATCH_COPY = '曲を特定できませんでした。音がはっきり聞こえる場所でもう一度。';
const PALETTE_BY_STYLE: Record<VisualStyle, { primary: string; secondary: string; label: string }> = {
  ambient: { primary: '#F4F2E8', secondary: '#C9D4C4', label: '#B7C7AE' },
  jazz: { primary: '#FFF0D0', secondary: '#D7B78D', label: '#E2C18D' },
  pop: { primary: '#FFE7F4', secondary: '#FFB9D4', label: '#FFBFD8' },
  dance: { primary: '#E2FDFF', secondary: '#9DE8F1', label: '#AEEAF0' },
  rock: { primary: '#F3EEE7', secondary: '#D3BAB0', label: '#E0CBC3' },
};

interface LyricPresentation {
  label: string | null;
  track: Track | null;
  previous: string | null;
  primary: string;
  next: string | null;
}

function trackCaption(track: Track): string {
  return `${track.artist} — ${track.title}`;
}

function contiguousPlainPhrases(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const start = lines.findIndex(Boolean);

  if (start === -1) {
    return [];
  }

  const phrases: string[] = [];

  for (let index = start; index < lines.length && phrases.length < 3; index += 1) {
    const line = lines[index];

    if (!line) {
      break;
    }

    phrases.push(line);
  }

  return phrases;
}

function staticTimestampedPhrases(lines: readonly { text: string }[]): string[] {
  return lines
    .map((line) => line.text.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function presentationFor(
  result: LyricResult | null,
  timing: LyricTimingStatus,
  clockNow: number,
): LyricPresentation {
  if (!result) {
    return { label: null, track: null, previous: null, primary: IDLE_COPY, next: null };
  }

  switch (result.kind) {
    case 'timestamped': {
      if (timing.kind === 'calibrated') {
        const songPositionMs = currentCalibratedSongPositionMs(timing, clockNow);
        const activeIndex = Math.max(0, activeLyricIndex(result.lines, songPositionMs));
        const current = result.lines[activeIndex];

        if (current) {
          return {
            label: '同期歌詞',
            track: result.track,
            previous: result.lines[activeIndex - 1]?.text ?? null,
            primary: current.text,
            next: result.lines[activeIndex + 1]?.text ?? null,
          };
        }
      }

      const phrases = staticTimestampedPhrases(result.lines);
      return {
        label: '歌詞',
        track: result.track,
        previous: null,
        primary: phrases[0] ?? UNAVAILABLE_COPY,
        next: phrases.slice(1).join('\n') || null,
      };
    }
    case 'plain': {
      const phrases = contiguousPlainPhrases(result.text);

      return {
        label: null,
        track: result.track,
        previous: null,
        primary: phrases[0] ?? UNAVAILABLE_COPY,
        next: phrases.slice(1).join('\n') || null,
      };
    }
    case 'instrumental':
      return {
        label: 'INSTRUMENTAL',
        track: result.track,
        previous: null,
        primary: INSTRUMENTAL_COPY,
        next: null,
      };
    case 'lyrics_unavailable':
      return {
        label: 'LYRICS',
        track: result.track,
        previous: null,
        primary: UNAVAILABLE_COPY,
        next: null,
      };
    case 'not_recognized':
      return { label: null, track: null, previous: null, primary: NO_MATCH_COPY, next: null };
  }
}

export interface LyricTypographyProps {
  visual: VisualState;
  lyricResult: LyricResult | null;
  calibration?: AudDCalibration | null;
  reducedMotion?: boolean;
}

export function LyricTypography({
  visual,
  lyricResult,
  calibration = null,
  reducedMotion = false,
}: LyricTypographyProps) {
  const expression = useRef(new Animated.Value(visual.intensity)).current;
  const lyricEntrance = useRef(new Animated.Value(0)).current;
  const lyricDrift = useRef(new Animated.Value(0)).current;
  const trackEntrance = useRef(new Animated.Value(1)).current;
  const [clockNow, setClockNow] = useState(() => performance.now());
  const timing = useMemo<LyricTimingStatus>(() => (
    lyricResult?.kind === 'timestamped'
      ? resolveLyricTiming(lyricResult, calibration)
      : { kind: 'unverified' }
  ), [calibration, lyricResult]);

  useEffect(() => {
    if (reducedMotion) {
      expression.setValue(visual.intensity);
      return;
    }

    const animation = Animated.timing(expression, {
      toValue: visual.intensity,
      duration: 720,
      useNativeDriver: false,
    });

    animation.start();
    return () => animation.stop();
  }, [expression, reducedMotion, visual.intensity]);

  useEffect(() => {
    if (timing.kind !== 'calibrated') {
      return;
    }

    setClockNow(performance.now());
    const interval = setInterval(() => setClockNow(performance.now()), 250);

    return () => clearInterval(interval);
  }, [timing]);

  const presentation = useMemo(
    () => presentationFor(lyricResult, timing, clockNow),
    [clockNow, lyricResult, timing],
  );
  const palette = PALETTE_BY_STYLE[visual.style];
  const impact = visual.intensity > 0.68 || visual.motion > 0.76;
  const heroFontSize = Math.max(
    26,
    Math.min(58, (48 * visual.textScale) - Math.max(0, presentation.primary.length - 12) * 1.15),
  );
  const lyricWords = useMemo(
    () => presentation.primary.split(/(\s+)/).filter(Boolean),
    [presentation.primary],
  );

  useEffect(() => {
    if (reducedMotion) {
      lyricEntrance.setValue(1);
      lyricDrift.setValue(0);
      return;
    }

    lyricEntrance.setValue(0);
    lyricDrift.setValue(0);
    const entrance = Animated.spring(lyricEntrance, {
      toValue: 1,
      damping: 14,
      stiffness: 150,
      mass: 0.7,
      useNativeDriver: true,
    });
    const drift = Animated.timing(lyricDrift, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    entrance.start();
    drift.start();
    return () => {
      entrance.stop();
      drift.stop();
    };
  }, [lyricDrift, lyricEntrance, presentation.primary, reducedMotion]);

  useEffect(() => {
    if (!presentation.track || reducedMotion) {
      trackEntrance.setValue(1);
      return;
    }

    trackEntrance.setValue(0);
    const animation = Animated.spring(trackEntrance, {
      toValue: 1,
      damping: 16,
      stiffness: 170,
      mass: 0.7,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [presentation.track?.artist, presentation.track?.title, reducedMotion, trackEntrance]);
  const opacity = expression.interpolate({
    inputRange: [0, 1],
    outputRange: [0.58, 1],
  });
  const letterSpacing = expression.interpolate({
    inputRange: [0, 1],
    outputRange: [2.6, 0.8],
  });
  const scale = expression.interpolate({
    inputRange: [0, 1],
    outputRange: [visual.textScale * 0.94, visual.textScale],
  });
  const entranceScale = lyricEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] });
  const entranceY = lyricEntrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const driftX = lyricDrift.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] });
  const ghostOpacity = lyricEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] });
  const trackScale = trackEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const trackOpacity = trackEntrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={styles.root} testID="lyric-typography">
      {presentation.label ? (
        <Animated.Text style={[styles.label, { color: palette.label, opacity }]}>
          {presentation.label}
        </Animated.Text>
      ) : null}
      {presentation.track ? (
        <Animated.Text style={[styles.track, { color: palette.secondary, opacity: Animated.multiply(opacity, trackOpacity), transform: [{ scale: trackScale }] }]}>
          {trackCaption(presentation.track)}
        </Animated.Text>
      ) : null}
      {presentation.previous ? (
        <Animated.Text style={[styles.context, { color: palette.secondary, opacity }]}>
          {presentation.previous}
        </Animated.Text>
      ) : null}
      {!presentation.track ? <Animated.Text
        style={[
          styles.primary,
          {
            color: palette.primary,
            fontSize: Math.max(26, 44 * visual.textScale),
            letterSpacing,
            opacity,
            transform: [{ scale }],
          },
        ]}
        testID="lyric-primary"
      >
        {presentation.primary}
      </Animated.Text> : null}
      {presentation.next ? (
        <Animated.Text style={[styles.context, { color: palette.secondary, opacity }]}>
          {presentation.next}
        </Animated.Text>
      ) : null}
      {presentation.track ? <Animated.Text
        pointerEvents="none"
        style={[
          styles.ghost,
          { color: palette.primary, opacity: ghostOpacity, transform: [{ translateX: driftX }] },
        ]}
      >
        {presentation.primary.replace(/[^\s]/g, '—')}
      </Animated.Text> : null}
      {presentation.track ? <Animated.View
        pointerEvents="none"
        style={[
          styles.hero,
          {
            transform: [{ translateY: entranceY }, { scale: entranceScale }, { translateX: driftX }],
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.heroText,
            {
              color: palette.primary,
              fontSize: heroFontSize,
              lineHeight: heroFontSize * 1.12,
              letterSpacing,
              opacity,
              textShadowColor: palette.label,
              textShadowOffset: impact ? { width: 0, height: 0 } : undefined,
              textShadowRadius: impact ? 18 : 0,
            },
          ]}
          testID="lyric-hero"
        >
          {presentation.primary}
        </Animated.Text>
        <View style={[styles.rule, { backgroundColor: palette.label, width: impact ? 132 : 72 }]} />
      </Animated.View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
    gap: 10,
    position: 'relative',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.8,
  },
  track: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  context: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    maxWidth: '100%',
    opacity: 0.76,
  },
  primary: {
    fontWeight: '800',
    lineHeight: 52,
    maxWidth: '100%',
  },
  hero: {
    alignItems: 'flex-start',
    marginTop: 22,
    maxWidth: '100%',
  },
  heroText: {
    fontWeight: '900',
    lineHeight: 62,
    maxWidth: '100%',
    textTransform: 'uppercase',
  },
  rule: {
    height: 2,
    marginTop: 12,
    opacity: 0.82,
    width: 72,
  },
  ghost: {
    fontSize: 72,
    fontWeight: '900',
    left: -8,
    lineHeight: 78,
    maxWidth: '112%',
    position: 'absolute',
    top: 28,
    transform: [{ skewX: '-12deg' }],
  },
});
