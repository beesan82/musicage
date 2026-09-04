import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { activeLyricIndex } from '../recognition/lrc';
import type { LyricResult, Track } from '../recognition/types';
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

function presentationFor(result: LyricResult | null, clockNow: number): LyricPresentation {
  if (!result) {
    return { label: null, track: null, previous: null, primary: IDLE_COPY, next: null };
  }

  switch (result.kind) {
    case 'synced': {
      const positionMs = result.positionAtCaptureMs + (clockNow - result.captureStartedMonotonicMs);
      const activeIndex = Math.max(0, activeLyricIndex(result.lines, positionMs));
      const current = result.lines[activeIndex];

      if (!current) {
        return {
          label: null,
          track: result.track,
          previous: null,
          primary: UNAVAILABLE_COPY,
          next: null,
        };
      }

      return {
        label: '同期歌詞',
        track: result.track,
        previous: result.lines[activeIndex - 1]?.text ?? null,
        primary: current.text,
        next: result.lines[activeIndex + 1]?.text ?? null,
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
  reducedMotion?: boolean;
}

export function LyricTypography({
  visual,
  lyricResult,
  reducedMotion = false,
}: LyricTypographyProps) {
  const expression = useRef(new Animated.Value(visual.intensity)).current;
  const [clockNow, setClockNow] = useState(() => performance.now());
  const syncCaptureStart = lyricResult?.kind === 'synced'
    ? lyricResult.captureStartedMonotonicMs
    : null;

  useEffect(() => {
    if (syncCaptureStart === null) {
      return;
    }

    setClockNow(performance.now());
    const interval = setInterval(() => setClockNow(performance.now()), 250);

    return () => clearInterval(interval);
  }, [syncCaptureStart]);

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

  const presentation = useMemo(
    () => presentationFor(lyricResult, clockNow),
    [clockNow, lyricResult],
  );
  const palette = PALETTE_BY_STYLE[visual.style];
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

  return (
    <View pointerEvents="none" style={styles.root} testID="lyric-typography">
      {presentation.label ? (
        <Animated.Text style={[styles.label, { color: palette.label, opacity }]}>
          {presentation.label}
        </Animated.Text>
      ) : null}
      {presentation.track ? (
        <Animated.Text style={[styles.track, { color: palette.secondary, opacity }]}>
          {trackCaption(presentation.track)}
        </Animated.Text>
      ) : null}
      {presentation.previous ? (
        <Animated.Text style={[styles.context, { color: palette.secondary, opacity }]}>
          {presentation.previous}
        </Animated.Text>
      ) : null}
      <Animated.Text
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
      </Animated.Text>
      {presentation.next ? (
        <Animated.Text style={[styles.context, { color: palette.secondary, opacity }]}>
          {presentation.next}
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
    gap: 10,
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
});
