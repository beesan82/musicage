# Codemagic / TestFlight 配布への移行判断（2026-11-03）

## 判断
- 配布形態は TestFlight とする（所有者が 2026-11-03 に決定。従来の「未決定」から確定）。
- ビルドと TestFlight 提出のパイプラインは EAS ではなく Codemagic に寄せる（所有者指示）。理由：Pocket Agent と同じ運用（Web から手動開始、署名と提出はクラウド側）に統一し、利用時に PC を不要にするため。
- ワークフローはリポジトリ root の codemagic.yaml（ios-testflight）。開始は Codemagic UI から手動のみ（Pocket Agent と同じ）。

## 実施済み
- App Store Connect にアプリレコード「MUSICAGE」を作成（バンドル ID: com.musicage.app、SKU: musicage、プライマリ言語: 日本語、Apple ID: 6830215960）。
- codemagic.yaml の APP_STORE_APPLE_ID に 6830215960 を設定。
- .gitignore に ios/ と android/ を追加（prebuild 生成物の誤コミット防止。AGENTS.md の決まりに合わせる）。

## 未実施・注意
- Codemagic へのアプリ追加、Code signing identities での com.musicage.app 用プロファイルの取得、初回ビルドはこれから。
- App Store Connect のトップに Developer Program ライセンス契約更新の警告があった。提出の段で同意が必要になる可能性がある（対応はアカウントホルダーのみ可）。
- EAS の development ビルドは 2026-11-03 に成功済み（ビルド 3697c20b）。開発ループ用として存置し、配布の主線は Codemagic とする。

## 追記（2026-11-08）: 移行完了

- Codemagic への移行は完了している。TestFlight 配信は `codemagic.yaml` の `ios-testflight` ワークフローで運用中（開始は Codemagic UI から手動）。
- アプリのビルド番号 5 まで TestFlight に配信済み（経緯は `2026-11-03-phase2-progress.md` の各追記を参照）。
- 上の「未実施・注意」のうち、Codemagic へのアプリ追加・署名プロファイルの取得・初回ビルドは済んでいる。
