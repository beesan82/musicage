# MUSICAGE

レコードのそばに置く、縦型の「文字のオブジェ」です。周囲で鳴っている曲を聴き取り、その曲の歌詞を一行ずつ、書体・大きさ・縦横・入り方を変えながら黒地の舞台に組んでいきます。音楽は再生しません。曲がないときは idle のグリフ構成が置かれ、マイクの音から推定した拍で静かに脈打ちます。

## Prerequisites

- Node.js LTS
- Windows PC と iPhone を同じ Wi-Fi に接続
- 本命: iOS Development Build（EAS でビルドして iPhone にインストールしたもの）。曲の読み取り（ShazamKit）はこのビルドでだけ動きます。手順は下の「Development Build」を参照。
- フォールバック: App Store 版の Expo Go（Expo SDK 57 対応）。`npm run start:go` で起動します。曲の読み取りは無く、マイクの音量メーターで拍を取り、開発用のフィクスチャ曲だけが流れます。

## Run

### Development Build

1. `npm install`
2. `npm start`
3. iPhone の Development Build を開き、表示された LAN の URL を選ぶ（トンネルは使わない）
4. マイクを許可する

### Expo Go（フォールバック、認識なし）

1. `npm install`
2. `npm run start:go`
3. Expo Go で QR コードを読み取る
4. マイクを許可する

## What it does

- 画面全体は Skia で描く「文字の舞台」です。黒地のテクスチャ背景の上に、曲がないときは idle のグリフ構成が置かれ、マイクの音から推定した拍（`pulse`）で脈打ちます。
- 「曲を読み取る」か自動トリガーで ShazamKit がフィンガープリントだけで曲を照合し、LRCLIB の同期歌詞を行単位で流す。音声は端末外に送らず保存もしない。
- 照合で得た曲の位置を `performance.now()` の時計に繋ぎ、行の切り替わりはその時計で決めます。拍の信頼度が高いときは、切り替えが次の拍に寄ります。最終行から 15 秒過ぎると idle 構成に戻ります。
- 設定の「曲の自動読み取り」がオンなら、無音が 4 秒以上続いたあとに音が戻ったとき、または曲の最終行を 15 秒過ぎたときに自動で読み取り直します（アプリが前面にある間だけ）。
- LRCLIB に同期歌詞が無い曲は、作り物の歌詞を出さず、idle 構成に曲名とアーティストだけを小さく置きます。
- 右上の文字は状態です: `LISTENING`（聴いている）、`MATCHING`（曲を照合中）、`LYRICS`（歌詞を取得中）、`MIC OFF` / `MIC ERROR`（マイクが使えない）。
- 開発ビルドでは右上に `FIX` ピルが出ます。長押しで架空のフィクスチャ曲をオン／オフし、タップで再生／一時停止、左右の `−5s` / `+5s` でシークします。フィクスチャの再生中は認識した曲より優先されます。ピルには fps も出ます。

## Development Build

Apple Developer の App ID（`com.musicage.app`、ShazamKit の App Service 有効）、開発用 iPhone の登録、EAS プロジェクト（`app.json` の `extra.eas.projectId`、所有者 `beesan`）は作成済みです。**`eas init` は実行しないでください**（別の EAS プロジェクトができてしまいます）。

ビルドは所有者が PowerShell で行います（Apple ID のログインが要ります）。

1. EAS CLI が入っていなければ入れて、ログインを確認する:

   ```powershell
   npm install -g eas-cli
   eas whoami
   ```

   `beesan` と出なければ `eas login`。
2. 設定の解決を確認してからビルドする:

   ```powershell
   npx expo config --type public
   eas build --platform ios --profile development
   ```

   証明書やプロビジョニングプロファイルについて聞かれたら、EAS に任せる既定の答えで進めます。1 回 15〜30 分かかります。失敗したらビルドページの Xcode ログ（`Run fastlane` の Swift エラー）を見ます。
3. 新しい iPhone を足すときだけ `eas device:create` で登録してから、もう一度ビルドします。
4. ビルドの URL を iPhone で開いてインストールし、上の「Run → Development Build」で起動します。

## Device validation

1. 起動直後: 黒地の grain 背景と idle グリフ。音を鳴らすと脈打つ（拍はネイティブ 50Hz 入力。フェーズ 1 のメーター入力より体感が合うか）。
2. 実在曲をレコード／スピーカーで鳴らし「曲を読み取る」。3 秒以内に歌詞の行が出ること、以降 1 分間で行の切り替わりが体感 ±0.5 秒に収まること。切り替わりが拍に寄る瞬間があるか。
3. 認識中もグリフの脈動と背景が止まらない。
4. 曲が終わる／針を上げる → 15 秒後または無音 4 秒後に idle 構成へ。次の曲をかけると、設定「曲の自動読み取り」オンで自動で再認識する。オフにすると起きない。
5. LRCLIB に同期歌詞が無い曲 → idle 構成に曲名だけ。「同期歌詞」などのラベルは出ない。
6. 操作列を出すと、失敗時の 1 行の文（曲が分からない、マイク拒否）が読める。マイクをいったん設定で拒否して再起動 → `MIC OFF` と復帰の文。
7. 通話または Siri で中断 → 戻ったあとに聴き取りが再開する。
8. 1 分放置して落ちない。右上ピルの fps が 55 以上。
9. Expo Go（`npm run start:go`）でも起動し、フィクスチャが動き、「曲を読み取る」は無効で Development Build の説明が出る。
