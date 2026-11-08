# MUSICAGE「ノリ」改善 実装計画（拍の配線・踊る組版・第 2 階梯の演出）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拍と音響特徴が描画に届く経路を連続量に直し（段階 1)、行の入退場と滞留を拍で振り付け（段階 2)、所有者決定で正式に認められた第 2 階梯の演出（認識確定のドロップ／小節頭推定／盛り上がり検出とグロー・パレット／テクスチャのクロスフェード）を依存順に入れる（段階 3〜6)。

**Architecture:** 耳フレーム（20ms、JS スレッド）を受けたら React の state とは別に shared value へ直接書き、worklet（UI スレッド）が毎フレーム `pulse` / `phase` などの連続量を導出して Skia の props / uniforms に渡す、という 1 本の経路に統一する。その上に組版（idle・入退場・滞留）の振り付けと、背景シェーダーの uniform 拡張を積む。第 2 階梯は、認識の状態遷移（ドロップ）、拍エンジンの小節頭推定、盛り上がり判定（音響プロファイル＋ `accent` 行）の 3 つの新しい「意味」を既存の経路へ流す形で実装する。

**Tech Stack:** Expo SDK 57 / React Native 0.86 / TypeScript / react-native-skia 2.6.2 / react-native-reanimated 4.5.1 / Jest

**Spec:** `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（以下「設計書」。2026-11-07 改定済み）。分析: `docs/superpowers/reports/2026-11-07-groove-analysis.md`（以下「groove 分析」。§番号は同書のもの）。

## 前提

- 設計書は 2026-11-07 の所有者決定により改定済みである（改定履歴と各節の「（2026-11-07 改定）」注記を参照）。段階 3〜6 はこの改定が前提で、改定範囲を超える演出は入れない。
- 段階 1・2 は第 1 階梯（もともと設計書の改定不要）だが、実施は本計画の順序に従う。
- 各段階は独立にレビュー・マージできる単位とする。段階の途中で止めても、それまでの段階だけで成立する（退行しない）ことを各段階の受け入れ条件にする。
- 実装はテスト先行（AGENTS.md「設計と記録の流れ」）。失敗するテストを先に書き、失敗を確かめてから実装する。

## Global Constraints

- **第 3 階梯を入れない**（設計書のアンチゴール・非ゴールで引き続き禁止）: 音量そのもので文字の大きさを直接変えること／行内の文字位置から「今歌っている語」を推定して見せる擬似的な語・音節単位の同期／拍頭で全面が強く光るフラッシュ。
- 音声を端末の外に送らない。ネイティブ → JS のイベントに音声バッファや ShazamKit の生オブジェクトを入れない。
- 実在曲の歌詞本文をリポジトリに入れない。テスト用の歌詞は架空のものにする。
- 「同期歌詞」などのラベルを描かない。同期の確信が無いときは行を追わず idle 構成に落ちる。
- 毎フレーム React を再レンダーしない。拍の React 公開（行スケジューラ・自動再認識・`bar` 用）は現状の間引きのままにする。
- `confidence < 0.5` の間は拍由来の動きを弱めるゲートを残す（アンチゴール「同期している風に見せない」）。
- 常時表示の作法を保つ: 画面点灯維持、`useBurnInDrift` の焼き付き回避ドリフトは無変更。明るい面積を常時増やさない。
- 目安は README の実機確認項目どおり fps 55 以上。重い処理（Blur、シェーダの二重評価）を足す段階では必ず fps を測る。
- 同梱フォント・書体の語彙（`src/direction/types.ts` の閉じた選択肢）は、段階 5 の `palette.accentHigh` 追加を除いて増やさない。

---

## 段階 1: スライス A（拍の連続量配線＋idle 再配置＋hold 振幅＋テクスチャ uniform 拡張）

groove 分析 §8.1 の優先順位 1〜5、§8.2 の実装イメージに対応。第 1 階梯。

### 範囲

- [ ] 耳フレームを shared value に直接書き、worklet で `pulse` / `phase` を連続量として導出する（分析 3.1)。
- [ ] idle の再配置を「小節ごとの全再抽選＋cut」から「8 小節のエポックで構成固定＋1 小節に 1 文字だけ `rise` で差し替え」に変え、横倒し（`rotateDeg` 90）を廃止し、無音中は舞台側で `bar` を凍結する（分析 6.1)。エポックごとに整列型／散布型を選ぶ（分析 6.3)。
- [ ] idle が拍に揺れる（格子の位相オフセットで `breathe` の波、`low` エンベロープで 2〜4% の拡大）。無音では静止する（分析 6.2、6.4)。
- [ ] hold の振幅を上げ、`low` のエンベロープと未使用だった `tempoFeel` の係数で曲ごとに変える（分析 3.4、4.2)。
- [ ] テクスチャの uniform に `iLow / iMid / iHigh / iConfidence` を追加し、シェーダ 4 種の拍反応を信頼度でゲートする（分析 4.5)。

### 触るファイルの当たり

- `src/typesetting/useBeatSharedValues.ts` — `BeatSharedValues` に `lastOnsetAtMs`、`nextBeatAtMs`、`periodMs`、`low`、`mid`、`high` を追加。「state を写す hook」から「shared value の束と書き込み手段（`write`）を返す hook」へ。
- `src/app/useStageSource.ts` — `StageInputs` に `beatValues` を追加。subscribe コールバックで `setBeat` の前に毎フレーム（20ms)`write` を呼ぶ。`low / mid / high` は 1 次エンベロープ（立ち上がり 20ms、立ち下がり 150ms）で平滑してから書く。無音中は `bar` を前回値に凍結して舞台へ渡す。
- `src/typesetting/LyricStage.tsx` — `beatValues` を props で受け、idle の `useMemo` 依存を `epoch = floor(bar/8)` と `bar % 8` に分ける。`entrance` を `"rise"`、`seed` を `epoch` に。
- `src/typesetting/idleComposition.ts` — 種を `epoch` に。差し替えスロットだけ文字を引き直す。`rotateDeg` を常に 0。`pick('mode')` で整列型／散布型。`PlacedGlyph` の形は変えず、差し替えスロットの `index` に一意値を与えて `GlyphLayer` の `key` 変化で `rise` を発火させる。
- `src/typesetting/motion.ts` — `MotionInput` に `timeMs`、`lastOnsetAtMs`、`nextBeatAtMs`、`periodMs`、`low`、`feel`（`tempoFeel` 係数： still 0.5 / sway 1.0 / march 1.3 / drive 1.6）を追加し、`pulse` と `phase` を入力から導出する。`pulse` hold は `(0.06 + 0.06·low)·feel·pulse` を基本に拍頭直前の予備縮みを引く（強調 1.6 倍、xl 相当は 0.5 倍）。`breathe` は連続位相、`shake` は位相の 16 分割、`drift` の振幅は `2 + 4·low`。
- `src/typesetting/GlyphLayer.tsx` — `useDerivedValue` に新しい shared value を渡すだけ（構造は変えない）。
- `src/textures/textureShader.ts`、`src/textures/TextureBackground.tsx`、`src/textures/grain.ts` / `paper.ts` / `scan.ts` / `void.ts` — uniform 追加と分析 4.5 の式への変更。共通の `iPulse·0.04` は `iPulse·iConfidence·0.06` に。
- `src/direction/types.ts` は触らない。

### 追加・変更するテスト

- `src/typesetting/__tests__/motion.test.ts` — 入力の形の変更に合わせて更新し、次を追加: 「`lastOnsetAtMs` から 120ms で `pulse` が 1/e に減衰する」「拍頭直前 15% の位相で負の予備動作が出る」「`confidence < 0.5` で拍由来の量が 0.25 倍」「`feel` 係数で振幅が変わる」。
- `src/typesetting/__tests__/idleComposition.test.ts` — 種の意味が変わるので書き直し: 「同じエポック内では配置と個数が固定」「1 小節で差し替わるのは 1 スロットだけ」「`rotateDeg` が常に 0」。
- `useStageSource` のテスト（既存の置き場に合わせる） — 「無音が続くと舞台へ渡る `bar` が凍結する」「`write` が `setBeat` の間引きと独立に毎フレーム呼ばれる」。
- テクスチャの uniform 構成テスト（既存の置き場に合わせる） — `iLow / iMid / iHigh / iConfidence` が宣言と derived の両方に揃っていること。
- `npm test -- --watchman=false` と `npm run typecheck` を通す。

### 実機で確かめること

- 静かな部屋で idle が静止している（跳ばない、差し替わらない）。
- 音楽を鳴らすと idle が拍で呼吸し、1 小節に 1 文字ずつ差し替わる。数字が横倒しで出ない。
- フィクスチャ曲・実曲で hold の跳ねが目視で分かる。背景の明滅が拍に合い、信頼度が低い間は弱い。
- Expo Go（フィクスチャ）の `FIX` ピルと実機で fps 55 以上。
- 10 分放置で発熱が気にならない。進捗は `docs/superpowers/reports/` に記録する。

### 前提

- 設計書の改定は不要な範囲（第 1 階梯）。以降すべての段階の土台になるので、単独で先にマージする。

---

## 段階 2: スライス B（退場の振り付け＋予備動作つき入場＋行内の文字波と強調の移り＋太さ）

groove 分析 §8.1 の優先順位 6〜9。第 1 階梯。

### 範囲

- [ ] 退場の振り付け: 行交代で前の行が即消えせず、entrance から決定的に導いた exit（`drop`→下へ落ちる、`rise`→上へ抜ける、`scatter`→散る、`trace`→末尾から消える、`fade`→薄れる、`cut`→即消し）で 1 拍以内に退場する（分析 3.3)。
- [ ] 予備動作つき入場: 次の拍頭が 80〜250ms 先なら行を確定しつつ `landsAtMs` を併記し、着地前に予備動作（縮み・沈み）を入れる。`scatter` の文字ずらしを固定 40ms から拍位相ベース（1〜2 拍を 8 分／16 分で割る）に変える（分析 3.2)。
- [ ] 行内の文字波: `pulse` の位相を文字順にずらして波を流す（歌の進みとは一致させない。装飾として）。行の経過率 0→1 で強調文字の `accent` 色を順に点す（分析 5.2 の第 1 階梯分）。
- [ ] 太さが乗る: `weight` が太い行（`bold`／`gothic-heavy`）に限り、グリフを塗り＋同色ストロークの 2 枚重ねにし、`strokeWidth` を `pulse·low` で連続制御する（分析 4.3)。

### 触るファイルの当たり

- `src/typesetting/LyricStage.tsx` — `lineScene` を「現在行」と「退場中」の 2 枚持ちに。`lineEndsAtMs`（次行の `startMs`）を `GlyphLayer` へ渡す。
- `src/typesetting/motion.ts` — `exit` の変形を追加。entrance の `elapsed` を `time − landsAtMs` に切り替え、負の区間に `anticipation` を足す。文字波の位相ずらし。
- `src/sync/lineScheduler.ts` — `ScheduledLine` に `landsAtMs` を追加（拍頭が 80ms 以内は従来どおり待つ。80〜250ms 先なら即確定＋`landsAtMs` 併記）。歌詞時刻からのずれは設計書 §5 の ±80ms の考え方を守り、先読みは `confidence ≥ 0.5` のときだけ。
- `src/app/useStageSource.ts` — `landsAtMs` の受け渡し。
- `src/typesetting/GlyphLayer.tsx` — `color` を `useDerivedValue` ＋ `interpolateColor` に変更（強調の移り）。ストローク重ねは太い行だけに限定。
- `src/direction/types.ts` は触らない（exit は entrance から導く）。

### 追加・変更するテスト

- `src/typesetting/__tests__/motion.test.ts` — exit 変形が entrance 種別ごとに期待どおり（方向・1 拍以内に収束）。予備動作区間（`elapsed < 0`）で scale が 1 を下回る。文字波で文字ごとの位相が単調にずれる。
- `src/sync/__tests__/lineScheduler.test.ts`（既存の置き場に合わせる） — 拍頭が 80ms 以内なら待つ、80〜250ms 先なら `landsAtMs` が付く、250ms より先なら付かない、`confidence < 0.5` では先読みしない。
- `GlyphLayer` のテスト — ストローク重ねが `bold`／`gothic-heavy` の行だけに付くこと。
- `npm test -- --watchman=false` と `npm run typecheck` を通す。

### 実機で確かめること

- 行の交代で前の行が即消えせず、ワンテンポで入れ替わる。
- 行が拍頭に「着地」する感触がある。強調色が行の経過に沿って移る。
- 太ゴシックの叫び行で拍頭に文字が膨らむ。グリフ描画が 2 倍になる影響で fps 55 を割らない（実機で測る）。

### 前提

- 段階 1 の連続量（`pulse` / `phase` の導出と `landsAtMs` の土台になる `nextBeatAtMs` の共有）が入っていること。
- 設計書の改定は不要な範囲（§5 の入りの記述と「わずか」の解釈の内側）。

---

## 段階 3: 認識確定の「ドロップ」（第 2 階梯）

groove 分析 5.1、§8.1 の優先順位 10。

### 範囲

- [ ] 認識が確定した瞬間に 1 回限り、idle グリフが次の拍頭で散って退場し、背景が 1 拍だけ沈み、最初の行が `drop` で着地する遷移を置く。曲名・アーティストの caption が先行する場合は `trace` で出す。
- [ ] 同じ `trackId` の再錨（再認識で同じ曲）では発火しない。別の曲では発火する。
- [ ] ラベルは出さない。長さは 1〜2 秒以内（設計書 §7 の条件）。

### 触るファイルの当たり

- `src/app/useStageSource.ts` — `source` が idle → synced に変わった時刻（ドロップの発火時刻）を `StageSource` に持たせる。前回の `trackId` を覚えて再錨判定をする。
- `src/typesetting/LyricStage.tsx` — idle グリフを段階 2 の「退場中」機構に乗せて残す。
- `src/typesetting/motion.ts` — idle 用の exit（次の拍頭で `scatter` 相当に散る）。
- `src/textures/textureShader.ts`、`src/textures/TextureBackground.tsx` — `iDrop` uniform を追加し、発火から 500ms だけ背景を暗転→復帰させる。

### 追加・変更するテスト

- `useStageSource` の遷移テスト — idle → synced で発火時刻が立つこと、同じ `trackId` の再錨では立たないこと、別 `trackId` では立つこと、synced → idle では立たないこと。
- `motion` のテスト — idle exit が次の拍頭まで待ってから散ること。
- `npm test -- --watchman=false` と `npm run typecheck` を通す。

### 実機で確かめること

- 実曲で「曲が分かった」ことが文字の動きだけで伝わる（ラベルなし）。
- 同じ曲の再認識（針の上げ直し等）でドロップが再発火しない。
- 認識が外れた直後の再認識など、短い間隔で発火が連続しない。

### 前提

- 設計書 §7 の改定（2026-11-07）が済んでいること（本計画の前提として完了済み）。
- 段階 2 の退場機構を流用する。段階 4（小節頭推定）とは独立に進められる。

---

## 段階 4: 小節頭の推定（第 2 階梯）

groove 分析 3.5、§8.1 の優先順位 12。

### 範囲

- [ ] 拍エンジンが 4 拍周期で `low` のオンセット強度を位相ごとに累積し、最も強い位相を小節頭として `bar` を数え直す。推定の信頼は `barConfidence` で出す。信頼が低い間は従来の 4 拍カウントに落とす。
- [ ] `breathe`（2 小節周期）と idle の揺れが推定した小節に合うようになる（使う側の変更は、位相の参照先を揃える範囲に留める）。

### 触るファイルの当たり

- `src/beat/beatEngine.ts` — 小節頭ヒストグラムの累積と位相決定、`bar` の増やし方の切り替え。
- `src/beat/types.ts` — `BeatState` に `barConfidence: number` を追加（設計書 §3 の出力定義と一致させる）。
- 影響範囲の確認: `bar` の消費者（`idleComposition` のエポック計算、`Ornaments` の `numeral`、`motion` の `breathe`）で、位相がずれても破綻しないこと。

### 追加・変更するテスト

- `src/beat/__tests__/beatEngine.test.ts` — 合成した `EarFeatures` 列（ダウンビートだけ強いオンセットを持つ 4/4 のクリック列）で小節頭の位相が推定できること。推定材料が無い入力（等間隔で強さ一定など）では `barConfidence` が 0 で従来カウントになること。3/4 風の入力でも暴走しないこと（4/4 固定の前提どおり、信頼が下がるだけ）。
- 受け入れ条件 2（拍エンジンの ±3 BPM 追従）の既存テストが引き続き通ること。
- `npm test -- --watchman=false` と `npm run typecheck` を通す。

### 実機で確かめること

- 4/4 の実曲で `breathe` と idle の揺れが小節に合って感じる。
- 小節頭が外れる曲でも、違和感が従来（4 拍カウント）より悪化しない。

### 前提

- 設計書 §3 の改定（2026-11-07）が済んでいること（完了済み）。
- 段階 1 で `bar` の消費側（エポック、凍結）の形が固まっていること。段階 3 とは独立。

---

## 段階 5: 盛り上がり検出＋強いグロー＋パレットの連続変化（第 2 階梯）

groove 分析 5.3、4.4、7.2、§8.1 の優先順位 11。

### 範囲

- [ ] 盛り上がり検出: `energy` と `low` の 8〜16 小節の移動平均と曲全体の累積分布から「上位 30%」の区間を盛り上がりとする。歌詞側の `accent` 行（反復 ≥ 2）と OR で使う。ガード: `confidence ≥ 0.5`、無音明け 8 秒以降でのみ判定する。
- [ ] 強いグロー: 盛り上がり区間と拍頭に限り、強調文字（最大 3）だけにぼかし複製のグローを強く出す（半径 10px 以下、設計書 §5 の上限内）。通常区間では段階的に対象外とする（弱い定常グローは置かない）。
- [ ] パレットの連続変化: `palette` に任意の第 2 アクセント `accentHigh` を持てるようにし、盛り上がりに応じて `ink`／`accent` を worklet で連続補間する。背景の黒基調と平均輝度は変えない。

### 触るファイルの当たり

- 新規 `src/beat/energyProfile.ts`（置き場は実装時に拍エンジン側か app 側か決める） — 移動平均と累積分布、盛り上がりの真偽と強さ（0..1）を出す純関数群。
- `src/direction/ruleBasedDirector.ts` — `accent` の条件を反復行 ≥ 3 から ≥ 2 に（設計書 §4 の「サビ相当」の定義に合わせる）。フェーズ 3 の Claude ディレクター側のプロンプト変更はフェーズ 3 の計画で扱い、本段階では触らない。
- `src/direction/types.ts` — `SongDirection.palette` に `accentHigh?: string` を追加。
- `src/direction/validateDirection.ts` — `accentHigh` の検証（色形式、未指定は可）。
- `src/typesetting/LyricStage.tsx` — 現在行の強調文字だけを対象に、`<Blur>` 付き複製を下に置くグロー層を追加。半径と不透明度は shared value で拍頭に連動。
- `src/textures/TextureBackground.tsx` — palette の色を shared value 化し、worklet で `interpolateColor` して uniforms に渡す。
- `src/typesetting/GlyphLayer.tsx` — `ink` の補間を受ける（段階 2 の色補間の経路を流用）。

### 追加・変更するテスト

- `energyProfile` の単体テスト — 上位 30% の判定、窓の長さでの遅れ、無音明け 8 秒未満では立たない、`confidence < 0.5` では立たない、曲の冒頭（累積が浅い間）で誤検出しない。
- `validateDirection` のテスト — `accentHigh` が正しい色なら通る、壊れた色なら落ちる、未指定でも通る。
- ルールベースのテスト — 反復 2 回の行が `accent` になること。
- `npm test -- --watchman=false` と `npm run typecheck` を通す。

### 実機で確かめること

- サビでグローと色の彩度が上がり、A メロに戻ると通常の上限に戻る。
- グローを足しても fps 55 以上（Blur は強調文字だけに限定されていること）。
- 10 分放置で発熱と焼き付きの懸念が増えない（ドリフトは無変更、背景の平均輝度は不変）。

### 前提

- 設計書のアンチゴール（「点滅」の定義と条件付き緩和）、§4（`accent` の意味と `accentHigh`)、§5（グローの上限）の改定（2026-11-07）が済んでいること（完了済み）。
- 段階 1（uniform と連続量の経路）と段階 2（色の補間経路）が入っていること。

---

## 段階 6: テクスチャのクロスフェード（第 2 階梯）

groove 分析 7.3、§8.1 の優先順位 13。

### 範囲

- [ ] 質感の種類（4 種）は変えず、各シェーダーの内部で `iEnergy` の高低に応じた見た目の幅を持たせる（例: 粒が走査線に寄る、紙の繊維の張りが変わる等、シェーダごとに 2 つの表情をクロスフェード）。
- [ ] 色の扱いは段階 5 の補間の範囲に留め、背景の平均輝度は変えない。

### 触るファイルの当たり

- `src/textures/textureShader.ts` — プレリュードにブレンド用の共通関数を足す。
- `src/textures/grain.ts` / `paper.ts` / `scan.ts` / `void.ts` — 各 main を 2 つのサブ関数に分け、`iEnergy` で混ぜる。`paper` は fbm3 + vnoise が最重量なので、2 サブ関数の両方評価で fps を割らないか最初に当たりを付ける（割る場合は早期分岐で片方だけ評価する形にする）。

### 追加・変更するテスト

- テクスチャのテスト（既存の流儀に合わせる） — プレリュードにブレンド関数が含まれること、各シェーダが `iEnergy` の両端で破綻しない式になっていること（uniform 宣言と使用の整合）。
- `npm test -- --watchman=false` と `npm run typecheck` を通す。シェーダの実描画は単体テストでは保証できないので、未検証分は実機確認に回す旨を進捗に書く。

### 実機で確かめること

- 曲のエネルギーの高低で質感がなめらかに変わり、切り替わりが「切り替わった」と分からない。
- 4 種すべてで fps 55 以上（特に `paper`)。
- 静かな曲では従来と見分けがつかない程度に大人しい。

### 前提

- 設計書 §6 の改定（2026-11-07）が済んでいること（完了済み）。
- 段階 1 の uniform 拡張（`iEnergy` の渡し方を含む）が入っていること。

---

## 進め方のまとめ

1. 段階 1 → 段階 2 を先に通し、「作法のままノリが出る」状態を実機で所有者が見る。
2. 段階 3（ドロップ）と段階 4（小節頭推定）は互いに独立。実機所見を見て順序を入れ替えてよい。
3. 段階 5 → 段階 6 は第 2 階梯の後半。段階 5 の実機所見（グローと色の品）を見てから段階 6 に進む。
4. 各段階の終わりに `docs/superpowers/reports/2026-11-03-phase2-progress.md` へ実施内容・テスト結果・実機確認項目を追記する。
