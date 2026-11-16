const mockFile = { exists: true, text: jest.fn(), write: jest.fn(), create: jest.fn() };

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => mockFile),
  Paths: { document: 'doc' },
}));

import { File } from 'expo-file-system';

import {
  createPatternBook,
  filePatternStore,
  memoryPatternStore,
  parsePatternEntries,
  PATTERN_FILE_NAME,
  serializePatternEntries,
} from '../patternStore';
import type { PatternEntries, PatternStore } from '../patternStore';

const FileMock = File as unknown as jest.Mock;

/** Lets the book's pending load and save promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockFile.exists = true;
  mockFile.text.mockReset();
  mockFile.write.mockReset();
  mockFile.create.mockReset();
  FileMock.mockClear();
});

describe('the stored patterns hold the keys only (design spec §9.4, decided 2026-11-16)', () => {
  test('the file is { patterns: { trackId: key } } and nothing else', () => {
    const text = serializePatternEntries({ 'shazam-1': 'ripple', 'shazam-2': 'bars-bold' });
    expect(JSON.parse(text)).toEqual({ patterns: { 'shazam-1': 'ripple', 'shazam-2': 'bars-bold' } });
  });

  test('whatever else an entry carries is not written: no feature values, no title, no audio', () => {
    const smuggled = {
      'shazam-1': 'ring',
      'shazam-2': { key: 'ring', bpm: 128, energy: 0.2 },
      'shazam-3': 'mandala',
      '': 'bars',
    } as unknown as PatternEntries;
    const parsed = JSON.parse(serializePatternEntries(smuggled));
    expect(parsed).toEqual({ patterns: { 'shazam-1': 'ring' } });
    expect(Object.keys(parsed)).toEqual(['patterns']);
  });

  test('reading drops malformed content and unknown keys', () => {
    expect(parsePatternEntries('{not json')).toEqual({});
    expect(parsePatternEntries('null')).toEqual({});
    expect(parsePatternEntries('{"patterns":[]}')).toEqual({});
    expect(parsePatternEntries('{"patterns":{"a":"wave","b":"mandala","c":3,"":"bars"}}')).toEqual({ a: 'wave' });
  });

  test('one file, beside the settings in the document directory', async () => {
    mockFile.text.mockResolvedValue('{"patterns":{"a":"wave"}}');
    expect(await filePatternStore.load()).toEqual({ a: 'wave' });
    expect(await filePatternStore.save({ a: 'wave' })).toBe(true);
    for (const call of FileMock.mock.calls) expect(call).toEqual(['doc', PATTERN_FILE_NAME]);
    expect(mockFile.write).toHaveBeenCalledWith('{"patterns":{"a":"wave"}}');
  });

  test('a missing or unreadable file is no patterns; a failed write is false, never a throw', async () => {
    mockFile.exists = false;
    expect(await filePatternStore.load()).toEqual({});
    mockFile.exists = true;
    mockFile.text.mockRejectedValue(new Error('io'));
    expect(await filePatternStore.load()).toEqual({});
    mockFile.write.mockImplementation(() => {
      throw new Error('disk');
    });
    expect(await filePatternStore.save({ a: 'wave' })).toBe(false);
  });
});

describe('createPatternBook: the same song gets the same pattern', () => {
  test('remembers a song’s key for the session and writes the keys to the store', async () => {
    const store = memoryPatternStore();
    const book = createPatternBook(store);
    await book.ready;
    expect(book.recall('shazam-1')).toBeUndefined();
    book.remember('shazam-1', 'curtain');
    expect(book.recall('shazam-1')).toBe('curtain');
    await settle();
    expect(JSON.parse(store.saved!)).toEqual({ patterns: { 'shazam-1': 'curtain' } });
  });

  test('after a restart (a new book over the same store) the song is recalled', async () => {
    const store = memoryPatternStore();
    const first = createPatternBook(store);
    await first.ready;
    first.remember('shazam-1', 'ring');
    await settle();

    const second = createPatternBook(store);
    await second.ready;
    expect(second.recall('shazam-1')).toBe('ring');
  });

  test('a song chosen before the stored keys arrive keeps its choice, and the stored keys are not lost', async () => {
    let release: (entries: PatternEntries) => void = () => {};
    const saves: PatternEntries[] = [];
    const store: PatternStore = {
      load: () => new Promise((resolve) => (release = resolve)),
      save: async (entries) => {
        saves.push(entries);
        return true;
      },
    };
    const book = createPatternBook(store);
    book.remember('shazam-1', 'wave');
    await settle();
    // Nothing is written before the stored keys are in.
    expect(saves).toHaveLength(0);
    release({ 'shazam-1': 'ring', 'shazam-2': 'stipple' });
    await book.ready;
    await settle();
    expect(book.recall('shazam-1')).toBe('wave');
    expect(book.recall('shazam-2')).toBe('stipple');
    expect(saves.at(-1)).toEqual({ 'shazam-1': 'wave', 'shazam-2': 'stipple' });
  });

  test('a failing store never breaks the session’s memory', async () => {
    const store: PatternStore = {
      load: () => Promise.reject(new Error('io')),
      save: () => Promise.reject(new Error('disk')),
    };
    const book = createPatternBook(store);
    await book.ready;
    book.remember('shazam-1', 'bars-bold');
    await settle();
    expect(book.recall('shazam-1')).toBe('bars-bold');
  });

  test('keeps the most recent songs up to its limit', async () => {
    const book = createPatternBook(memoryPatternStore(), 2);
    await book.ready;
    book.remember('a', 'wave');
    book.remember('b', 'ring');
    book.recall('a');
    book.remember('c', 'curtain');
    expect(book.recall('b')).toBeUndefined();
    expect(book.recall('a')).toBe('wave');
    expect(book.recall('c')).toBe('curtain');
  });

  test('refuses an empty trackId or an unknown key', async () => {
    const book = createPatternBook(memoryPatternStore());
    await book.ready;
    book.remember('', 'wave');
    book.remember('x', 'mandala' as never);
    expect(book.recall('')).toBeUndefined();
    expect(book.recall('x')).toBeUndefined();
  });
});
