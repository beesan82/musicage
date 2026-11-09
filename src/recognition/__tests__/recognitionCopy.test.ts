import { RECOGNITION_COPY, unsyncedNote } from '../recognitionCopy';

test('the note under a song the stage cannot follow says what was not found, per reason', () => {
  expect(unsyncedNote('lyrics_unavailable')).toBe(RECOGNITION_COPY.lyrics_unavailable);
  expect(unsyncedNote('plain')).toBe(RECOGNITION_COPY.lyrics_unsynced);
  expect(unsyncedNote('instrumental')).toBe(RECOGNITION_COPY.instrumental);
});

test('no note claims a sync or carries a "synced lyrics" label (design spec §7)', () => {
  for (const kind of ['lyrics_unavailable', 'plain', 'instrumental'] as const) {
    const note = unsyncedNote(kind);
    expect(note.trim()).not.toBe('');
    expect(note).not.toContain('同期歌詞');
    expect(note).not.toMatch(/同期中|同期しました/);
  }
});
