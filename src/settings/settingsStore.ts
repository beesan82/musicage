import { File, Paths } from 'expo-file-system';

export interface Settings {
  autoRecognize: boolean;
}

export const DEFAULT_SETTINGS: Settings = { autoRecognize: true };

function settingsFile(): File {
  return new File(Paths.document, 'musicage-settings.json');
}

export async function loadSettings(): Promise<Settings> {
  try {
    const file = settingsFile();
    if (!file.exists) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(await file.text());
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { autoRecognize?: unknown }).autoRecognize === 'boolean'
    ) {
      return { autoRecognize: (parsed as Settings).autoRecognize };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  settingsFile().write(JSON.stringify(s));
}
