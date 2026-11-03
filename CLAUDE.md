# Claude Code 開発ガイド — MUSICAGE

作業の進め方（テスト、EAS ビルド、ブランチとコミット、製品の決まり、秘密情報）は `AGENTS.md` に従うこと。

## プロジェクトのゴール
レコードのそばに置く縦型の「文字のオブジェ」。iPhone のマイクで周囲の曲を ShazamKit で認識し、LRCLIB の同期歌詞を、歌詞の意味に合わせた書体・組み・動きで拍に乗せて表示する。方針は `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`。

## これまでの経緯と現在地
- フェーズ 1（Expo Go で動く文字の舞台、拍エンジン、架空のフィクスチャ曲）は PR #4 で `master` にマージ済み。
- フェーズ 2（EAS Development Build、Swift の耳モジュール、ShazamKit 同期、自動再認識、AudD と校正系の削除）はブランチ `claude/lyric-typography-phase2` で実装済み。EAS ビルドと実機確認はまだ。
- 最新の進捗、判断、後回しにした指摘は `docs/superpowers/reports/2026-11-03-phase2-progress.md` を見ること。
- 次はフェーズ 3（Claude API による演出ディレクター）とフェーズ 4（仕上げ）。それぞれ設計書から計画を書いてから進める。

## 毎回の報告形式
- やったこと（変更ファイル）
- 実行したテストと結果（通していないものは「未検証」）
- 実機で確かめる必要があること
- 人にお願いすること（ネットワーク越しのインストール、EAS ビルド、Apple のサイトでの操作）
- 次の推奨作業

## 作業の始め方
1. `AGENTS.md`、設計書、進行中の計画、`docs/superpowers/reports/` の最新の進捗ファイルを読む。
2. `git log --oneline -15` と `git status` で現状を確かめ、`npm test -- --watchman=false` と `npm run typecheck` が通るか確かめる。
3. 実機で確かめていない機能を「完成」と報告しない。
