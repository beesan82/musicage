# muse.ai 引き継ぎプロンプト（MUSICAGE）

以下を muse.ai の最初のメッセージとして貼り付ける。作業の決まりはリポジトリの `AGENTS.md` にあるので、このプロンプトは入口と現在地だけを伝える。

---

あなたは iPhone アプリ「MUSICAGE」の開発を、別の開発環境（Claude Code デスクトップ版）から引き継ぎます。返答と報告は日本語で書いてください。

## リポジトリ
- GitHub: https://github.com/beesan82/musicage（private）。既定ブランチ `master`。
- **作業中のブランチは `claude/lyric-typography-phase2`**。フェーズ 2 の実装はすべてここにあり、まだ `master` にマージしていない。このブランチをチェックアウトして作業を始めること。
- 作業を始める前に次を全文読むこと。
  1. `AGENTS.md`（作業の決まり: テストの回し方、Swift と EAS ビルドの扱い、`eas init` をしないこと、ブランチとコミット、製品の決まり、秘密情報）
  2. `CLAUDE.md`（ゴール、経緯、毎回の報告形式）
  3. `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（設計書。製品の方針はここが正）
  4. `docs/superpowers/plans/2026-10-19-lyric-typography-phase2.md`（フェーズ 2 の計画）
  5. `docs/superpowers/reports/2026-11-03-phase2-progress.md`（進捗、計画から変えた判断、実機で確認すること、後回しにした指摘）
  6. `README.md`（動かし方と実機確認の項目）

## 特に守ること（詳細は AGENTS.md）
- 開発 PC は Windows で Mac が無い。Swift はこの環境でコンパイルできず、EAS のクラウドビルドで初めてコンパイルされる。Swift の変更は EAS ビルドと実機確認までは「未検証」と報告する。
- JS/TS は `npm test -- --watchman=false` と `npm run typecheck` で確かめる（CI は無い）。通していない変更は「未検証」と報告する。
- EAS プロジェクトと Apple 側の設定は済んでいる。`eas init` を実行しない、App ID を作り直さない。EAS ビルドは人が起動する。
- 依存の追加は `npx expo install`。ネットワークが使えなければ人にコマンドを渡す。
- `master` へ直接 push しない。ブランチで作業し、pull request でマージする。自分が変えたファイルだけを stage する。
- 実在曲の歌詞をリポジトリに入れない。音声を端末外に送らない（ShazamKit のフィンガープリントだけ）。秘密情報を求めない、置かない。
- 判断や後回しにした指摘は `docs/superpowers/reports/` の進捗ファイルに書いてコミットする（作業台帳 `.superpowers/` は git に入らない）。

## 現在の状態（2026-11-03 時点）
- フェーズ 1（文字の舞台、拍エンジン、架空のフィクスチャ曲）は `master` にマージ済み（PR #4）。
- フェーズ 2 は計画の Task 1〜8 が完了・レビュー済み。ブランチの最新では `npm test` 276 件と型チェックが通る。
- 残り:
  - Task 9: 所有者が `eas build --platform ios --profile development` を実行し、iPhone で確かめる。Swift はまだ一度もコンパイルされていない。
  - ブランチ全体の最終レビューと、後回しにした指摘の扱いの決定。
  - その後、pull request で `master` へ。
- 未決定: 配布を TestFlight にするか（EAS Submit か Codemagic か）。所有者の判断待ち。
- その次: フェーズ 3（Claude API による演出ディレクター）、フェーズ 4（仕上げ）。

## 最初にやること
1. 上の文書を読み、`git log --oneline -15` と `git status` で現状を確かめる。
2. 依存を入れて（`npm install`）、`npm test -- --watchman=false` と `npm run typecheck` が通るか確かめる。
3. GitHub への push と pull request の作成ができるか（認証と権限）を確かめ、できなければユーザーに伝える。
4. 読んだ内容の要約と、文書と実態のずれがあればその一覧を報告し、続きの作業はユーザーの指示を待つ。
