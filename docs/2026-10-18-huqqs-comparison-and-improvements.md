# MUSICAGE 改善点分析と Huqqs 比較（2026-10-18）

## 結論

- **Huqqs と同じ土俵（歌詞シンクの精度・ステージ数・派手さ）で勝つ見込みはない。** 相手は Metal 製 50 以上の 3D ステージ、Musixmatch 契約、自前クラウドの歌詞アライメント、月 1〜2 回のリリースを回している商用アプリ。こちらは Expo Go 上の個人プロトタイプで、現状は「歌詞が同期して出ない」「周波数解析をしていない」状態。
- **勝てる土俵は別にある。** Huqqs は「手に持って歌う・遊ぶ」アプリ（ペット、実績、クリップ共有）。MUSICAGE の設計意図は「レコードの横に立てておく静かなオブジェ」。この軸（縦書き日本語タイポグラフィ、常時表示、レコード向けの振る舞い、無音声送信）は Huqqs が構造的に取りにいかない領域で、日本語 UI すら Huqqs にはない。
- **ただし条件付き。** 今の技術基盤（音量メーターだけ、Animated+SVG、AudD 時刻校正）では「オブジェ」としても Huqqs に見劣りする。基盤を 3 点入れ替えない限り、開発を続ける意味は薄い。入れ替え内容は後述。

## Huqqs の実態（公式サイト・App Store・プライバシーポリシーから確認）

| 項目 | Huqqs |
| --- | --- |
| 認識 | Apple ShazamKit（端末内でフィンガープリント生成、生音声は送らない） |
| 歌詞 | Musixmatch が主、LRCLIB はフォールバック。単語単位シンク |
| シンク方式 | 自社 Google Cloud の「Lyric Sync」に短い音声サンプルを送って時刻合わせ |
| ビジュアル | Metal 製 3D ステージ 50 以上。曲の energy/BPM/帯域をクラウドに送って自動選択 |
| 付加機能 | 踊るペット、実績、15 秒クリップ共有、翻訳 20 言語以上、TV Canvas（AirPlay/外部ディスプレイ）、カラオケ用カウントイン |
| 対応 | iOS 17+ / iPad / Apple Silicon Mac / visionOS。Android 準備中。UI は英語のみ |
| 価格 | 無料は週 10 曲まで。Pro は月 4.99 ドル、年 29.99 ドル、14 日間無料 |
| 体制 | Cosine Technologies LLC（開発者 Tien Truong）。v2.6.0〜2.6.6 を 2026 年 6〜10 月で 6 回リリース |
| 規模 | 229 MB。評価 7 件（5.0）。まだ無名 |
| 弱点 | 日本語折り返しバグを直してきた履歴あり。音声サンプルを自社サーバーへ送る。UI が賑やか（ペット・実績）で「置物」には不向き。写真感受性の警告が必要なほど点滅する |

## MUSICAGE の現状（コードから確認）

### 動いているもの
- 型チェック通過。テスト 128 本中 127 本通過（1 本タイムアウト、後述）。
- マイク権限、バックグラウンド遷移、レコーダー失敗時の復旧などライフサイクル処理は丁寧。
- 一時録音ファイルの削除、トークンの SecureStore 保存など、プライバシー設計は Huqqs より厳格。

### 致命的なギャップ（Huqqs 比）

1. **音の解析をしていない。** 入力は expo-audio の録音メーター（dB 1 値、120ms 間隔）だけ。`meterFeatureProcessor.ts` の low/mid/high は energy と transient の線形合成で、周波数情報はゼロ。したがって `styleEngine.ts` の 5 スタイル判定は実質「音量の大小」だけで決まり、ジャズとポップを音で区別できない。Huqqs は端末内 FFT とビート検出を回している。
2. **歌詞が同期して出ない。** LRCLIB の時刻付き歌詞を取っても、AudD の timecode が信用できないため `LyricTypography.tsx` は意図的に静止表示。同期させるには 36 回の手動校正実験が必要で、これは製品機能ではない。Huqqs は単語単位で同期。
3. **「曲を読み取る」を押すと映像が死ぬ。** `useSongRecognition.ts` は認識中にメーター録音を止めるため、12 秒以上ビジュアルが無音状態になる。置物アプリとして最悪の挙動。Huqqs は認識が連続的で曲の切り替わりにも追従する。
4. **認識が手動かつ有料トークン持ち込み。** AudD のキーをユーザーが App 内で入力する設計は個人検証用であり、配布できない。
5. **描画基盤が弱い。** 5 シーン合計 912 行の RN Animated + SVG。Huqqs の Metal シェーダーと並べると質感の差が一目で分かる。
6. **ワードレベル・翻訳・外部出力・iPad・横向き、すべて無い。**

### 技術的負債・品質の問題

- **AudD 校正系に 1,095 行**（`syncDiagnostics/` と `SyncDiagnosticsSheet.tsx`）、AudD 関連に 471 行。非テストコード 4,750 行のうち約 3 分の 1 が、設計書自身が「ShazamKit で置き換える」と書いた行き止まりに投じられている。
- **未コミットの `AudioReactiveWave.tsx` が 136 行から 28 行に圧縮され、1 行に複数文が詰め込まれている。** 読めない・レビューできない・diff が取れない。元に戻すか整形してからコミットすべき。
- `MusicageApp.test.tsx` の 1 本が 5 秒タイムアウトで落ちている。
- 全ファイルで LF/CRLF 警告。`.gitattributes` 未設定。
- リポジトリ直下に `backup-before-musicage-initial-merge-20260826/` が未追跡で残っている。
- 操作系（テーマチップ 6 個 + 認識ボタン + マイク操作 + AudD 設定）が下部に積まれ、「静かなオブジェ」という設計意図と矛盾している。

## 開発を続けるなら必須の 3 つの基盤入れ替え

これをやらないなら、Huqqs の劣化版にしかならない。

### 1. 認識を ShazamKit に切り替え、AudD と校正系を捨てる
- 既に `docs/superpowers/specs/2026-09-06-shazamkit-lyric-sync-design.md` で設計済み。実装に進む。
- ShazamKit の `predictedCurrentMatchOffset` と LRCLIB の行単位 LRC だけで、サーバー無しの行単位同期が成立する。Huqqs の単語同期には届かないが、「置物」用途では行単位で十分。
- 条件: Apple Developer Program（年 99 ドル）と EAS の iOS Development Build。Expo Go では不可能。この出費を受け入れないなら、同期歌詞は永遠に出ない。
- `SHSession` にマイクのバッファを流し続ければ、認識中にビジュアルを止める必要がなくなり、曲の切り替わりにも自動追従できる。

### 2. 音量メーターを本物の周波数解析に置き換える
- Development Build に移るなら、`react-native-audio-api`（Web Audio API 互換、AnalyserNode）で FFT と帯域エネルギーを取れる。同じマイク入力を ShazamKit にも流す。
- これで low/mid/high が実データになり、ビート検出も可能。スタイル判定とシーンの反応が初めて「音楽に反応している」ものになる。

### 3. 描画を Skia に移す
- `@shopify/react-native-skia` と `react-native-reanimated` は Expo Go SDK 57 に同梱済み。**これは今日から Expo Go のままで着手できる唯一の大型改善。**
- SkSL ランタイムシェーダーで、Metal 相当のグラデーション・ノイズ・グレインを GPU で描ける。Reanimated で UI スレッド駆動にすれば JS のフレーム落ちも消える。
- 5 シーンの作り直しになるが、現状 912 行なので失うものは少ない。

## 勝ち筋として投資すべき差別化（Huqqs がやらないこと）

1. **縦書き日本語歌詞。** 縦画面の置物に縦書きは自然で、Huqqs の英語 UI・横書き前提では真似しにくい。Skia なら縦書きレイアウトを自前で描ける。
2. **常時表示の作法。** 画面常時点灯、焼き付き回避のゆっくりした位置ドリフト、夜間の自動減光、充電中前提の挙動。Huqqs は「手に持つ」前提でこれを持たない。
3. **レコード向けの振る舞い。** 無音（針上げ、面の切り替え）を検知して余韻表示に落ち、次の曲で自動再認識。認識失敗時もジャケット風の抽象画面として成立させる。
4. **音声を一切外部に送らない。** ShazamKit はフィンガープリントのみ。Huqqs は自社サーバーに音声サンプルを送る。日本の家庭用には訴求点になる。
5. **ノイズを足さない。** ペット・実績・共有ボタン・点滅演出を入れない。それ自体が Huqqs との差になる。

## やらない方がよいこと

- AudD の timecode 校正（36 回実験）を進めること。ShazamKit 移行で丸ごと不要になる。
- 単語単位シンクを自前で追うこと。Musixmatch 契約か音声アライメントサーバーが要り、個人開発の射程外。
- Huqqs のステージ数を追うこと。50 本の量ではなく、5 本の質と日本語タイポグラフィで勝負する。
- Android、翻訳、TV 出力。差別化に寄与しない。

## 推奨する順番

1. 未コミットの `AudioReactiveWave.tsx` を整形し、落ちているテストを直し、`.gitattributes` を入れてコミット。
2. Expo Go のまま Skia + Reanimated で 1 シーン（Ambient）を作り直し、質感の到達点を確認する。ここで Huqqs の Void Bloom と並べて見劣りしないなら続行、劣るなら撤退。
3. Apple Developer Program に加入し、EAS Development Build で ShazamKit モジュールを実装。AudD と校正系を削除。
4. `react-native-audio-api` で FFT を入れ、スタイル判定とシーン反応を実データ化。
5. 縦書き歌詞と常時表示の作法を入れて「置物」として完成させる。

## 参考

- Huqqs App Store: https://apps.apple.com/us/app/huqqs-lyrics-music-visualizer/id6761159829
- Huqqs 公式: https://huqqs.com/
- Huqqs プライバシーポリシー: https://huqqs.com/privacy
- Expo Skia（SDK 57）: https://docs.expo.dev/versions/v57.0.0/sdk/skia.md
- Expo Reanimated（SDK 57）: https://docs.expo.dev/versions/v57.0.0/sdk/reanimated.md
- ShazamKit matchOffset: https://developer.apple.com/documentation/shazamkit/shmediaitemproperty/matchoffset
