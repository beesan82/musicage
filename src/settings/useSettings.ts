import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settingsStore';

export function useSettings(): {
  settings: Settings;
  ready: boolean;
  update(patch: Partial<Settings>): Promise<void>;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const latest = useRef<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let active = true;
    loadSettings().then((loaded) => {
      if (!active) return;
      latest.current = loaded;
      setSettings(loaded);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSettings(next);
    await saveSettings(next);
  }, []);

  return { settings, ready, update };
}
