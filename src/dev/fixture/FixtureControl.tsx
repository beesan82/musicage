import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { paletteFamilyKeyFor } from '../../direction/palettes';
import { DEFAULT_CHROME_THEME } from '../../theme/chrome';
import type { ChromeTheme } from '../../theme/chrome';
import { useFrameRate } from '../useFrameRate';
import { fixturePositionMs } from './useFixturePlayback';
import type { FixturePlayback } from './useFixturePlayback';

interface FixtureControlProps {
  playback: FixturePlayback;
  theme?: ChromeTheme;
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
 * fixture song: tap = play/pause, long press = on/off, side buttons seek ±5 s,
 * RELOAD re-validates the fixture direction, and PAL cycles its colour family.
 * Renders nothing outside development builds.
 */
export function FixtureControl({ playback, theme = DEFAULT_CHROME_THEME }: FixtureControlProps) {
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
  // Colours only (stage F): the pills keep the system font.
  const pill = [styles.pill, { borderColor: theme.border, backgroundColor: theme.scrim }];
  const pillActive = { borderColor: theme.inkMuted };
  const text = [styles.label, { color: theme.inkMuted }];

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel="フィクスチャを5秒戻す"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => playback.seek(-SEEK_MS)}
        style={pill}
        testID="fixture-seek-back"
      >
        <Text style={text}>−5s</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="フィクスチャ曲を再生"
        accessibilityRole="button"
        hitSlop={8}
        onLongPress={playback.toggle}
        onPress={playback.active ? playback.playPause : playback.toggle}
        style={({ pressed }) => [
          pill,
          playback.active ? pillActive : null,
          pressed ? styles.pillPressed : null,
        ]}
        testID="fixture-control"
      >
        <Text style={[text, playback.active ? { color: theme.ink } : null]}>{label}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="フィクスチャを5秒進める"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => playback.seek(SEEK_MS)}
        style={pill}
        testID="fixture-seek-forward"
      >
        <Text style={text}>+5s</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="フィクスチャの演出を再読み込み"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => playback.reloadDirection()}
        style={pill}
        testID="fixture-reload"
      >
        <Text style={text}>RELOAD</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="フィクスチャの色の家族を切り替える"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => playback.cyclePalette()}
        style={pill}
        testID="fixture-palette"
      >
        <Text style={text}>{`PAL ${paletteFamilyKeyFor(playback.direction.palette) ?? '?'}`}</Text>
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
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillPressed: {
    opacity: 0.6,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
