import { File, Paths } from 'expo-file-system';

import { isVisualizerKey } from './patterns';
import type { VisualizerKey } from './patterns';

// The songs' chosen patterns, kept so the same song shows the same pattern
// when it is recognized again, in this session or after a restart (design
// spec §9.1, §9.4 decided 2026-11-16). One file beside the settings
// (settingsStore.ts), holding the pattern key per ShazamKit trackId and
// nothing else: no feature values, no audio, no title or lyrics.

/** How many songs are remembered; the one chosen or recalled longest ago is forgotten first. */
export const PATTERN_MEMORY_LIMIT = 256;
export const PATTERN_FILE_NAME = 'musicage-patterns.json';

/** trackId → the song's pattern key. */
export type PatternEntries = Readonly<Record<string, VisualizerKey>>;

export interface PatternStore {
  load(): Promise<PatternEntries>;
  save(entries: PatternEntries): Promise<boolean>;
}

function patternFile(): File {
  return new File(Paths.document, PATTERN_FILE_NAME);
}

/** Only well-formed entries survive: a string trackId to a known key. Anything else is dropped. */
export function parsePatternEntries(text: string): Record<string, VisualizerKey> {
  const out: Record<string, VisualizerKey> = {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  const patterns =
    parsed !== null && typeof parsed === 'object' ? (parsed as { patterns?: unknown }).patterns : undefined;
  if (patterns === null || typeof patterns !== 'object' || Array.isArray(patterns)) return out;
  for (const [trackId, key] of Object.entries(patterns as Record<string, unknown>)) {
    if (trackId !== '' && isVisualizerKey(key)) out[trackId] = key;
  }
  return out;
}

/** The file's whole content: the keys by trackId, nothing more. */
export function serializePatternEntries(entries: PatternEntries): string {
  const patterns: Record<string, VisualizerKey> = {};
  for (const [trackId, key] of Object.entries(entries)) {
    if (trackId !== '' && isVisualizerKey(key)) patterns[trackId] = key;
  }
  return JSON.stringify({ patterns });
}

/** The store on the device, in the document directory like the settings. */
export const filePatternStore: PatternStore = {
  async load() {
    try {
      const file = patternFile();
      if (!file.exists) return {};
      return parsePatternEntries(await file.text());
    } catch {
      return {};
    }
  },
  async save(entries) {
    try {
      const file = patternFile();
      if (!file.exists) file.create();
      file.write(serializePatternEntries(entries));
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * A store in memory only (the session's book when no device store is given,
 * and the tests'): `saved` is the last content written, as the file would hold it.
 */
export function memoryPatternStore(initial: PatternEntries = {}): PatternStore & { saved: string | null } {
  let current: PatternEntries = parsePatternEntries(serializePatternEntries(initial));
  const store = {
    saved: null as string | null,
    async load() {
      return current;
    },
    async save(entries: PatternEntries) {
      store.saved = serializePatternEntries(entries);
      current = parsePatternEntries(store.saved);
      return true;
    },
  };
  return store;
}

export interface PatternBook {
  /** The remembered pattern of `trackId`, or undefined. */
  recall(trackId: string): VisualizerKey | undefined;
  /** Remembers the song's pattern for the session and writes the keys to the store. */
  remember(trackId: string, key: VisualizerKey): void;
  /** Resolves once the stored keys have been read (never rejects). */
  ready: Promise<void>;
}

/**
 * The session's memory of the songs' patterns over a store: the stored keys
 * are read once at creation; a song chosen in this session before they arrive
 * keeps its own choice. Persistence failures are not fatal: the session still
 * remembers.
 */
export function createPatternBook(store: PatternStore, limit: number = PATTERN_MEMORY_LIMIT): PatternBook {
  // Insertion order is recency: re-inserting on use keeps the oldest first.
  let entries = new Map<string, VisualizerKey>();
  const cap = Math.max(1, limit);
  const trim = () => {
    while (entries.size > cap) entries.delete(entries.keys().next().value as string);
  };
  const ready = store
    .load()
    .catch(() => ({}) as PatternEntries)
    .then((saved) => {
      const merged = new Map<string, VisualizerKey>();
      for (const [trackId, key] of Object.entries(saved)) {
        if (trackId !== '' && isVisualizerKey(key)) merged.set(trackId, key);
      }
      for (const [trackId, key] of entries) {
        merged.delete(trackId);
        merged.set(trackId, key);
      }
      entries = merged;
      trim();
    });
  return {
    recall(trackId) {
      const key = entries.get(trackId);
      if (key === undefined) return undefined;
      entries.delete(trackId);
      entries.set(trackId, key);
      return key;
    },
    remember(trackId, key) {
      if (trackId === '' || !isVisualizerKey(key)) return;
      entries.delete(trackId);
      entries.set(trackId, key);
      trim();
      // Never before the stored keys are in: writing the session's alone would drop them.
      void ready.then(() => store.save(Object.fromEntries(entries))).catch(() => false);
    },
    ready,
  };
}

let deviceBook: PatternBook | null = null;

/** The app's one book over the file on the device, created (and read) on first use. */
export function devicePatternBook(): PatternBook {
  deviceBook ??= createPatternBook(filePatternStore);
  return deviceBook;
}
