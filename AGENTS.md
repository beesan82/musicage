# AGENTS.md — MUSICAGE の作業の決まり

AI エージェント（Claude Code、muse.ai など）と人が、このリポジトリで作業するときの決まり。
製品の方針は `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（以下「設計書」）、進行中の計画は `docs/superpowers/plans/`、進捗と判断の記録は `docs/superpowers/reports/` にある。
この文書は「どう作業するか」だけを書く。

## 言語
- 返答・報告・設計書・計画・手順書は日本語で書く。コード内のコメントとコミットメッセージは英語でよい。

## 開発環境の前提
- アプリは Expo SDK 57 / React Native 0.86 / TypeScript 6。対象は iPhone の縦画面だけ。
- 開発 PC は Windows で、Mac も Xcode も Swift ツールチェーンもない。iOS のネイティブビルドは EAS Build（クラウドの macOS）だけで行う。
- このリポジトリには GitHub Actions の CI がない。JS/TS の検証はローカル（またはエージェントの実行環境）で次を回す。

  ```bash
  npm test -- --watchman=false   # jest、--runInBand 付き。全体で約 2.5 分
  npm run typecheck              # tsc --noEmit
  ```

  通していない変更は「未検証」と報告する。まれに 1 件だけ落ちて再実行で通るテストがある（未特定）。落ちたら一度だけ再実行して、それでも落ちれば実際の失敗として扱う。
- 依存の追加は `npx expo install <package>` を使う（SDK 57 に合う版を選ぶため）。実行環境でネットワークが使えないときは、人にコマンドを渡して実行してもらう。
- `npx expo prebuild` で `ios/` や `android/` を作ってコミットしない。ネイティブのプロジェクトは EAS がクラウドで生成する。

## ネイティブモジュール（`modules/expo-musicage-ear/`）
- Swift の Expo Module。1 つの `AVAudioEngine` 入力タップから ShazamKit への照合と、vDSP による RMS・3 帯域の特徴量（20ms ごと）を JS に送る。JS 側の契約は `modules/expo-musicage-ear/src/types.ts`。
- Swift はこの環境でコンパイルできない。`src/__tests__/nativeContract.test.ts` は Swift のソースを文字列として読み、関数名・イベント名・禁止事項を JS の契約と突き合わせるだけで、コンパイルや動作は保証しない。
- Swift の変更は、EAS ビルドが通り、実機で確かめるまで「未検証」と報告する。Expo の API は推測で書かず、`node_modules/expo-modules-core/ios/` などの実ソースで形を確かめる。
- 自動リンクは `./modules` を既定で探すので、ルートの `package.json` に依存として書かなくてよい。

## EAS（ビルドと配布）
- EAS プロジェクトは作成済み（`app.json` の `extra.eas.projectId`、所有者 `beesan`、`eas.json` の `appVersionSource: remote`）。Apple Developer の App ID `com.musicage.app`（ShazamKit の App Service 有効）と開発用 iPhone の登録も済んでいる。
- **`eas init` を実行しない、App ID を作り直さない。** 別の EAS プロジェクトができてしまう。
- ビルドは人が起動する（Apple ID のログインが要る）。

  ```bash
  eas build --platform ios --profile development
  ```

  1 回 15〜30 分。失敗したらビルドページの Xcode ログ（`Run fastlane` の Swift エラー）を人から受け取って直す。
- 起動は Development Build を iPhone に入れてから、PC で `npm start` を実行し、同じ Wi-Fi の LAN の URL を選ぶ。トンネル（`--tunnel`）は所有者の PC で失敗するので使わない。
- Expo Go はフォールバック（`npm run start:go`）。舞台・拍・フィクスチャ曲は動くが、曲の読み取りはできない。
- 配布は今は Development Build の internal 配布（登録済み端末だけ）。TestFlight 配信（別プロジェクト AgentApp と同じ形）にするかは未決定で、所有者の判断待ち。

## ブランチとコミット
- 既定ブランチは `master`。作業はブランチで行い、pull request で `master` にマージする（これまでの PR #1〜#4 と同じ）。`master` へ直接 push しない。
- 失敗するテストを含むコミットを `master` に入れない。
- 他のエージェントや人が同じリポジトリで並行して作業する。`git add -A` や `git commit -a` は使わず、自分が変えたファイルだけを明示して stage する。自分が作っていない未追跡ファイルや変更には触らない。
- push の前に `git fetch` し、取り込むべき新しいコミットがあれば rebase してから push する。
- 所有者の PC にだけある未追跡ディレクトリ `backup-before-musicage-initial-merge-20260826/` には触れず、ステージしない。

## 設計と記録の流れ
- superpowers のスキルに従う（brainstorming → writing-plans → test-driven-development / subagent-driven-development）。設計書は `docs/superpowers/specs/`、計画は `docs/superpowers/plans/` に置く。
- 失敗するテストを先に書き、失敗を確かめてから実装する。
- 計画の実行中の台帳（`.superpowers/`）は git に入らない。他の環境から続きを追えるよう、タスクの完了・判断（Ruling）・後回しにした指摘は `docs/superpowers/reports/` の進捗ファイルにも書いてコミットする。
- 実機での確認が要る項目は、進捗ファイルの「実機で確認すること」に足す。実機確認は人が行い、結果を同じファイルか `docs/superpowers/reports/` の確認記録に残す。

## 製品の決まり（設計書より。変えるときは設計書を直してから）
- 実在曲の歌詞本文をリポジトリに入れない。テスト用の歌詞は架空のものにする。
- 音声を端末の外に送らない。外に出るのは ShazamKit のフィンガープリントだけ。LRCLIB に送るのは曲名・アーティスト・アルバム名だけ。ネイティブ → JS のイベントに音声バッファや ShazamKit の生オブジェクトを入れない。
- 「同期歌詞」などのラベルを描かない。同期の確信が無いときは行を追わず idle 構成に落ちる。
- 置物として静かに保つ。ペット、実績、共有ボタン、点滅などを足さない。
- 同梱フォントは OFL、日本語常用漢字収録、合計 40MB 以内、6 書体まで。1 曲で書体は 2 種まで。
- 常時表示の作法（画面点灯維持、文字レイヤーの焼き付き回避ドリフト）を保つ。毎フレーム React を再レンダーしない。

## 秘密情報
- API キー、Apple の証明書・プロビジョニングプロファイル、App Store Connect のキーを、コード・コミット・ログ・チャットに置かない。エージェントは値を求めない。
- Apple の署名は EAS が管理する。
- フェーズ 3 の Claude API キーはアプリ内で入力し、`expo-secure-store` に保存する。
