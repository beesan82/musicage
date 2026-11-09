import type { UnsyncedKind } from './types';

export const RECOGNITION_COPY: Record<
  | 'unavailable'
  | 'match_timeout'
  | 'match_failed'
  | 'invalid_match'
  | 'lyrics_failed'
  | 'lyrics_unavailable'
  | 'lyrics_unsynced'
  | 'instrumental',
  string
> = {
  unavailable: 'Development Build でのみ曲を読み取れます。',
  match_timeout: '曲が分かりませんでした。スピーカーに近づけてもう一度。',
  match_failed: '曲の照合に失敗しました。通信を確認してもう一度。',
  invalid_match: '曲の位置を読めませんでした。もう一度。',
  lyrics_failed: '歌詞を取得できませんでした。もう一度。',
  // The stage's small note under a recognised song it cannot follow (no
  // label claims a sync; each says plainly what was not found).
  lyrics_unavailable: '歌詞が見つかりませんでした',
  lyrics_unsynced: '時刻つきの歌詞が見つかりませんでした',
  instrumental: '歌のない曲として登録されています',
};

/** The note the stage prints under a confirmed track it cannot follow. */
export function unsyncedNote(kind: UnsyncedKind): string {
  switch (kind) {
    case 'plain':
      return RECOGNITION_COPY.lyrics_unsynced;
    case 'instrumental':
      return RECOGNITION_COPY.instrumental;
    case 'lyrics_unavailable':
      return RECOGNITION_COPY.lyrics_unavailable;
  }
}
