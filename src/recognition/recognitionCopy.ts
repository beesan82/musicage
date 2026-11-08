export const RECOGNITION_COPY: Record<
  'unavailable' | 'match_timeout' | 'match_failed' | 'invalid_match' | 'lyrics_failed',
  string
> = {
  unavailable: 'Development Build でのみ曲を読み取れます。',
  match_timeout: '曲が分かりませんでした。スピーカーに近づけてもう一度。',
  match_failed: '曲の照合に失敗しました。通信を確認してもう一度。',
  invalid_match: '曲の位置を読めませんでした。もう一度。',
  lyrics_failed: '歌詞を取得できませんでした。もう一度。',
};
