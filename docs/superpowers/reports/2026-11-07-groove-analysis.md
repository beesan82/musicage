# MUSICAGE「ノリ」改善分析（2026-11-07）

分析のみ。アプリのコードは変更していない。実コードは `feat/app-icon`（`0003989`）時点のものを読んだ。

## 要約

**結論。** 「もっと上げ上げ・ノリノリに」という希望は、設計書の「置物として静かに保つ」という原則と正面から衝突するように見えるが、実コードを読む限り、いま見えている「ぐちゃぐちゃ」「動かない」の大半は原則のせいではなく、**拍の情報が描画に届くまでの経路が粗く、届いた情報の使い方が小さすぎる**ことが原因である。具体的には次の 4 点。

1. 拍の値（`pulse` / `phase` / `bar`）は React の state 経由で 60ms 刻みに UI スレッドへ写されるので、UI 側では滑らかな減衰ではなく階段になり、しかもオンセットから 1 フレーム以上遅れる（`src/app/useStageSource.ts:103-119`、`src/typesetting/useBeatSharedValues.ts:27-33`）。
2. 耳モジュールが 20ms ごとに送る `rms / low / mid / high` のうち、描画に届くのは `energy`（`rms` の 400ms 追従値）と `pulse` だけで、`mid` と `high` はどこにも使われていない（`src/beat/beatEngine.ts:154-212`）。
3. 滞留（hold）の振幅は拡大率 2〜8%、ずれ 1.5〜2px と極めて小さく、入場（entrance）は拍位相と無関係に時間だけで進み、退場（exit）の振り付けは存在しない（`src/typesetting/motion.ts`、`src/typesetting/LyricStage.tsx:196-215`）。
4. idle 構成は `beat.bar` が変わるたびに全グリフの個数・位置・文字・大きさを再抽選し、`entrance="cut"` で瞬間移動させる。しかも `bar` は一度テンポが推定されると **無音中も進み続ける**ので、静かな部屋でも約 2 秒ごとに跳ぶ（`src/typesetting/LyricStage.tsx:221-226, 305-314`、`src/beat/beatEngine.ts:167-185`）。さらに数字と長音は縦組み規則で 90° 横倒しに置かれる（`src/typesetting/idleComposition.ts:65`、`src/typesetting/layout.ts:55`）。

したがって、**第 1 階梯（作法を守ったまま）だけでも体感は大きく変わる**。原則を改定するかどうかは、第 1 階梯を実機で見てから決めるべきで、改定が要る案は本書で第 2・第 3 階梯に分けて列挙した。

**最初の一手の推奨。** 「拍の値を React を通さず UI スレッドに流す」経路を作り、それに乗せて (a) idle の再配置を「小節ごとの全再抽選」から「拍に揺れ、4〜8 小節に 1 文字ずつ差し替わる」に変え、(b) hold の振幅を上げて `low` に乗せ、(c) 背景の拍への反応を `confidence` 付きで強める。触るのは `useStageSource.ts`、`useBeatSharedValues.ts`、`motion.ts`、`idleComposition.ts`、`LyricStage.tsx` と 4 つのシェーダで、設計書の改定は不要。工数は中（2〜3 日）。詳細は「最初の一手」の節。

---

## 1. 現状の事実（実コードで確認したこと）

### 1.1 耳モジュール（`modules/expo-musicage-ear/`）

| 項目 | 事実 | 根拠 |
| --- | --- | --- |
| 送出間隔 | 48kHz モノラル、960 サンプルのホップ = **20ms（50Hz）**。1024 サンプルの Hann 窓 FFT | `ios/EarAnalyzer.swift:14-24, 140-165` |
| 帯域 | low = bin 1〜4（< 200Hz）、mid = bin 5〜42（200Hz〜2kHz）、high = それ以上 | `ios/EarAnalyzer.swift:23-24` |
| 値の尺度 | dBFS を床 −72 / 天井 −12 で 0..1 に線形化し、平方根をとる。つまり **対数尺度を緩めたもの**で、小音量でも値が立ちやすい | `ios/EarAnalyzer.swift:176-184` |
| JS 側契約 | `EarFeatures = { timestampMs, rms, low, mid, high }`、`t` は端末単調時計を `clockConverter` で `performance.now()` 基準に写す | `src/types.ts:1-7`、`src/clockConverter.ts` |
| Expo Go 経路 | expo-audio のメーターを **60ms** ごとに `EarFeatures` に変換。`low = rms`、`mid`/`high` は立ち上がり量から合成した擬似値 | `src/audio/earFeaturesFromMeter.ts:21-27`、`src/audio/useMicrophoneAnalysis.ts:138` |

### 1.2 拍エンジン（`src/beat/`）

`BeatState` の各値の実態（`src/beat/types.ts:3-12`、`src/beat/beatEngine.ts`）:

| 値 | 実態 | 根拠 |
| --- | --- | --- |
| `bpm` / `periodMs` | 直近 8 秒のオンセット強度列を 500ms ごとに自己相関、60〜180 BPM。放物線補間でサブサンプル化 | `beatEngine.ts:63-104, 200-211` |
| `confidence` | 自己相関ピークの鋭さ `(peak − mean) / peak`。無音中は 1 秒時定数で減衰 | `beatEngine.ts:102, 183` |
| `phase` | 推定周期で 20ms ごとに進む予測位相。オンセットが来ると 0.3 の強さで引き込む（単純位相ロック） | `beatEngine.ts:169-174, 190-197` |
| `pulse` | **検出したオンセットで 1 に跳ね、時定数 120ms で指数減衰**。予測拍頭では立たない。オンセット不応期 100ms | `beatEngine.ts:22, 167, 187-189` |
| `bar` | `floor(beats / 4)`。小節頭（ダウンビート）の検出は無く、4 拍ごとに増えるだけ | `beatEngine.ts:32, 142` |
| `nextBeatAtMs` | `lastGridMs − phase·periodMs + periodMs`。**次の拍頭の予測時刻（JS 時計）** が 1 拍先まで読める。`bpm` と合わせれば N 拍先も計算できる | `beatEngine.ts:143` |
| `energy` | `rms` の 400ms 時定数の追従値 | `beatEngine.ts:23, 162` |
| `silence` | `rms < 0.018` が 500ms 続いたら真 | `beatEngine.ts:24, 163-165`、`types.ts:25` |

重要な性質:

- オンセット強度は `0.7·max(0, low − low平均) + 0.3·max(0, rms − 前rms)` で、**`mid` と `high` は拍エンジンに入らない**（`beatEngine.ts:158`）。描画側にも届かないので、現状 3 帯域のうち 2 帯域は捨てている。
- 位相の更新（`phase += GRID_MS / periodMs`、`beats += 1`）は無音判定の **前** に走る（`beatEngine.ts:168-174` → `181-185`）。一度 `periodMs` が入ると、無音でも `beats` と `bar` は進み続ける。`periodMs` が `null` に戻るのは `reset()`（1 秒以上の欠落か聴取停止）のときだけ（`beatEngine.ts:214-231, 238`）。
- `estimateTempo` は自己相関の最大値が 0 以下のときだけ `null` を返す（`beatEngine.ts:88`）。環境音の小さなオンセットでも 8 秒窓が満ちれば何らかの周期が推定され、`confidence` は低いが `periodMs` は入る。

### 1.3 拍の配線（`src/app/useStageSource.ts`、`src/typesetting/useBeatSharedValues.ts`）

- 耳フレームは `earStream.subscribe` で受け、`engine.push` の結果を **新しい pulse 頭が立ったとき、または前回公開から 60ms 以上経ったときだけ `setBeat`** する（`useStageSource.ts:22-24, 103-119`）。つまり React の再レンダーは最大約 16Hz + オンセット回数。
- `LyricStage` は `beat` を props で受け、`useBeatSharedValues` が `useEffect` で shared value に代入する（`useBeatSharedValues.ts:27-33`）。UI スレッドから見ると `pulse` は **60ms ごとの階段**（60fps なら 4 フレームに 1 回しか変わらない）で、オンセットから「ネイティブ 20ms + 公開待ち ≤60ms + React レンダー + effect」の遅れを持つ。
- 行スケジューラは 50ms ごとの `setInterval`（`useStageSource.ts:22, 183`）。行が前に進むとき `confidence ≥ 0.5` かつ次の拍頭が 80ms 以内なら、拍頭まで切り替えを待つ（`src/sync/lineScheduler.ts:5-7, 28-35`）。拍への整列はこの「最大 80ms の遅延」だけで、先読みや予備動作はない。
- 行が変わると `setNowMonotonicMs(now)` で舞台時計の錨を打ち直す（`useStageSource.ts:178`）。UI 側の `time` shared value はこの錨から `useFrameCallback` で進む（`LyricStage.tsx:172-188`）。`time` と `nextBeatAtMs` は **同じ `performance.now()` 基準**なので、worklet 内で `nextBeatAtMs − time.value` が「次の拍までの残り ms」として直接使える。これが観点 1 の土台になる。
- 自動再認識の effect は `stage.beat` が変わるたび（60ms ごと）に走る（`src/app/MusicageApp.tsx:73-86`）。

### 1.4 組版（`src/typesetting/`）

**配置。** `layoutLine` は行が変わったときだけ JS で走り、1 文字ずつ `PlacedGlyph`（基線原点 x, y、`rotateDeg` 0/90、`sizePx`）を返す（`layout.ts:91-158`）。サイズ比は xs 0.045 〜 xl 0.16（画面幅比、`layout.ts:53`）。

**描画。** `GlyphLayer` はグリフごとに `<Group transform origin opacity><Text/></Group>` を 1 つ作り、`useDerivedValue` で `glyphTransform` を毎フレーム UI スレッドで評価する（`GlyphLayer.tsx:99-134`）。色は `palette.ink` か `palette.accent` の固定文字列で、**色・太さ・ぼかしは一切アニメーションしていない**（`GlyphLayer.tsx:55, 132`）。

**入場（entrance）の実装状況**（`motion.ts:26-33, 84-99`）:

| entrance | 実装 | 拍との関係 |
| --- | --- | --- |
| `cut` | 0ms、補間なし | 無し |
| `drop` / `rise` | 420ms の減衰バネ、dy −40 / +24 px、不透明度連動 | 無し |
| `scatter` | 文字ごと 40ms ずらし、±30px / ±12° から 600ms バネ | **無し**（設計書は「拍位相でずらす」としているが時間固定） |
| `trace` | 文字ごと 60ms ずらし、120ms で不透明度 0→1 | 無し |
| `fade` | 300ms | 無し |

**滞留（hold）の実装状況**（`motion.ts:101-120`）。入場完了後のみ効き、`confidence < 0.5` なら pulse 由来の量を 0.25 倍:

| hold | 実装 | 振幅 |
| --- | --- | --- |
| `pulse` | `scale = 1 + 0.04·pulse`（強調文字 0.08） | 最大 4〜8% |
| `shake` | `pulse > 0.5` の間だけ 60ms 刻みでランダム | ±1.5px |
| `breathe` | `(bar % 2 + phase) / 2` の正弦、2 小節周期 | ±2% |
| `drift` | 1.3s / 1.7s の正弦 | ±2px |
| `still` | 無し | — |

**退場。** 行が変わると `lineScene` の `useMemo` が新しい配置を返し、前の行の `GlyphLayer` は **その場で消える**（`LyricStage.tsx:196-215, 271-280`）。退場の振り付けは存在しない。前後行（context）は `fade` で入り不透明度 0.35 で四隅に置かれる（`LyricStage.tsx:61, 109-130, 281-300`）。

**装飾（Ornament）。** `rule` / `frame` / `circle` / `grid` / `numeral` はすべて静止描画。`numeral` は `bar % 100` を右上に出すので小節ごとに数字が変わる（`Ornaments.tsx:94-99`）。

**idle 構成**（`idleComposition.ts:37-80`、`LyricStage.tsx:217-226, 303-327`）:

- 3 列 × 5 行の格子から 5〜9 個のセルを選び、`idleGlyphs`（既定 `0123456789○△□＝ー`）から 1 文字ずつ、サイズ s か m で置く。**種は `bar` のみ**なので、小節が変わると個数・セル・文字・サイズが全部変わる。
- `GlyphLayer` には `entrance="cut"`、`lineStartedAtMs={0}`、`hold="pulse"`、`seed={beat.bar}` が渡る。`cut` なので補間なしに瞬間移動し、`pulse` hold は静かな部屋では `confidence < 0.5` で 0.25 倍 → 拡大率は最大 1% で、事実上静止して見える。
- 数字・英字・`ー` は `ROTATED_IN_VERTICAL` に該当し **90° 回転して置かれる**（`idleComposition.ts:65`、`layout.ts:55`）。縦書きの行の中では正しいが、格子に 1 文字ずつ散らす idle では「横倒しの数字が散らばっている」ように見える。所有者の「数字・記号が散らばってぐちゃぐちゃ」はこれと「小節ごとの全再抽選」の重なりである。
- 1.2 のとおり `bar` は無音でも進むので、120 BPM 相当のテンポが一度でも推定されると静かな部屋でも約 2 秒ごとに跳ぶ。

### 1.5 テクスチャ（`src/textures/`）

- uniform は `iResolution, iTime, iPulse, iEnergy, iBackground, iInk, iAccent` の 7 つ（`textureShader.ts:19-26`）。`TextureBackground` が `useDerivedValue` で UI スレッド上の `pulse` / `energy` shared value から毎フレーム組み立てる（`TextureBackground.tsx:63-74`）。色は `palette` が変わったときだけ JS で `hexToRgb01` する（`TextureBackground.tsx:54-61`）。
- 4 種のシェーダとも拍への反応は **`col += iPulse * 0.04`（全面を最大 4% 明るく）** の 1 行だけで共通（`grain.ts:12`、`paper.ts:14`、`scan.ts:12`、`void.ts:12`）。`scan` だけ走査線の位相が pulse で 1px ずれる（`scan.ts:9`）。`iEnergy` はビネットを最大 3% 開くだけ（`textureShader.ts:58-62`）。`iInk` と `iAccent` は宣言されているが **どのシェーダも読んでいない**（`textureShader.ts:15-17` のコメントどおり）。
- 設計書 §6 は「わずかな明滅・粒子・走査線の揺らぎだけを担当」と定めているので、この 4% の明滅自体は作法の内側にある。
- `pulse` はオンセントごとに 1 に跳ねる（1.2）ので、実機でオンセットが密な曲では背景が **60ms 階段の 4% 明滅** を毎拍繰り返すことになる。これは現状でも「点滅」の芽であり、第 1 階梯ではむしろ `confidence` でゲートして品を上げるべき。
- 全画面フラグメントシェーダは毎フレーム走る（`TextureBackground.tsx:40-45`）。`paper` は fbm3 + vnoise で最も重く、`grain` は hash 1 回、`void` / `scan` はノイズ無し。

### 1.6 演出の語彙と現状（`src/direction/`）

- `LineDirection` は font / weight / size / orientation / entrance(6) / hold(5) / emphasis / accent / ornament(6)、`SongDirection` は palette / texture(4) / tempoFeel(4) / idleGlyphs / lines（`types.ts:10-34`）。
- **`tempoFeel` は検証と生成で値を持つだけで、組版・動き・テクスチャのどこからも読まれていない**（grep 結果: `validateDirection.ts`、`ruleBasedDirector.ts`、`fixtureSong.ts` のみ）。語彙を増やさずに「曲ごとの振幅係数」を乗せる受け皿として使える。
- `weight: 'light'` に対応するフォントは無く `regular` に落ちる（`fonts.ts:9-24`、`LyricStage.tsx:87`）。Skia は可変フォントを既定インスタンスでしか描けない（`fonts.ts:7-8` のコメント）ので、太さの連続変化はフォント側では不可能。
- ルールベースは entrance / hold を行テキストのハッシュで選ぶ（`ruleBasedDirector.ts:106-111`）。意味との対応は漢字率→明朝、感嘆符・反復→太ゴシック、短い→大きい、だけ。`accent` は 3 回以上繰り返す行のみ（`ruleBasedDirector.ts:91, 125`）。
- `scatter` 連続と `shake` 連続は禁止、`xl` は 3 行まで、書体 2 種まで（`validateDirection.ts:30-32, 110-118`）。

### 1.7 常時表示の作法（`src/display/`）

- `useBurnInDrift` は文字レイヤー全体（`MusicageApp.tsx:106-149` の `Animated.View`。舞台・ワードマーク・操作列を含む）を ±8px、周期 73s / 113s のリサージュで漂わせる（`useBurnInDrift.ts:7-9`）。背景シェーダも同じ View の内側にあるので一緒に漂うが全面塗りなので見えない。
- 画面点灯維持は聴取中のみ（`MusicageApp.tsx:59`）。
- fps の目安は README の実機確認項目「ピルの fps が 55 以上」（`README.md:72`）。`useFrameRate` は UI スレッドの frame callback を数える（`src/dev/useFrameRate.ts`）。

### 1.8 描画ライブラリで確認したこと

- react-native-skia 2.6.2 は任意の props に Reanimated の shared value を直接渡せる（`node_modules/@shopify/react-native-skia/lib/module/sksg/utils.js:2-14` の `isSharedValue`）。`color`、`strokeWidth`、`opacity`、`transform`、`uniforms` すべて対象。
- `Text` は `style="stroke"` と `strokeWidth` を取れる（`dom/types/Common.d.ts:48-50`）。塗りの上に同色のストロークを重ねれば **擬似ボールドの太さを shared value で連続制御**できる。
- 画像フィルタに `Blur`、`Shadow`、`Morphology`、`DisplacementMap`、`RuntimeShader` がある（`renderer/components/imageFilters/`）。`Morphology`（膨張）も太さの代替になる。
- Reanimated 4.5.1 に `interpolateColor` がある（`react-native-reanimated/lib/module/interpolateColor.js`）。色の連続補間を worklet 内でできる。

---

## 2. 設計原則との緊張をどう扱うか

設計書（`docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`）で今回の希望と衝突しうる記述は次の 4 つ。

| # | 記述 | 場所 | 何を禁じているか |
| --- | --- | --- | --- |
| A | 「ペット、実績、共有ボタン、点滅演出など、賑やかな要素を足すこと」 | アンチゴール 1 | **点滅**。ただし §6 で「拍のわずかな明滅」は許している |
| B | 「関係ない行が綺麗に動くこと。同期の確信が無いときは『同期している風』に見せない」 | アンチゴール 2 | 同期の誠実さ。`confidence` が低い間に拍に乗った動きを見せること |
| C | 「音量ではなく拍に乗る」「行の切り替わりと強調が、音量ではなく推定した拍に乗る」 | 意図、ゴール 3 | 音量反応を **主役** にすること（音量を使うこと自体ではない。§3 の `energy` と §6 の `iEnergy` は使っている） |
| D | 「単語単位の同期」「ステージの数を増やす」 | 非ゴール | 語・音節同期をゴールにすること |

本書の階梯の定義:

- **第 1 階梯**: A〜D を守る。振幅を上げ、拍に正確に乗せ、`confidence` でゲートし、音量は拍の「乗り」の味付けに留める。設計書の改定は不要（実装者に任された「パラメータ」の範囲）。
- **第 2 階梯**: A か C を **条件付きで** 緩める。例: 認識確定の瞬間とサビ相当区間だけ強く光る、音量で太さが変わる。設計書に「条件と上限」を追記する。
- **第 3 階梯**: A〜D のいずれかを撤回する。例: 常時の強い明滅、語単位の擬似同期、常時表示の作法の変更。設計書の意図の節から書き直す。

---

## 3. 観点 1: 拍とモーションの振り付け（踊る組版）

### 3.1 拍の情報を UI スレッドに「連続量」として届ける【第 1 階梯・基盤】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 1（作法に触れない。すべての提案の前提） |
| 設計書改定 | 不要 |
| 期待効果 | pulse の減衰が 60ms 階段から毎フレーム連続になり、オンセットから描画までの遅れが React 1 往復分減る。先読み（予備動作）が可能になる |
| 工数 | 小〜中 |
| 触る所 | `src/app/useStageSource.ts`（subscribe 内）、`src/typesetting/useBeatSharedValues.ts`、`src/typesetting/motion.ts`、`src/typesetting/GlyphLayer.tsx` |
| リスク | 無し（shared value への代入は再レンダーを起こさない）。`time` と `nextBeatAtMs` の時計が同じ `performance.now()` 基準であることが前提（1.3 で確認済み） |

案: `useStageSource.ts:103-119` の subscribe コールバック（JS スレッド、50Hz）で、`setBeat` とは別に **拍の「イベント」だけを shared value に直接書く**。

- `lastOnsetAtMs`（pulse が立った時刻）、`nextBeatAtMs`、`periodMs`、`confidence`、`energy`、それに `low` / `mid` / `high` の軽い平滑値。
- worklet 側（`motion.ts`）で `pulse = exp(−(time − lastOnsetAtMs) / 120)`、`phase = 1 − ((nextBeatAtMs − time) / periodMs mod 1)` を **毎フレーム計算**する。エンジンの階段値を写すのをやめ、連続量を導出する。
- `useBeatSharedValues` は「React state を写す」から「subscribe で書かれた値を束ねて返す」役に変わる。`setBeat` による 60ms の再レンダーは行スケジューラ・自動再認識・`bar` 用に残す（これは現状どおり作法の範囲）。

### 3.2 予備動作のある入場【第 1 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 1 |
| 設計書改定 | 不要（§5「入りは行の開始時刻に発火する」「拍への整列 ±80ms」の範囲で、発火の **前** に準備動作を置く） |
| 期待効果 | 行が拍頭に「落ちる」感じが出る。現状の 80ms 遅延による整列が「狙って着地した」ように見える |
| 工数 | 中 |
| 触る所 | `src/sync/lineScheduler.ts`（整列窓を広げるか、`landsAtMs` を `ScheduledLine` に足す）、`src/app/useStageSource.ts`、`src/typesetting/motion.ts`、`src/typesetting/LyricStage.tsx` |
| リスク | 整列窓を広げすぎると歌詞時刻からずれる（設計書 §5 は ±80ms）。先読みは `confidence ≥ 0.5` のときだけにする |

案:

- `scheduleLine` が「前に進む」と判断した時点で、`beat.nextBeatAtMs` が 80ms 以内なら今どおり待つ。さらに、`nextBeatAtMs` が **80〜250ms 先** なら `startedAtMs` は今のまま行を確定し、`landsAtMs = nextBeatAtMs` を併記する（行はすぐ「出始める」が、着地は拍頭）。
- `motion.ts` の `drop` / `rise` は `elapsed` を `time − landsAtMs` に切り替え、負の区間（着地前）を **予備動作** にする: `drop` なら着地前に上で少し縮み（scale 0.96→1.02→1）、`rise` なら沈んでから上がる。バネの式 `1 − e^{−6t}cos(9t)` はそのまま使い、t < 0 の区間に `anticipation(t) = −0.08·sin(π·t/0.25)` を足す。
- `scatter` は設計書どおり **拍位相でずらす**: 文字 i の出現を `landsAtMs + (i / glyphCount)·periodMs·k`（k は 1 または 2 拍）にして、1〜2 拍かけて拍の分割（8 分 / 16 分）で揃って現れる。`SCATTER_STAGGER_MS = 40` の固定ずらしをやめる。

### 3.3 退場の振り付け【第 1 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 1 |
| 設計書改定 | 不要（§5 は退場に触れていない） |
| 期待効果 | 現状の「前の行が即消える」が無くなり、行の交代がワンテンポの動きになる。平沢風の「切り替わり」に最も効く |
| 工数 | 中 |
| 触る所 | `src/typesetting/LyricStage.tsx`（`lineScene` を「現在」と「退場中」の 2 枚持つ）、`src/typesetting/motion.ts`（`exit` の変形）、`src/direction/types.ts` は **触らない**（exit は entrance から決定的に導く: `drop`→下へ落ちる、`rise`→上へ抜ける、`scatter`→散る、`trace`→末尾から消える、`fade`→薄れる、`cut`→即消し） |
| リスク | グリフ数が一時的に 2 行分になる（通常 40 以下。fps への影響は小）。退場を 1 拍以内（≤ 周期）に収めないと次の行と重なる |

### 3.4 滞留を「拍に踊らせる」【第 1 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 1 |
| 設計書改定 | 不要（§5「`pulse` に対してスケールや字間をわずかに動かし」の「わずか」の解釈。倍率は実装者の裁量） |
| 期待効果 | 現状 2〜4% の拡大が、拍頭で「ドン」と見える 6〜10% + 予備縮みになる。`breathe` が小節頭を意識する |
| 工数 | 小 |
| 触る所 | `src/typesetting/motion.ts` のみ |
| リスク | 文字が大きいほど絶対量が増えるので xl は倍率を下げる。`confidence < 0.5` の 0.25 倍ゲートは **残す**（アンチゴール B） |

案（すべて 3.1 の連続 `pulse` / `phase` 前提）:

- `pulse`: `scale = 1 + a·pulse − b·anticipation(phase)` で、拍頭の直前 15% の位相で 2% 縮み、拍頭で a = 0.06（強調 0.10、xl は半分）に跳ねる。字間も `dx = (order − center)·sizePx·0.03·pulse` で拍頭に開く（設計書の「字間」）。
- `breathe`: 2 小節周期は維持し、位相を 3.1 の連続位相に替えて滑らかに。
- `shake`: 60ms 刻みを `phase` の 16 分割に替え、拍に合った震えにする。
- `drift`: `low` の平滑値で振幅を 2〜6px に伸縮（観点 2 と合流）。
- `tempoFeel`（未使用、1.6）を振幅係数に使う: `still` 0.5、`sway` 1.0、`march` 1.3、`drive` 1.6。語彙を増やさず曲ごとの乗りを変えられる。

### 3.5 小節頭の推定と「決め」【第 2 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 2（`bar` の意味を「4 拍ごと」から「推定した小節頭」に変える。設計書 §3「4/4 固定で小節を数える」の精神は保つが、拍エンジンの出力の意味が変わる） |
| 設計書改定 | §3 の `bar` の説明に「`low` の累積から小節頭を推定する」を追記 |
| 期待効果 | 4 拍目の予備動作 → 1 拍目の決め、という「ダンス」が可能になる。`breathe` と idle の揺れが音楽の小節に合う |
| 工数 | 中（拍エンジンのテストを足す） |
| 触る所 | `src/beat/beatEngine.ts`（4 拍周期で `low` のオンセット強度をヒストグラム化し、最大の位相を小節頭にする）、`src/beat/types.ts`（`barPhase` か `barConfidence` を追加） |
| リスク | 3/4 や変拍子で外れる（4/4 固定の前提は設計書どおり）。外れたときは `barConfidence` を低くして 4 拍ごとの現状に落とす |

---

## 4. 観点 2: 音への反応性（グリフの大きさ・太さ・光り・テクスチャが乗る）

### 4.1 実装経路の原則（全階梯共通）

「毎フレーム React を再レンダーしない」（AGENTS.md）と fps 55 以上を守る経路は次の 1 本に絞る。

```
耳 (20ms, JS スレッド)  →  shared value に直接代入（setState しない）
                          →  worklet (useDerivedValue) で毎フレーム補間・導出
                          →  Skia の props / uniforms に shared value として渡す
```

- 代入は `useStageSource.ts` の subscribe 内（1.3）。`rms / low / mid / high` は 20ms 間隔の生値なので、JS 側で 1 次 IIR（立ち上がり速く、立ち下がり遅い「エンベロープ」）にしてから書く。worklet 側でさらに `time` でフレーム補間すれば 20ms の階段も消える。
- 1 フレームの作業量は「グリフ数 × 導出 3 本」+「全画面シェーダ 1 枚」。現状の構成で既に毎フレーム走っているので、導出の中身を増やしても増分は小さい。増えるのは画像フィルタ（ぼかし）だけで、これは 4.4 で扱う。
- 以後の提案は、この経路に乗せる「どの値を、どの描画 prop に」の話に限る。

### 4.2 大きさと字間が `low` に乗る【第 1 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 1（音量は拍の「乗り」の味付け。拍頭の跳ねは `pulse`、その高さを `low` のエンベロープで変える） |
| 設計書改定 | 不要（C は「音量が主役」を禁じるのであって、音量の利用は §3 / §6 で前提にしている） |
| 期待効果 | 静かなパートでは控えめ、ベースが入ると跳ねが大きくなる。自然に「盛り上がり」が出る |
| 工数 | 小 |
| 触る所 | `src/typesetting/motion.ts`（`MotionInput` に `low` を追加）、`src/typesetting/GlyphLayer.tsx`、`src/typesetting/useBeatSharedValues.ts` |
| リスク | `low` の尺度は平方根圧縮済み（1.1）で小音量でも 0.3〜0.5 程度出る。`energy` との差分や 1 秒移動平均との比で正規化しないと常時「大きい」になる |

### 4.3 太さが乗る【第 1 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 1 |
| 設計書改定 | 不要 |
| 期待効果 | 太ゴシック（`gothic-heavy`）の叫び行で、拍頭に文字が「膨らむ」。拡大と違って配置が崩れない |
| 工数 | 小〜中 |
| 触る所 | `src/typesetting/GlyphLayer.tsx`（`<Text>` を 2 枚重ね: 塗り + 同色ストローク。`strokeWidth` を `useDerivedValue` で `sizePx·0.02·pulse·low`） |
| リスク | グリフの描画命令が 2 倍になる（40 → 80）。実機で fps を確認する。明朝でストロークを足すと線が潰れるので `weight === 'bold'` か `gothic-heavy` の行に限る |

### 4.4 光り（グロー）が乗る【第 1 階梯（弱）〜第 2 階梯（強）】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 弱い定常グローは第 1。拍頭だけ強く光るのは **第 2**（「点滅」との境界。基準: 輝度変化が 1 秒に 2 回以上、振幅 20% 超を「点滅」と定義して設計書に書く） |
| 設計書改定 | 第 2 の形では必要（アンチゴール A に「拍頭グローの上限」を追記） |
| 期待効果 | 文字が「発光体」になり、オブジェとしての存在感が出る |
| 工数 | 中 |
| 触る所 | `src/typesetting/LyricStage.tsx`（現在行の `GlyphLayer` を `Group layer` に入れ、`<Blur>` 付きの複製を 1 枚下に置く。強調文字だけなら `GlyphLayer` 内） |
| リスク | **fps**: 画面大のレイヤーに毎フレーム Blur は重い。半径を 6〜10px に抑え、強調文字（最大 3）だけに限定すれば安全。**焼き付き**: 常時グローは明るい面積を増やすので、ドリフトを保ち、`energy` が低い間は消す。**発熱**: 全グリフのグローは避ける |

### 4.5 テクスチャが乗る【第 1 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 1（§6「拍のわずかな明滅・粒子・走査線の揺らぎだけ」の範囲） |
| 設計書改定 | 不要 |
| 期待効果 | 背景が「音に呼吸する」。文字の動きより先に体感に効く |
| 工数 | 小 |
| 触る所 | `src/textures/textureShader.ts`（uniform に `iLow iMid iHigh iConfidence` を追加）、`src/textures/TextureBackground.tsx`（derived uniforms に追加）、4 つの `*.ts` シェーダ |
| リスク | uniform 追加はコスト 0。シェーダ本体の分岐を増やしすぎない。`paper` は既に最重量なので `iLow` でノイズ周波数を変える程度に留める |

シェーダごとの案（いずれも `iPulse` に `iConfidence` を掛けてゲートし、信頼度が低い間は現状より **静かに** する）:

- `grain`: 粒の振幅 0.06 を `0.04 + 0.06·iHigh`。高域（ハイハット・シンバル）で粒が荒れる。
- `paper`: 繊維の伸び `float2(0.006, 0.045)` の y を `iLow` で 0.045 → 0.03 にゆっくり寄せる（紙が「張る」）。
- `scan`: 走査線の暗さ 0.07 を `0.05 + 0.08·iMid`、位相ずれを `iPulse·iConfidence`。
- `void`: 中央の持ち上げ 0.025 を `0.02 + 0.05·iLow·iConfidence`、半径を `iEnergy` で広げる。
- 共通の `col += iPulse·0.04` は `iPulse·iConfidence·0.06` に。

### 4.6 音量で大きさを直接変える【第 3 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 3（C「音量ではなく拍に乗る」の撤回。旧実装の「音量にだけ反応」への回帰） |
| 設計書改定 | 必要（意図の節、ゴール 3） |
| 期待効果 | 拍推定が外れた曲でも何かが動く |
| 工数 | 小 |
| リスク | 設計書が「今の実装は音量にだけ反応している」ことを問題として挙げて作った方針なので、本書は **推奨しない**。4.2 の「拍の跳ねを音量で変える」で同じ体感が得られる |

---

## 5. 観点 3: 歌詞の本編演出

### 5.1 認識確定の「ドロップ」【第 2 階梯（推奨）】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 2（1 曲に 1 回だけ、認識確定から最初の行までの 1〜2 秒に限って強く動く。A の「点滅」ではなく一過性の演出だが、作法の条件付き緩和として明記する） |
| 設計書改定 | §7 に「認識確定の瞬間は、idle 構成が崩れて最初の行に組み替わる 1 回限りの遷移を置く。ラベルは出さない」を追記 |
| 期待効果 | 「曲が分かった」ことが文字の動きだけで伝わる（ラベル禁止のまま状態を表せる） |
| 工数 | 中 |
| 触る所 | `src/app/useStageSource.ts`（`source` が idle → synced に変わった時刻を `StageSource` に持たせる）、`src/typesetting/LyricStage.tsx`（idle グリフを「退場中」として残す）、`src/typesetting/motion.ts`（idle 用の exit: 次の拍頭で散る）、`src/textures/*`（`iDrop` uniform で 1 回だけ背景が暗転→戻る、500ms） |
| リスク | 認識は再認識でも発火する（`useStageSource.ts:139-142` は同じ曲の再錨では前の行を保つ）。**同じ `trackId` の再錨では発火しない** ようにする。暗転は OLED で目立つので 1 回 500ms に限定 |

振り付け案: 認識確定 → idle のグリフが **次の拍頭** まで待ってから散る（3.3 の exit `scatter`）→ 背景が 1 拍だけ沈む → 最初の行が `drop` で着地。最初の行がまだ先なら、曲名・アーティストの caption（`idleComposition.ts:73-78`）が先に `trace` で現れる。

### 5.2 現在行の強調と語・音節単位の「ノリ」【第 1 階梯（行内の文字波）／第 3 階梯（擬似語同期）】

事実: LRCLIB は行頭時刻しか持たず（`src/recognition/lrc.ts:45-57` は行頭時刻を線形に走査して現在行を決めるだけ）、設計書は「単語単位の同期」を非ゴールにしている（D）。

- **第 1 階梯: 行内の「文字波」。** 行の文字列を拍の分割に割り当て、`pulse` を文字順に 1 拍遅れで波として流す（文字 i の pulse 位相を `phase − i/glyphCount`）。歌の進みとは一致しないが「同期している風」ではなく「拍に乗って文字が波打つ」装飾で、B に触れない。工数 小、`motion.ts` のみ。
- **第 1 階梯: 行の経過で強調が移る。** 行の長さ（次行の `startMs − startMs`）が分かるので、行の経過率 0→1 で強調文字（`emphasis`、最大 3）の `accent` 色を順に点す。`GlyphLayer.tsx` の `color` を `useDerivedValue` + `interpolateColor` に変える（1.8）。これは「行単位同期の範囲で、行の中のどこにいるか」を表すだけなので D に触れない。工数 小〜中。`LyricStage.tsx` に `lineEndsAtMs` を渡す。
- **第 3 階梯: 擬似語同期。** 行の文字を行の長さで等分して「今歌っている語」を推定するのは、B（同期している風）と D の双方に反する。推奨しない。やるなら設計書の非ゴールを撤回し、「推定」であることを表現で示す（例: 強調ではなく波の速さに留める）。

### 5.3 サビ相当の盛り上がり検出【第 2 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 2（サビ区間だけ振幅・グロー・パレットの上限を上げる。条件付きの緩和） |
| 設計書改定 | 必要（アンチゴール A に「盛り上がり区間の上限」、§4 の `LineDirection` に `accent` の意味を「サビ相当」と明記） |
| 期待効果 | 曲の構造に合わせた山ができる |
| 工数 | 中 |
| 触る所 | 新規 `src/beat/energyProfile.ts`（`energy` と `low` の 8〜16 小節移動平均と、曲全体の累積分布から「上位 30%」を盛り上がりと判定）、`src/direction/ruleBasedDirector.ts`（反復行 ≥ 2 を `accent` に。現状は ≥ 3）、フェーズ 3 の Claude ディレクターのプロンプト（サビ行に `accent: true`） |
| リスク | 音響だけの判定は遅れる（移動平均の窓分）。歌詞側の `accent`（反復行 = サビの可能性）と **AND** ではなく **OR** で使い、どちらかで立てば上限を上げる。無音からの立ち上がり（曲の冒頭）を誤検出しないよう、`confidence ≥ 0.5` かつ `silence` 明け 8 秒以降に限定 |

### 5.4 ラベルの禁止との関係

本章のどの案も「同期歌詞」等の文字列を描かない。状態は idle 構成の崩れ方（5.1）、強調の移り（5.2）、振幅の上限（5.3）で表す。`MusicageApp.tsx:26-39` の `statusLabel`（MATCHING / LYRICS）はワードマーク横の既存表示で、本書の対象外。

---

## 6. 観点 4: idle の改善

所有者の所見「数字・記号が散らばり、小節ごとに瞬間移動してぐちゃぐちゃ」の原因は 1.4 で特定した 3 つ: (a) 小節ごとの全再抽選 + `cut`、(b) 無音でも進む `bar`、(c) 数字と `ー` の 90° 横倒し。

### 6.1 再配置の頻度と仕方【第 1 階梯・最優先】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 1（§5「小節カウントに合わせて組み替える」の「組み替え」を全再抽選から部分差し替えに解釈し直す） |
| 設計書改定 | 不要 |
| 期待効果 | 「ぐちゃぐちゃ」が消える。置物として一番長く見える画面なので効果は最大 |
| 工数 | 小〜中 |
| 触る所 | `src/typesetting/idleComposition.ts`、`src/typesetting/LyricStage.tsx:221-226, 303-314`、`src/typesetting/motion.ts` |
| リスク | 無し |

案:

- **種を `bar` から「エポック」に変える。** `epoch = floor(bar / 8)`（8 小節 = 120 BPM で 16 秒）で全体構成を決め、`bar % 8` ごとに **1 文字だけ** 差し替える（`pick` の key に `epoch` と slot を使い、`bar` で選んだ 1 スロットのみ文字を引き直す）。配置と個数はエポック内で固定。
- **差し替えは `cut` ではなく `fade` か `rise`** で、3.3 の exit と対にする（消える文字は `fade`、新しい文字は `rise`）。`GlyphLayer` の `lineStartedAtMs` をスロットごとに持てるよう、`PlacedGlyph` に `changedAtMs` を足すか、差し替えスロットだけ別の `GlyphLayer` に分ける。
- **無音中は `bar` を進めない。** 根本は `beatEngine.ts:168-174` を `silence` 判定の後に移すこと（拍エンジンの変更。`ac41d93` の「無音 4 秒で idle に戻す」と整合する）。ただし拍エンジンのテスト（`src/beat/__tests__/beatEngine.test.ts`）に影響するので、まずは `LyricStage.tsx:226` の依存を `beat.silence ? 前回の bar : beat.bar` にして舞台側で止めるのが薄い。
- **横倒しをやめる。** `idleComposition.ts:65` の `rotateDeg` を常に 0 にする（1 文字ずつ格子に置く idle に縦書きの約物規則は要らない）。`idleGlyphs` に漢字（フィクスチャは `夜明暁鼓動0123○△□`）が混ざる場合も同じ。

### 6.2 拍に揺れる idle【第 1 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 1 |
| 設計書改定 | 不要 |
| 期待効果 | 「生きているが散らかっていない」。音楽が鳴っていれば拍に合わせて格子ごとに呼吸する |
| 工数 | 小 |
| 触る所 | `src/typesetting/LyricStage.tsx:311`（`hold` を `pulse` から `breathe` + 格子位相へ）、`src/typesetting/motion.ts` |
| リスク | 静かな部屋では `confidence` が低いので揺れはほぼゼロになる（現状の 0.25 倍ゲート）。それでいい: 無音の idle は **静止**、音があれば揺れる、が置物の作法 |

案: 格子のセル (col, row) から位相オフセットを `(col + row) / 8` にして、`breathe` を波として格子を渡らせる。`pulse` は `low` のエンベロープで 2〜4% の拡大にする。無音中は 6.1 の「`bar` を止める」と合わせて完全に静止させる。

### 6.3 整列と散布のバランス【第 1 階梯】

案: エポックごとに「整列型」と「散布型」を交互にする。整列型は 1 列（中央 3 行）か 1 行（中段 3 列）に揃え、散布型は現状の格子抽選。曲名・アーティストの caption（`idleComposition.ts:73-78`）は常に左下固定でよい（焼き付きはドリフトが担う）。`idleComposition.ts` の `pick('count')` の手前に `pick('mode')` を 1 つ足すだけ。工数 小。

### 6.4 idle を「演奏中」と「無音」で分ける【第 1 階梯】

事実: idle は「未認識」「間奏」「無音」「曲間」を区別しない（`LyricStage.tsx:217`）。`beat.silence` は props で届いている。案: `silence` が真のときは hold を `still`、差し替えを止め、背景の `iPulse` も 0（既に `pulse = 0`、`beatEngine.ts:182`）。音があれば 6.2 の揺れ。認識済みで間奏中（`source.kind === 'idle'` かつ `track !== null`）は caption を少し大きくし、歌詞行の前後行と同じ四隅に置くと「曲の途中」であることが構成で伝わる。

---

## 7. 観点 5: 色とテクスチャのエネルギー

### 7.1 現行の仕組みでできること【第 1 階梯】

- **uniform の追加**（4.5）で `low / mid / high / confidence` をシェーダに渡す。`TextureBackground.tsx:63-74` の `useDerivedValue` に項目を足すだけで、毎フレームのコストは変わらない。
- **`iInk` / `iAccent` の活用。** 既に渡っているが未使用（1.5）。例: `void` の中央持ち上げに `iAccent` を `iLow·iConfidence·0.05` だけ混ぜる。黒地に赤がごく薄く滲む。アンチゴール A の「点滅」ではなく「色味の揺らぎ」に留める（振幅 5% 以下、`energy` の 400ms 追従値に乗せて鋭い変化をさせない）。
- **パレットの切替は曲単位のまま**（`SongDirection.palette`）。フェーズ 3 の Claude ディレクターが曲の意味で決める。これは設計書どおり。

### 7.2 曲のエネルギーでパレットが連続変化する【第 2 階梯】

| 項目 | 内容 |
| --- | --- |
| 階梯 | 第 2（§4「黒白 + 1 色が基本」は守り、1 色の **彩度と面積** を盛り上がりで変える） |
| 設計書改定 | §4 の `palette` に「`accentLow` / `accentHigh` の 2 段階を持てる」か、§6 に「エネルギーで ink と accent を混ぜてよい上限」を追記 |
| 期待効果 | サビで背景が「熱を持つ」 |
| 工数 | 中 |
| 触る所 | `src/direction/types.ts`（palette に省略可能な第 2 アクセント）、`src/direction/validateDirection.ts`、`src/textures/TextureBackground.tsx`（colors を shared value にして worklet で `interpolateColor`）、`src/typesetting/GlyphLayer.tsx`（ink の補間） |
| リスク | **焼き付き**: 背景の平均輝度が上がる時間が長いほど OLED の負担。背景は黒基調を保ち、変えるのは ink と accent。**発熱**: 無し（uniform のみ） |

### 7.3 テクスチャの種類がエネルギーで変わる【第 2 階梯】

案: 曲中で `texture` を切り替えるのではなく、1 つのシェーダ内で `iEnergy` の高低に応じて「粒が走査線に変わる」等のクロスフェードを持つ。`textureShader.ts` のプレリュードに `float blendTextures(...)` を足し、各シェーダの main を 2 つのサブ関数に分ける。設計書 §6「4 種の質感シェーダ」の数は変えないが、各シェーダの見た目の幅を広げるので「質感のみ」の記述を「質感と、その強度」に改定する。工数 中〜大。fps は 2 サブ関数を両方評価するので `paper` では注意。

### 7.4 拍頭で全面が強く光る【第 3 階梯】

アンチゴール A の「点滅」そのもの。設計書を改定して「オブジェではなく照明」に方針転換する場合にだけ検討する。OLED の焼き付きは全面フラッシュでは起きないが、発熱と電池、夜間の眩しさがある。推奨しない。

---

## 8. 観点 6: 段階的な実装計画

### 8.1 優先順位（効果 ÷ 工数）

| 順 | 案 | 階梯 | 効果 | 工数 | 設計書 |
| --- | --- | --- | --- | --- | --- |
| 1 | 6.1 idle の再配置を部分差し替えに、横倒し廃止、無音で止める | 1 | 大（一番見る画面） | 小〜中 | 不要 |
| 2 | 3.1 拍の値を React を通さず連続量で UI スレッドへ | 1 | 大（全部の基盤） | 小〜中 | 不要 |
| 3 | 3.4 + 4.2 滞留の振幅を上げ `low` と `tempoFeel` で変える | 1 | 大 | 小 | 不要 |
| 4 | 4.5 テクスチャに `low / mid / high / confidence` を渡し、pulse をゲート | 1 | 中〜大 | 小 | 不要 |
| 5 | 6.2 idle が拍に揺れる | 1 | 中 | 小 | 不要 |
| 6 | 3.3 退場の振り付け | 1 | 大 | 中 | 不要 |
| 7 | 3.2 予備動作つき入場、`scatter` の拍位相化 | 1 | 大 | 中 | 不要 |
| 8 | 5.2 行内の文字波、強調の移り（色の補間） | 1 | 中 | 小〜中 | 不要 |
| 9 | 4.3 太さ（ストローク）が乗る | 1 | 中 | 小〜中 | 不要 |
| 10 | 5.1 認識確定のドロップ | 2 | 大（本編の第一印象） | 中 | 要 |
| 11 | 5.3 盛り上がり検出 + 4.4 強いグロー + 7.2 パレット補間 | 2 | 大 | 中〜大 | 要 |
| 12 | 3.5 小節頭推定 | 2 | 中 | 中 | 要 |
| 13 | 7.3 テクスチャのクロスフェード | 2 | 中 | 中〜大 | 要 |
| 14 | 4.6 / 5.2 擬似語同期 / 7.4 | 3 | — | — | 要（推奨しない） |

1〜5 を **スライス A（最初の一手）**、6〜9 を **スライス B（踊る組版）**、10〜13 を **スライス C（第 2 階梯、設計書改定を伴う）** とする。スライス A は本編（認識→歌詞）の実機確認を待たずに idle とフィクスチャ曲で検証できる。スライス C は本編の実機所見を見てから設計書を改定して着手する。

### 8.2 最初の一手（スライス A）の実装イメージ

**ねらい。** 2〜3 日で「置物の作法のまま、ノリが体感できる」ところまで。設計書の改定なし。Expo Go でもフィクスチャ曲で確認できる（`low` はメーター経路では `rms` と同値、`mid` / `high` は擬似値だが動作はする）。

**変更ファイルと要点。**

1. `src/typesetting/useBeatSharedValues.ts`
   - `BeatSharedValues` に `lastOnsetAtMs`、`nextBeatAtMs`、`periodMs`、`low`、`mid`、`high` を追加。
   - 「React state を写す hook」から「shared value の束を作って返す hook」に変え、書き込み手段（`write(frame, state)`）を返す。
2. `src/app/useStageSource.ts`
   - `StageInputs` に `beatValues` を追加し、subscribe コールバック（103〜119 行）で `setBeat` の前に `beatValues.write(...)` を **毎フレーム（20ms）** 呼ぶ。`setBeat` の 60ms 間引きはそのまま。
   - `low / mid / high` は 1 次エンベロープ（立ち上がり時定数 20ms、立ち下がり 150ms）で平滑してから書く。
   - 無音中は `bar` を舞台に渡す前に凍結する（`silence` なら前回値）。
3. `src/typesetting/LyricStage.tsx`
   - `beatValues` を props で受ける（`useBeatSharedValues(beat)` の呼び出しを置き換え）。
   - idle の `useMemo` 依存を `beat.bar` から `epoch = floor(bar/8)` と `bar % 8` に分け、`composeIdle` に両方渡す。`entrance` を `"rise"`、`seed` を `epoch` に。
4. `src/typesetting/idleComposition.ts`
   - 種を `epoch` に。`slot = bar % 8` のスロットだけ文字を `fnv1a(\`${epoch}:${bar}:char\`)` で引き直す。`rotateDeg` を常に 0。`pick('mode')` で整列型 / 散布型。
   - `PlacedGlyph` を変えずに済ませるため、差し替えスロットの `index` に `1000 + bar` のような一意値を与え、`GlyphLayer` の `key` が変わることで `rise` が発火するようにする（`lineStartedAtMs` は `LyricStage` から `beat` 公開時刻を渡す）。
5. `src/typesetting/motion.ts`
   - `MotionInput` に `timeMs`、`lastOnsetAtMs`、`nextBeatAtMs`、`periodMs`、`low`、`feel`（`tempoFeel` の係数）を追加。`pulse` と `phase` は入力から導出（連続量）。
   - `pulse` hold: `scale = 1 + (0.06 + 0.06·low)·feel·pulse·damp − 0.02·anticipation(phase)`（強調は 1.6 倍、xl 相当のサイズは 0.5 倍）。
   - `breathe`: 連続位相で滑らかに。`shake`: 16 分割の位相で刻む。`drift`: 振幅 `2 + 4·low`。
   - 既存テスト（`src/typesetting/__tests__/motion.test.ts`）は入力の形が変わるので更新する。
6. `src/typesetting/GlyphLayer.tsx`
   - `useDerivedValue` に新しい shared value を渡すだけ。構造は変えない。
7. `src/textures/textureShader.ts`、`TextureBackground.tsx`、`grain.ts` / `paper.ts` / `scan.ts` / `void.ts`
   - uniform `iLow iMid iHigh iConfidence` を追加。4.5 の式に変更。共通の `iPulse·0.04` を `iPulse·iConfidence·0.06` に。
8. `src/direction/types.ts` は **触らない**。`tempoFeel` の係数表は `motion.ts` に置く。

**検証方法。**

- 単体テスト: `motion.test.ts` に「`lastOnsetAtMs` から 120ms で pulse が 1/e」「拍頭直前 15% で負の予備動作」「`confidence < 0.5` で 0.25 倍」「無音で idle の bar が凍る」「idle の差し替えは 1 小節に 1 スロットだけ」「`rotateDeg` が常に 0」を追加。`idleComposition.test.ts` の既存テストは種の意味が変わるので書き直す。`npm test -- --watchman=false` と `npm run typecheck` を通す。
- Expo Go（フィクスチャ）: `FIX` ピルの fps が 55 以上。idle が 8 小節に 1 文字ずつ変わる。フィクスチャ曲で hold の跳ねが目視で分かる。
- 実機（Development Build）: 実曲で (1) 静かな部屋の idle が静止している、(2) 曲を鳴らすと idle が拍で呼吸し 1 文字ずつ差し替わる、(3) 背景の明滅が拍に合い、信頼度が低い間は弱い、(4) fps 55 以上、(5) 10 分放置で発熱が気にならない。結果は `docs/superpowers/reports/` に記録する。
- 焼き付き: スライス A は明るい面積を増やさない（グローなし）。`useBurnInDrift` は無変更。

---

## 9. 設計書の改定が必要な提案の一覧

| 提案 | 階梯 | 衝突する記述 | 改定の内容 |
| --- | --- | --- | --- |
| 4.4 拍頭の強いグロー | 2 | アンチゴール「点滅演出」 | 「点滅」の定義（1 秒に 2 回以上かつ振幅 20% 超）と、拍頭グローの上限（半径・振幅・対象文字数）を追記 |
| 5.1 認識確定のドロップ | 2 | §7「同期できないときは idle 組版に落ちることで状態を表す」（状態表現の方法） | §7 に「認識確定は 1 回限りの遷移で表す。同じ trackId の再錨では発火しない」を追記 |
| 5.3 盛り上がり検出 | 2 | アンチゴール「点滅」、§4 `accent` の意味 | 盛り上がり区間で許す上限（振幅・グロー・色）と、`accent` を「サビ相当」と明記 |
| 3.5 小節頭推定 | 2 | §3「4 拍ごとに増える小節カウント（4/4 仮定）」 | `bar` の定義を「推定した小節頭から数える。推定できない間は 4 拍ごと」に |
| 7.2 パレットの連続変化 | 2 | §4「黒白 + 1 色が基本」、§6「色は `palette` のみ」 | `palette` に第 2 アクセントを許す、または ink / accent の補間上限を §6 に追記 |
| 7.3 テクスチャのクロスフェード | 2 | §6「質感のみ」「4 種」 | 「4 種は維持し、各種の中でエネルギーに応じた幅を持つ」に |
| 4.6 音量で大きさを直接変える | 3 | 意図「音量ではなく拍に乗る」、ゴール 3 | 推奨しない。やるなら意図の節を書き直す |
| 5.2 擬似語同期 | 3 | 非ゴール「単語単位の同期」、アンチゴール「同期している風」 | 推奨しない |
| 7.4 拍頭で全面が光る | 3 | アンチゴール「点滅」 | 推奨しない |

第 1 階梯の提案（3.1〜3.4、4.2〜4.3、4.5、5.2 の文字波と強調の移り、6.1〜6.4、7.1）はいずれも設計書の「実装者に任せること」（拍エンジンのパラメータ、質感シェーダの見た目）と §5 の「わずか」の解釈の範囲にあり、改定は不要。

---

## 10. 補足: 分析中に見つけた、ノリと別に直した方がよい点

本書の対象外だが、スライス A で同じファイルを触るので記しておく。

- `beatEngine.ts:168-174`: 位相更新が無音判定の前にあり、無音でも `bar` が進む（6.1）。拍エンジン側で直す方が筋がよいが、テストの前提が変わる。
- `idleComposition.ts:65`: 数字と `ー` の 90° 回転（6.1）。
- `useBeatSharedValues.ts:27-33`: `useEffect` 経由の写しは 1 レンダー分遅れる。3.1 で解消。
- `MusicageApp.tsx:73-86`: 自動再認識の effect が `stage.beat` の参照変化（60ms）ごとに走る。`silence` と `pastOutro` だけを依存にすれば十分。
- `TextureBackground.tsx:44`: `time` は 3600 秒で巻き戻る。`grain` は `fract(iTime)` なので連続だが、`iTime` を低周波で使う案（7.1）を足すときは巻き戻りの瞬間に跳ねないよう周期を 3600 の約数にする。
