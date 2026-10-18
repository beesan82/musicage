# MUSICAGE 歌詞タイポグラフィ・オブジェ設計（2026-10-18）

## 状態

承認待ちの設計。2026-10-18 の改善メモ（`docs/2026-10-18-huqqs-comparison-and-improvements.md`）と ShazamKit 設計（`docs/superpowers/specs/2026-09-06-shazamkit-lyric-sync-design.md`）を前提にし、両者を一本の製品方針にまとめる。ShazamKit 設計のうち「既存のビジュアライザは変更しない」という制約は本設計で解除する。

## 意図と理由

MUSICAGE は、レコードプレーヤーの横に立てておく縦型の「文字のオブジェ」になる。所有者が平沢進の歌詞動画に見た魅力、すなわち **歌詞の内容に合わせて書体・組み方・動きが選ばれ、拍に乗って切り替わる** 体験を、置物として成立する静けさの中で再現する。

今の実装は「情景（稜線・霧・光）の上に歌詞を乗せる」作りで、歌詞は静止し、動きは音量にだけ反応している。これを、

- 歌詞と図形が主役、背景シェーダーは質感係
- 行ごとに書体・大きさ・縦横・入り方が変わる
- 音量ではなく拍に乗る
- 「今歌っている行」が本当に同期している

という作りに置き換える。

### 所有者の言葉（そのまま）

- 「視覚的なおしゃれ感、グルーヴ感をもっと高めたい」
- 「平沢のタイポグラフィ動画とかめっちゃおしゃれ」
- 惹かれる点は「歌詞の内容に合わせて、おしゃれなフォント、デザイン、動きで表現されるところ」
- Apple Developer Program は加入済み

## ゴール / 非ゴール / アンチゴール

### ゴール

1. 認識した曲の歌詞が、行単位で本当に同期して表示される（ShazamKit の matchOffset を基準）。
2. 各行に、歌詞の意味に基づいた演出（書体・ウェイト・大きさ・縦横・入り方・滞留中の動き・強調文字）が割り当てられる。
3. 行の切り替わりと強調が、音量ではなく推定した拍に乗る。
4. 曲が分からない時間、歌詞が無い曲、無音の時間も、文字と図形の構成として美しく成立する。
5. 常時表示の作法（画面点灯維持、焼き付き回避ドリフト）を保つ。

### 非ゴール

- 単語単位の同期。行単位で十分とする。
- ステージ（シーン）の数を増やすこと。
- Android、横向き、iPad、外部ディスプレイ、翻訳、共有機能。
- 音楽の再生。

### アンチゴール（できても失敗）

- ペット、実績、共有ボタン、点滅演出など、賑やかな要素を足すこと。
- 関係ない行が綺麗に動くこと。同期の確信が無いときは「同期している風」に見せない。
- 音声を端末外に送ること。ShazamKit はフィンガープリントのみ、Claude API には歌詞テキストのみ。
- フォントや演出の種類を増やしすぎて、1曲の中で統一感が失われること。

## 制約

- 開発は Windows。iOS ネイティブビルドは EAS Build（クラウド macOS）。Mac は使わない。
- 配布形態は EAS Development Build（`expo-dev-client`）。Expo Go は卒業する。ただし、タイポグラフィ描画と拍エンジンは Expo Go でも動くように作り、実機ビルドの往復なしに磨けるようにする。
- iPhone 縦画面のみ。
- 個人利用のプロトタイプ。Claude API キーは所有者が端末内で入力し SecureStore に保存する（AudD キーと同じ扱い）。配布は想定しない。
- 既存の未追跡ディレクトリ `backup-before-musicage-initial-merge-20260826/` には触れない。

## 全体構成

```text
iPhone マイク
  -> ネイティブ「耳」モジュール (Swift / Expo Modules API)
       |-- ShazamKit SHSession          -> 認識結果 + matchOffset
       '-- 軽い音響解析 (vDSP)          -> RMS / low / mid / high @ 約50Hz
  -> JS
       |-- 同期時計 (performance.now() 差分で楽曲位置を進める)
       |-- 拍エンジン (オンセット -> テンポ -> 拍位相)
       |-- LRCLIB 同期歌詞
       |-- 演出ディレクター (Claude API で曲ごとに生成、端末にキャッシュ。無ければルールベース)
       '-- 組版エンジン (行 + 演出指示 + 拍 -> Skia 描画命令)
  -> Skia Canvas
       |-- 背景シェーダー (質感のみ: 紙 / グレイン / ビネット / 拍のわずかな明滅)
       '-- 文字・図形レイヤー (Skia テキスト, 縦書きは自前の字送り)
```

マイクを掴むのはネイティブモジュール一つだけにする。expo-audio の録音メーターと AudD の録音は廃止する。これにより認識中にビジュアルが止まる問題も消える。

## 部品ごとの設計

### 1. ネイティブ「耳」モジュール（`modules/expo-musicage-ear/`）

ShazamKit 設計のモジュールを拡張したもの。1つの `AVAudioEngine` 入力タップから、

- `SHSession.matchStreamingBuffer` に音声を流す
- 同じバッファから RMS と 3帯域（目安 low < 200Hz / mid 200Hz–2kHz / high > 2kHz）のエネルギーを計算し、約 50Hz で JS にイベント送出する

JS に渡すもの:

```ts
type EarFeatures = {
  timestampMs: number;     // 端末の単調時計
  rms: number;             // 0..1
  low: number; mid: number; high: number; // 0..1
};

type EarRecognition = {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  matchedAtMonotonicMs: number;
  currentOffsetMs: number;
};
```

音声バッファ、トークン、生レスポンスは JS に渡さない。

**認識の起動**: 所有者がボタンを押すか、拍エンジンが「無音 → 音あり」の遷移を検出したときに、JS がネイティブへ `listenForMatch()` を要求する。マッチが確定するか 20 秒経ったら ShazamKit への送出を止める（音響解析は止めない）。アプリがフォアグラウンドにある間だけ動く。

**曲の切り替わり**: 同期時計が LRCLIB の最終行を 15 秒以上過ぎた、または無音が 4 秒以上続いて再び音が鳴った場合に自動で再認識する。

### 2. 同期時計

ShazamKit 設計のとおり。`currentOffsetMs + (performance.now() - matchedAtMonotonicMs)` を楽曲位置とし、再認識で上書きする。補正係数は入れない。

### 3. 拍エンジン（`src/beat/`）

純 TypeScript。入力は `EarFeatures`（Expo Go では expo-audio メーターを 60ms 間隔で同形に変換したもの）。

- **オンセット強度**: `low` と `rms` の正の変化量（半波整流差分）を合成。
- **テンポ推定**: 直近 8 秒のオンセット強度列を自己相関し、60–180 BPM の範囲で最大のラグを採る。信頼度（ピークの鋭さ）を 0..1 で出す。
- **拍位相**: 推定周期で位相を進め、強いオンセットで位相を引き込む（単純な位相ロック）。
- **出力**:

```ts
type BeatState = {
  bpm: number | null;
  confidence: number;      // 0..1
  phase: number;           // 0..1、拍頭で 0
  pulse: number;           // 拍頭で 1 に跳ね上がり指数減衰（アタック即時、減衰 ~250ms）
  bar: number;             // 4 拍ごとに増える小節カウント（4/4 仮定）
  energy: number;          // rms のゆっくりした追従値
  silence: boolean;
};
```

`confidence` が低い間は `pulse` を弱め、組版は拍ではなく歌詞時刻だけで切り替わる。拍に乗る演出は信頼度が上がってから効く。

### 4. 演出ディレクター（`src/direction/`）

曲ごとに1回だけ、歌詞全体から **曲レベルの指示** と **行ごとの指示** を作る。

#### 語彙（閉じた選択肢）

書体（同梱フォント、OFL ライセンス、6 書体を上限とする）:

| key | 書体 | 役割 |
| --- | --- | --- |
| `mincho` | Shippori Mincho | 文芸、静けさ、夜 |
| `mincho-old` | Zen Old Mincho | 古風、重厚、祈り |
| `gothic` | Noto Sans JP | 中立、都市、説明 |
| `gothic-heavy` | Dela Gothic One | 叫び、衝撃、見出し |
| `gothic-round` | Zen Maru Gothic | 柔らかさ、幼さ、甘さ |
| `brush` | Yuji Syuku | 筆、土着、祭り |

（具体的な書体の差し替えは実装者に任せる。条件は OFL、日本語常用漢字を収録、合計 40MB 以内。）

行ごとの指示:

```ts
type LineDirection = {
  font: FontKey;
  weight: 'light' | 'regular' | 'bold';
  size: 'xs' | 's' | 'm' | 'l' | 'xl';        // 画面幅に対する相対
  orientation: 'vertical' | 'horizontal';
  entrance: 'cut' | 'drop' | 'rise' | 'scatter' | 'trace' | 'fade';
  hold: 'still' | 'pulse' | 'drift' | 'shake' | 'breathe';
  emphasis: number[];                          // 強調する文字のインデックス（最大 3 文字）
  accent: boolean;                             // アクセント色を使う行か
  ornament: 'none' | 'rule' | 'frame' | 'grid' | 'circle' | 'numeral';
};

type SongDirection = {
  palette: { background: string; ink: string; accent: string }; // 黒白 + 1 色が基本
  texture: 'paper' | 'grain' | 'void' | 'scan';
  tempoFeel: 'still' | 'sway' | 'march' | 'drive';
  idleGlyphs: string;                           // 歌詞の無い時間に散らす記号・数字列
  lines: LineDirection[];                       // LRCLIB の行数と一致
};
```

#### 生成（Claude API）

- SDK は `@anthropic-ai/sdk`。React Native で動かない場合に限り `fetch` で `POST /v1/messages` を直接叩く。
- モデルは `claude-opus-5-5`。思考はデフォルト（adaptive）のまま、`output_config.effort` は `medium`。
- 構造化出力（`output_config.format`）で上記の JSON スキーマを強制する。
- 入力は曲名・アーティスト・歌詞行配列のみ。音声・時刻・端末情報は送らない。
- 失敗（キー無し・通信失敗・refusal・スキーマ不一致）時は **ルールベース** に落ちる。
- 結果は `trackId` をキーに端末の AsyncStorage/FileSystem にキャッシュし、同じ曲で再リクエストしない。
- 歌詞そのものは保存しない。保存するのは指示 JSON だけ（行テキストは含めない）。

システムプロンプトの要点（実装者が文面を書く）:

- 平沢進の歌詞動画のような、意味に応じた書体と組みの選択。
- 1 曲で書体は 2 種まで、`xl` は曲中 3 行まで、`scatter`/`shake` は連続させない。
- サビや反復行は `accent: true` と `emphasis` を揃えて「決め」を作る。
- 置物として成立する静けさ。賑やかにしない。

#### ルールベース（フォールバック）

歌詞テキストのハッシュで決定的に選ぶ。漢字率が高い行は `mincho`、感嘆符や反復は `gothic-heavy`、短い行は `xl`、長い行は `s` 横書き、など単純な規則で、1 曲の中で書体 2 種に収める。

### 5. 組版エンジン（`src/typesetting/`）

入力: 現在行、前後行、`LineDirection`、`SongDirection`、`BeatState`、楽曲位置。出力: Skia に描く文字と図形の配置と各時刻の変形。

- **縦書き**は Skia の `Paragraph` が非対応のため、1 文字ずつグリフを置いて字送りする。長音「ー」、括弧、句読点は回転または位置補正する。
- **入り（entrance）**は行の開始時刻に発火する。`cut` は補間なしで差し替え、`drop`/`rise` はスプリング、`scatter` は文字ごとに拍位相でずらして入る、`trace` は筆順風に左→右（縦なら上→下）に現れる。
- **滞留（hold）**は `BeatState.pulse` と `phase` に結び付ける。`pulse` に対してスケールや字間をわずかに動かし、`breathe` は 2 小節周期。
- **拍への整列**: 行の開始時刻が次の拍頭から ±80ms 以内なら拍頭に寄せる。それ以上ずれる場合は歌詞時刻を優先する。
- **前後行**は小さく薄く置く。`xl` の行では前後行を消す。
- **強調文字**は `accent` 色、1 段大きいサイズ、`pulse` に強く反応。
- **歌詞が無いとき**（未認識、インストゥルメンタル、歌詞無し、間奏、曲間）は `idleGlyphs`（無ければアプリ既定の記号・数字列）と曲名・アーティストを、小節カウントに合わせて組み替える。
- **焼き付き回避**: 既存の `useBurnInDrift` を文字レイヤー全体に適用する。

### 6. 背景シェーダー

既存 5 シーンの SkSL は廃止し、`SongDirection.texture` に対応する 4 種の質感シェーダーに置き換える。各シェーダーは `iPulse`（拍）、`iEnergy`、`iTime` を受け取り、わずかな明滅・粒子・走査線の揺らぎだけを担当する。色は `palette` のみ。

`styleEngine`（ambient/jazz/pop/dance/rock の判定）は削除する。曲が分からないときの質感は `grain`、パレットはアプリ既定の黒地白文字。

### 7. 画面と操作

- 全画面が組版。タップで薄い操作列を出す（既存の挙動）。
- 操作列: 「曲を読み取る」、マイクのオン/オフ、設定（Claude API キーの設定・削除、自動再認識のオン/オフ）。
- 曲名・アーティストは組版の一部として小さく常駐する。「同期歌詞」などのラベルは出さない。同期できないときは行を追わず idle 組版に落ちることで状態を表す。
- 認識失敗、マイク権限拒否、Claude 失敗は、操作列を出したときだけ 1 行で読める文にする。

### 8. 削除するもの

- `src/recognition/auddClient.ts`、`captureRecognitionClip.ts`、`tokenStore.ts`（Claude キー用に改名して残してもよい）、`syncDiagnostics/` 一式、`AudDTokenSheet.tsx`、`SyncDiagnosticsSheet.tsx`、`lyricTiming.ts` の AudD 校正ロジック。
- `src/scenes/*Scene.tsx`（Animated/SVG 版）と `*SceneSkia.tsx`、`styleEngine.ts`。
- `useMicrophoneAnalysis.ts` の expo-audio メーター経路は、Expo Go 用の開発フォールバックとしてだけ残す。
- README の AudD 手順と校正プロトコル。

## 進め方（フェーズ）

実機ビルドの往復は遅いので、Expo Go で磨ける部分を先にやる。

1. **タイポグラフィ基盤（Expo Go）**: フォント同梱、組版エンジン、縦書き、6 つの entrance と 5 つの hold、拍エンジン（メーター入力）、質感シェーダー 4 種、idle 組版。開発用に「固定の曲 + LRC + 演出 JSON」のフィクスチャを用意し、偽の同期時計で動かして見た目を詰める。
   - フィクスチャの歌詞は実在曲を使わず、実装者が書いた架空の日本語歌詞（漢字の多い行、短い叫び、英語行、空行を含む 20 行程度）にする。実在曲の歌詞本文はリポジトリに入れない。
   - 開発用コントロールとして、偽時計の開始・一時停止・シーク、演出 JSON の再読み込み、拍エンジンを実マイク入力で回す切り替えを用意する。見た目は偽時計で、拍の乗りは実際に曲を鳴らして確認する。
   - このフェーズの判断は「組版と動きの質」に限る。実在曲での平沢風の到達点はフェーズ 2 の実機同期後に判断する。
2. **Development Build と耳モジュール**: EAS 設定、Swift モジュール（ShazamKit + 帯域解析）、同期時計、自動再認識、AudD と校正系と旧シーンの削除。実機で行単位の同期を確認する。
   - 所有者が行う手順（実装者は代行できない）を先頭に置く: Apple Developer ポータルで App ID（`com.musicage.app`）を作り ShazamKit を有効化、開発用 iPhone の UDID 登録、EAS 初回ビルド時の Apple ログインと証明書生成の承認。Expo アカウント（beesan）はこの PC にログイン済み。EAS プロジェクト（`eas.json`、`projectId`）はまだ無く、このフェーズで作る。
   - Swift のコンパイルエラーは EAS ビルドログで直す。ビルド往復は 1 回 15〜30 分を見込む。
   - ここで実在曲（平沢進を含む）を鳴らして、同期と演出を所有者が評価する。見劣りするなら方針を見直す。
3. **演出ディレクター**: Claude API 生成、キャッシュ、ルールベースのフォールバック、設定画面。
4. **仕上げ**: 常時表示の作法の再確認、夜間減光、曲間の余韻、パフォーマンス（UI スレッド 60fps 維持）。

各フェーズの終わりに所有者が iPhone で見て判断する。フェーズ 1 の終わりで「見劣りする」なら方針を見直す。

## 受け入れ条件

1. 固定フィクスチャで、行ごとに書体・大きさ・縦横・入り方が指示通りに変わる。
2. 拍エンジンが、合成した 50Hz の `EarFeatures` 列（90–150 BPM のクリック）に対し単体テストで ±3 BPM で追従し、`pulse` が拍頭で立つ。Expo Go のメーター入力（60ms 間隔）では拍は参考値とし、合否は問わない。実機のネイティブ入力ではフェーズ 2 で体感確認する。
3. 実機で、認識から 3 秒以内に歌詞行が出て、以降 1 分間で行の切り替わりが体感 ±0.5 秒に収まる。
4. 曲が終わる／針を上げると idle 組版に戻り、次の曲で自動的に再認識する。
5. Claude キー無しでもルールベースで全機能が動く。キーありでは同じ曲の 2 回目に API を呼ばない。
6. ネイティブ → JS のイベントに音声データが含まれない（型とテストで保証）。
7. 認識中もビジュアルが止まらない。
8. 既存テストのうち残す範囲が通り、型チェックが通る。

## 実装者に任せること

- 具体的なフォント 6 書体の選定とサブセット化の要否。
- 縦書きの字送り・約物処理の詳細。
- 自己相関の窓長・閾値などの拍エンジンのパラメータ。
- Claude システムプロンプトの文面と few-shot の有無。
- 質感シェーダー 4 種の具体的な見た目。
- Swift モジュール内の FFT 実装（vDSP）と帯域の境界。
- キャッシュの保存先（AsyncStorage か FileSystem か）。

## 私（設計者）の判断で決めたこと

所有者に確認していない決定。読んで違えば直す。

- マイクをネイティブモジュール一つに集約し、expo-audio メーターと `react-native-audio-api` は使わない。
- 曲の自動再認識を入れる（アプリがフォアフラウンドの間だけ）。
- 演出の生成は Claude API。モデルは `claude-opus-5-5`、構造化出力、曲ごと 1 回。
- 書体は 6 種上限、1 曲 2 種まで。
- 5 つの音楽ジャンル判定（styleEngine）と既存 5 シーンは全廃。
- 拍は 4/4 固定で小節を数える。
- フェーズ順はタイポグラフィ先行、ネイティブ後回し。
- フィクスチャは架空歌詞。実在曲での評価はフェーズ 2 に移す。
- 拍エンジンの精度条件は単体テストで判定し、Expo Go の実機では参考値扱い。
