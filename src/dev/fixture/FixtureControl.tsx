import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useFrameRate } from '../useFrameRate';
import { fixturePositionMs } from './useFixturePlayback';
import type { FixturePlayback } from './useFixturePlayback';

interface FixtureControlProps {
  playback: FixturePlayback;
}

const REFRESH_MS = 250;
const SEEK_MS = 5_000;

function formatPosition(positionMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(positionMs / 1_000));
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${Math.floor(totalSeconds / 60)}:${seconds}`;
}

/**
 * Development pill (top-right, below the scene lock) that drives the fictional
 * fixture song: tap = play/pause, long press = on/off, side buttons seek ±5 s.
 * Renders nothing outside development builds.
 */
export function FixtureControl({ playback }: FixtureControlProps) {
  const fps = useFrameRate(playback.enabled);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!playback.enabled || !playback.active) return undefined;
    setNow(performance.now());
    const id = setInterval(() => setNow(performance.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, [playback.enabled, playback.active]);

  if (!playback.enabled) {
    return null;
  }

  const state = !playback.active
    ? 'FIX OFF'
    : `FIX ${playback.paused ? '❚❚' : '▶'} ${formatPosition(fixturePositionMs(playback, now))}`;
  const label = fps === null ? state : `${state} · ${fps}`;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel="フィクスチャを5秒戻す"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => playback.seek(-SEEK_MS)}
        style={styles.pill}
        testID="fixture-seek-back"
      >
        <Text style={styles.label}>−5s</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="フィクスチャ曲を再生"
        accessibilityRole="button"
        hitSlop={8}
        onLongPress={playback.toggle}
        onPress={playback.active ? playback.playPause : playback.toggle}
        style={({ pressed }) => [
          styles.pill,
          playback.active ? styles.pillActive : null,
          pressed ? styles.pillPressed : null,
        ]}
        testID="fixture-control"
      >
        <Text style={[styles.label, playback.active ? styles.labelActive : null]}>{label}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="フィクスチャを5秒進める"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => playback.seek(SEEK_MS)}
        style={styles.pill}
        testID="fixture-seek-forward"
      >
        <Text style={styles.label}>+5s</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    right: 20,
    top: 72,
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    borderColor: 'rgba(169, 170, 164, 0.35)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(16, 17, 18, 0.35)',
  },
  pillActive: {
    borderColor: 'rgba(244, 240, 230, 0.6)',
    backgroundColor: 'rgba(16, 17, 18, 0.6)',
  },
  pillPressed: {
    opacity: 0.6,
  },
  label: {
    color: 'rgba(169, 170, 164, 0.7)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  labelActive: {
    color: '#F4F0E6',
  },
});
