# MUSICAGE 見た目の大改修 設計（2026-11-09）

## 状態

設計（2026-11-09 に所有者の開始指示を受け、A〜F を実装に進める。G は実機所見後）。設計時点ではアプリのコードは変更していない。実コードはブランチ `feat/visual-overhaul`（`master` の `c2e33bb`、PR #6 マージ後）時点を読んだ。前提は現行設計書 `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（2026-11-07 改定込み、以下「設計書」）と groove 分析 `docs/superpowers/reports/2026-11-07-groove-analysis.md`。groove の 6 段階と idle の構造化は実装・マージ済みで、TestFlight ビルド 7 まで配信されている。

本書は「見た目の質・存在感・完成度」だけを扱う。認識・同期・拍・動きの語彙（entrance / hold / exit）は触らない。

## 0. 要約

- **診断。** 相棒の 6 点はすべて実コードで裏が取れた。数値で言うと、背景は sRGB 8bit で地が 11/255、質感の振幅は 1〜2 階調（紙・走査線はスクショで識別不能）、四隅のビネットは 2 階調。一方で全面の拍リフトだけは +15 階調あり、**今の画面で最も大きな輝度変化は「黒地の上の弱い全面フラッシュ」**になっている。色は全曲 `DEFAULT_PALETTE` 固定で、accent 色が出るのは accent 行の強調 1 文字がその行の後半で赤に移るときだけ。文字は単色ベタ塗り、クロームは 8 つの独自色とシステムフォント。
- **コンセプト。** 「**灯下の一枚刷り**」。画面を「黒い虚空」ではなく「暗い部屋で一灯に照らされた、一枚の刷り物（ポスター）」として組む。面（素材）・灯（光だまり）・墨（文字の身体）・欄外（クローム）の 4 つを、曲ごとのパレット 1 つから導く。所有者が「大幅に良くなった」と感じる条件を、(1) 画面が物体に見える、(2) 曲が変わると部屋の色が変わる、(3) 文字に身体と焦点がある、(4) UI が同じ刷り物の欄外に見える、の 4 つに言語化し、それぞれに数値目標を置いた。
- **段階。** 7 段階（A 色システム → B 面と灯 → C 墨の身体と焦点 → D 欄外の構図とオーナメント → E idle の刷り物化 → F クロームの統一 → G 実機所見による数値調整）。各段階が独立にテスト・実機確認でき、段階ごとに「何が変わって見えるか」を一行で言える。A〜E は Expo Go のフィクスチャでも確認できる。
- **守るもの。** 点滅の定義（1 秒 2 回以上 × 振幅 20% 超）、拍頭の全面フラッシュ禁止、音量で大きさを変えない、擬似語同期をしない、ラベルを描かない、テクスチャ 4 種・書体 6 種・1 曲 2 書体、毎フレーム React 再レンダー禁止、焼き付きドリフトと画面点灯維持。本設計は現行の拍リフトを **弱める**（全面 +15 階調 → 光だまり内だけ +5 階調以下）ので、点滅の定義に対しては今より安全側になる。

---

## 1. 現状診断（実コードで検証）

値はすべて sRGB 8bit（iPhone のスクリーンショットのピクセル値と同じ尺度）。計算は `DEFAULT_PALETTE.background = #0B0B0C`（`src/direction/types.ts:43`）= 11/255 ≈ 0.043 を地にしている。

### 1.1 背景は実質まっ黒で平坦（相棒の診断 1: 正しい。補強あり）

| 要素 | 式（根拠） | 8bit での見え方 |
| --- | --- | --- |
| 地 | `iBackground` = 0.043 | 11/255。OLED ではほぼ消灯 |
| grain（既定・ルールベースは常にこれ） | `(hash − 0.5) × (0.04 + 0.06·iHigh)` を **加算**（`src/textures/grain.ts:17, 26`） | 振幅 ±5〜±13 階調。地が 11 なので **下半分が 0 でクリップ**し、「黒地に白ゴマ」の非対称な粒になる |
| paper | `iBackground × (0.95 + fibre·0.08 + mottle·0.03)`（`paper.ts:25, 33`） | 乗数 0.95〜1.06 → 10.5〜11.7。**差が 1.2 階調未満**で識別不能 |
| void | `+ (0.02 + 0.05·iLow·iConf)`、lively は `+ (0.048 + 0.12·iLow·iConf)`（`void.ts:17-18, 25-26`） | 中心 +5〜+18 階調（calm）、最大 +43（lively・大音量）。4 種で唯一見える |
| scan | `× (1 − dark·(0.05 + 0.08·iMid))`（`scan.ts:23, 30`） | 線の暗さ 0.5〜1.4 階調。識別不能 |
| ビネット | `1 − smoothstep(0.3, 0.85, d) × 0.18`（`textureShader.ts:96-100`） | 四隅 ×0.82 → 9/255。2 階調。「額縁」にならない |
| 拍リフト | `col += iPulse·iConfidence·0.06`（4 シェーダ共通、`grain.ts:33` ほか） | 拍頭で **全面 +15 階調**、120ms で減衰。相対では +140% |
| ドロップ | `dropDip`（`textureShader.ts:163-168`） | 1 回限り。問題なし |

補強:

- stage 6 の「平均輝度を動かさない」（`textureShader.ts:40-44` のコメント、進捗記録の段階 6 判断 4）は calm / lively の **交差時** に平均を保つ規則として正しいが、その平均の絶対値が 11/255 では何を載せても見えない。原因は「振幅」ではなく **「地の明るさ」と「加算 vs 乗算」** にある。
- `iInk` / `iAccent` は uniform として毎フレーム渡されている（`TextureBackground.tsx:130-131`）が、**4 シェーダのどれも読んでいない**（`textureShader.ts:35-37` のコメントどおり）。段階 5 のパレット連続変化は背景に一切届いていない。
- 今の画面で一番大きな輝度の時間変化は全面の拍リフトで、信頼度 ≥ 0.5 のとき毎オンセット +15 階調。点滅の定義（振幅 20% 超）を相対値で読めば超えている（絶対値では小さい）。設計書 §6 の「わずかな明滅」の範囲にはあるが、「黒地の上で全面が薄く光る」のは新設計では **光だまり内に局所化して弱める**。

### 1.2 色が固定（相棒の診断 2: 正しい。補強あり）

- `directSongByRules` は `palette: { ...DEFAULT_PALETTE }`、`texture: 'grain'`、`tempoFeel: 'sway'` を **無条件に** 返す（`src/direction/ruleBasedDirector.ts:134-140`）。Claude ディレクター（フェーズ 3）は未実装なので、実曲はすべて黒 / 生成り `#F2EFE6` / 赤 `#D7263D` / 質感 grain。フィクスチャも同じ（`src/dev/fixture/fixtureSong.ts:53-54`）。
- accent 色が画面に出る経路は `GlyphLayer` の `accent && emphasized` だけ（`src/typesetting/GlyphLayer.tsx:241-248`）。ルールベースでは `accent` は 2 回以上反復する行、`emphasis` は最初の漢字 1 文字（`ruleBasedDirector.ts:95, 128-130`）。しかも段階 2 の「強調の移り」で **行の経過率に沿って ink から accent へ移る**ので、4 秒の行なら赤いのは後半 2 秒だけ。グロー（`GlowLayer`）は surge 中の拍頭に限る。オーナメントは ink、caption は ink、クロームは palette を参照しない。**大半の時間はモノクロ**という診断は正しい。
- 既定の赤 `#D7263D` と地 `#0B0B0C` のコントラスト比は約 3.9:1。強調文字は 1 段大きいので大型文字の基準（3:1）は満たすが、小さな文字やオーナメントには暗い。

### 1.3 主役の文字が平坦（相棒の診断 3: 正しい）

- グリフは `<Text color={color} />` 1 枚（`GlyphLayer.tsx:286`）。色は ink か accent の補間値、それ以外の質感（グラデーション、影、にじみ、面の反射）は無い。
- 例外は太い行の同色ストローク双子（`GlyphLayer.tsx:263-285`、`strokeWidth = sizePx·0.02·pulse·low·damp`、最大でも sizePx の 2%）と、surge 中の拍頭グロー（`GlowLayer.tsx:138-142`、半径 ≤ 8px、強調 3 文字まで）。どちらも「音楽に反応したとき」の例外で、静止画としての質感ではない。
- 文字の大きさは画面幅比で xs 0.045 / s 0.06 / m 0.08 / l 0.11 / xl 0.16（`src/typesetting/layout.ts:59`）。390pt 幅で xl = 62pt。大きさ自体は本書の対象外（groove で決着済み）。

### 1.4 画面の「枠」が弱い（相棒の診断 4: 正しい。補強あり）

- 前後行は gothic xs（17.6pt）、`CONTEXT_OPACITY = 0.35`（`src/typesetting/LyricStage.tsx:74-87`）で、左上 / 右下の **画面の隅** に置かれる（`LyricStage.tsx:123-143`）。主役の行との位置関係が無いので「舞台の焦点」を作らない。
- 右下の前後行は `viewport.height − insetBottom − MARGIN` 基準（`LyricStage.tsx:139-141`）で、操作列を出すとボタンの裏に入る。idle 構造化の記録（進捗 2026-11-08「既知の残り 6」）で据え置きになっている。
- オーナメントは rule 2px、frame 1px、circle 1px、grid 0.5px（不透明度 0.18）、numeral は gothic xs（`src/typesetting/Ornaments.tsx:44, 47, 57, 78, 94-98`）。すべて ink 単色の静止線で、地が黒だと「髪の毛」にしか見えない。
- 奥行きの手がかり（影、光の方向、面）が無いので、文字は黒に浮く。

### 1.5 クローム UI が舞台と別世界（相棒の診断 5: 正しい。補強あり）

| 部品 | 書体 | 色（palette 外のハードコード） | 根拠 |
| --- | --- | --- | --- |
| ワードマーク `MUSICAGE` | システム（SF）700 13pt | `#F4F0E6` | `src/app/MusicageApp.tsx:181-186` |
| 状態語 `MATCHING` 等 | システム 10pt | `#A9AAA4` | `MusicageApp.tsx:187-191` |
| 認識ボタン・設定ボタン | システム 800 12pt | 枠 `#D8D0BA`、地 `rgba(17,21,20,0.68)`、文字 `#F7F2E5`、押下 `rgba(226,219,198,0.16)`、文 `#C8C6B8` | `src/components/RecognitionControls.tsx:75-103` |
| マイクボタン | システム 700 12pt | 枠 `#A9AAA4`、文字 `#F4F0E6`、文 `#D8D4CA` | `ListeningControls.tsx:60-87` |
| 設定シート | システム | 地 `#171B1A`（緑がかった黒）、枠 `#D8D0BA` | `SettingsSheet.tsx:54-63, 85-101` |
| FIX ピル（開発のみ） | システム 700 9pt | `rgba(169,170,164,…)` | `src/dev/fixture/FixtureControl.tsx:106-129` |

補強: 独自色が 8 つあり、どれも `Palette` から導かれていない。同梱 7 ファイル（`assets/fonts/`、約 34MB）は Skia の `useTypeface` でしか読み込まれておらず、React Native の `<Text>` から使う経路（`expo-font`）は **直接依存に無い**（`node_modules/expo/node_modules/expo-font` に入れ子で存在するだけで、アプリから import できない）。クロームに同梱書体を使うには `npx expo install expo-font` が要る（§3f）。

### 1.6 idle が平坦（相棒の診断 6: 正しい）

- 構造化（PR #6）で基線 4 本・列 3 本・段 3 つ（xl / l / m、`src/typesetting/idleComposition.ts:58`）のポスターになった。しかし `LyricStage` は全 idle レイヤーに `fontFor={gothic}`（regular）と `accent={false}` を渡す（`LyricStage.tsx:610-633`）。`composeIdle` の `PlacedGlyph` は `emphasized: false` 固定（`idleComposition.ts:175-187`）。つまり **全グリフ同書体・同ウェイト・同色**。
- 曲が認識済みでも idle の書体は曲の書体と無関係（gothic 固定）。caption も gothic xs、ink 0.6。
- 奥行き・焦点は 1.4 と同じ理由で無い。

### 1.7 診断のまとめ（何を変えれば効くか）

1. **地の明るさと合成の仕方**（1.1）: 地を 11 → 14〜16 に、質感を乗算に、灯（光だまり）で中心を 30〜42 に。これだけで 4 つの質感が見えるようになる。
2. **曲ごとの色**（1.2）: ルールベースに「色の家族」を持たせ、accent を強調文字以外（オーナメント、クローム、idle の錨）にも配る。
3. **文字の身体と影**（1.3）: 面が明るくなって初めて影が意味を持つ。1 と組で効く。
4. **焦点**（1.4）: 灯の中心を主役の行に置き、前後行をその半影に置く。
5. **欄外**（1.5）: 書体と色を舞台から導く。
6. **idle**（1.6）: 曲の書体と accent の錨を 1 つ置く。

---

## 2. デザインコンセプト: 「灯下の一枚刷り」

### 2.1 所有者視点で「大幅改善」とは何か

所有者はレコードプレーヤーの横に iPhone を立て、数十分〜数時間、曲をかけながら横目で見る。ビルド 7 で見えているのは「黒い画面に白い文字」で、これは **アプリの画面** に見える。「大幅に良くなった」と感じるのは、次の 4 つが同時に起きたときだと定義する。

1. **画面が物体に見える。** 黒い液晶ではなく、暗い部屋で一灯に照らされた紙（フィルム、漆、ブラウン管）に見える。質感がスクショで識別できる。
2. **曲が変わると部屋の色が変わる。** 夜の曲は藍、火の曲は朱、海の曲は青緑。曲名を読まなくても「違う曲になった」と分かる。
3. **文字に身体と焦点がある。** 主役の行は面の上に「乗って」いて、光の当たる側と影がある。前後の行はその半影にいる。
4. **UI が同じ刷り物の欄外に見える。** ワードマーク・状態・ボタン・設定が舞台と同じ書体・同じ墨・同じ差し色で、ポスターの余白の註に見える。

### 2.2 コンセプトの定義

> 画面は「暗い部屋で、一灯に照らされた一枚の刷り物」。
> 面（素材）、灯（光だまり）、墨（文字）、欄外（クローム）の 4 つを、曲ごとの 1 つのパレットから導く。

| 要素 | 何を指すか | 対応する既存部品 |
| --- | --- | --- |
| **面** | 刷り物の素材。4 種の質感 = 4 つの素材（paper = 和紙、grain = フィルム、void = 漆、scan = ブラウン管）。素材は灯に照らされて初めて見える | `src/textures/*`（4 種は維持） |
| **灯** | 画面上に 1 つだけある光だまり。中心は主役の行（idle では錨の文字）に置かれ、ゆっくり追従する。色はパレットの `light`。無音で少し絞り、曲の盛り上がりで少し開く | 新規: プレリュードの `lamp()` / `surface()`、uniform `iFocus` / `iLight` / `iLamp` |
| **墨** | 文字の身体。刷りの乗りを示す上下のわずかなグラデーション、面からの浮きを示す接地影。accent は特色（1 色刷りの差し色） | `GlyphLayer`（グラデーション）、`LyricStage`（行単位の影レイヤー） |
| **欄外** | ワードマーク、状態、ボタン、設定。同じ書体（Zen Kaku Gothic New）、同じ墨、同じ特色 | `MusicageApp`、`components/*` |

### 2.3 一言で言う判断基準

迷ったら「**この要素は刷り物の上にあるか、液晶の上にあるか**」で決める。刷り物の上にあるものは面に乗り、灯に照らされ、墨で刷られ、影を落とす。液晶の上にあるもの（ネオン、パーティクル、ガラスのぼかし、全面フラッシュ）は採らない。

### 2.4 退けた案（簡潔に）

- **幻灯機 / 投影**（文字を光として描く）: 文字が発光体になると常時グローになり、焼き付きと点滅の定義に近づく。設計書 §5 の「常時グローは置かない」と衝突。
- **アートワーク背景**（ShazamKit の `artworkUrl` をぼかして敷く）: 「文字のオブジェ」が「音楽プレーヤー」に見える。ネットワーク画像依存でフィクスチャに無い。パレットの種として使う案は §7 に将来候補として残す。
- **複数のコンセプトを曲ごとに切り替える**: 1 曲 2 書体の制約と同じ理由で、置物としての統一感を失う。コンセプトは 1 つ、変わるのはパレットと素材だけ。

---

## 3. 具体設計

### 3a. 色システム

#### 3a.1 パレットの型

`Palette`（`src/direction/types.ts:22-32`）に任意フィールド `light` を 1 つ足す。他は不変。

```ts
export interface Palette {
  background: string;   // 面の地（暗い。8bit で 12〜18）
  ink: string;          // 墨（生成り〜白。地とのコントラスト 10:1 以上）
  accent: string;       // 特色（地とのコントラスト 3.5:1 以上）
  accentHigh?: string;  // 盛り上がり時の特色（既存）
  light?: string;       // 灯の色。省略時は mix(ink, accent, 0.4) を使う（新規）
}
```

`validateDirection.ts:99-102` の `accentHigh` と同じ検証（省略可、指定なら `#RRGGBB`）を `light` にも掛ける。フェーズ 3 の Claude ディレクターは hex を直接返す現行のスキーマのまま使え、`light` を省略してもよい。

#### 3a.2 8 つの「色の家族」（ルールベースの語彙）

ルールベースは色を計算で作らず、**手で整えた 8 パレットから選ぶ**。生成の品質を人が制御でき、テストでコントラストを固定できる。値は初期値で、段階 G で実機のスクショを見て動かす。

| key | 名 | 歌詞の語彙（閉じた辞書、各 8〜12 語） | background | light | ink | accent | accentHigh | texture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sumi` | 墨と朱（既定） | （辞書なし。該当なし時の既定とハッシュ抽選の候補） | `#0E0D0C` | `#F0E6D2` | `#F2EFE6` | `#D7263D` | `#FF4D5E` | paper |
| `ai` | 藍と月 | 夜 月 星 闇 眠 夢 影 窓 静 | `#0A0C14` | `#C9D6F2` | `#E8ECF4` | `#7FA6FF` | `#A9C4FF` | void |
| `sabi` | 鉄錆 | 街 鉄 錆 機械 駅 煙 線路 工場 ビル 車 | `#100D0B` | `#E3B38A` | `#EFE4D6` | `#E0783C` | `#FF9A55` | scan |
| `umi` | 深海 | 海 雨 水 波 涙 青 川 潮 泳 | `#080F10` | `#A8E0DA` | `#E4F1EE` | `#3FC8B4` | `#6FE6D4` | grain |
| `kohaku` | 琥珀 | 光 朝 夜明け 太陽 金 炎 火 燃 暁 | `#110E08` | `#F2CC7A` | `#F5EEDC` | `#F0B429` | `#FFD15C` | paper |
| `hana` | 緋と花 | 花 桜 春 恋 唇 甘 薔薇 色 | `#120A0E` | `#F0B8C8` | `#F6E9EE` | `#F06292` | `#FF8FB5` | grain |
| `koori` | 氷 | 雪 白 冬 氷 透 凍 息 銀 | `#0B0D0F` | `#DCE6EE` | `#F4F7FA` | `#6EC6E8` | `#9ADCF4` | void |
| `midori` | 翠 | 森 木 草 風 緑 土 山 葉 野 | `#0A0F0B` | `#BFDDB0` | `#ECF2E6` | `#7CC46A` | `#A3E08E` | paper |

コントラストの見積り（地に対する比、WCAG 式）: ink は全家族で 15:1 以上。accent は `sumi` 3.9:1 が最も低く（既定の赤は所有者のアイコンと同じ色なので維持）、他は 6:1 以上。テストで ink ≥ 10:1、accent ≥ 3.5:1 を固定する。

#### 3a.3 選び方（`directSongByRules`）

1. 全行のテキストを走査し、家族ごとに辞書の語の出現回数を数える（部分一致、1 行で同じ語が複数回あっても 1 行 1 回）。
2. 最大の家族を採る。最大が 0 なら `fnv1a(seed)` で 8 家族から抽選（曲ごとに違う色になることを優先。`sumi` を既定に固定しない）。同点なら、より早い行に出た家族。
3. `texture` は家族の既定を使う。`tempoFeel` は現状の `'sway'` のまま（動きは本書の範囲外）。
4. `idleGlyphs` は現状どおり `DEFAULT_IDLE_GLYPHS`。
5. 結果は決定的（同じ歌詞・同じ seed → 同じ家族）。

新規ファイル `src/direction/palettes.ts` に家族の表と辞書、`paletteFamilyFor(lines, seed)`、`lightHexFor(palette)`（`light` 省略時の導出）、`contrastRatio(a, b)` を置く。`ruleBasedDirector.ts` はこれを呼ぶだけに留める。

#### 3a.4 色の配り方（どこに何色が出るか）

| 場所 | 現状 | 新設計 |
| --- | --- | --- |
| 面の地 | background | background（家族ごとに色味が違う） |
| 灯 | 無し | `light`、強さ 0.07〜0.12（§3b） |
| 主役の行の文字 | ink（accent 行の強調文字だけ accent へ移る） | ink の上下グラデーション（§3c）。強調文字は従来どおり |
| 前後行 | ink 0.35 | mix(ink, light, 0.3) 0.5 ＋ 先頭に accent の短い罫（§3d） |
| オーナメント | ink の髪の毛線 | accent 行は accent、他は ink 0.7。太さ 1.5〜3px（§3d） |
| idle | 全部 ink | 錨 1 つと直近の差し替え文字が accent、他は ink（§3e） |
| caption | ink 0.6 | ink 0.6 ＋ 上に accent の 12px 罫 |
| クローム | 独自 8 色 | すべて palette から導出（§3f） |

結果として、どの画面でも accent が **常に 1〜3 箇所**（多くて 4）に見えるようにする。accent の面積は画面の 1% 未満に留め（差し色であって塗りではない）、点滅には使わない。

#### 3a.5 曲が変わるときの色の移り

- 背景の uniform（`iBackground`、`iLight`）は UI スレッドで 1.2 秒の 1 次追従（τ = 400ms）で新しい色へ移る。瞬間の切り替えは認識ドロップの暗転（500ms）と重なり、暗転中に色が変わって戻る。
- 文字の色は行の交代（退場 → 新しい行の入場）で自然に変わるので補間しない。
- クロームは RN の `Animated` を使わず即時（面積が小さい）。

### 3b. 背景・奥行き・質感

#### 3b.1 面の構成（プレリュードの再設計）

`TEXTURE_SKSL_PRELUDE`（`src/textures/textureShader.ts:46-115`）に「面」を足し、4 シェーダは「面 × 素材」の形に書き直す。計算順は `surface → material（乗算）→ 拍の持ち上げ（灯の中だけ）→ 額縁 → dropDip`。

```glsl
uniform float2 iFocus;   // 灯の中心（uv、0..1）。主役の行の中心に遅い追従で寄る
uniform float3 iLight;   // 灯の色（0..1）
uniform float  iLamp;    // 灯の開き 0..1（無音 0、energy で開く。遅い追従値）

// 灯: 中心 1、半径 LAMP_RADIUS（画面幅基準の等方）で 0 に落ちる
float lamp(float2 uv) {
  float2 d = (uv - iFocus) * float2(1.0, iResolution.y / iResolution.x);
  return 1.0 - smoothstep(0.0, ${LAMP_RADIUS}, length(d));
}

// 面: 地に灯の色を足す。中心で +LAMP_BASE 〜 +(LAMP_BASE + LAMP_GAIN)
float3 surface(float2 uv) {
  float pool = lamp(uv) * (${LAMP_BASE} + ${LAMP_GAIN} * clamp(iLamp, 0.0, 1.0));
  return iBackground + iLight * pool;
}

// 額縁: 旧 vignette。四隅で FRAME_DARK だけ暗くする
float frame(float2 uv) {
  float d = length(uv - 0.5);
  return 1.0 - smoothstep(0.35, 0.8, d) * ${FRAME_DARK};
}

// 拍: 灯の中だけ、絶対値で PULSE_LIFT まで。信頼度でゲート
float3 beatLift(float2 uv) {
  return iLight * lamp(uv) * clamp(iPulse, 0.0, 1.0) * iConfidence * ${PULSE_LIFT};
}
```

定数は TS 側（`SURFACE_CONSTANTS`）からテンプレートで埋め込み、`TEXTURE_BLEND_RANGE` と同じ流儀でテストと調整に使う。初期値と数値目標:

| 定数 | 初期値 | 根拠 / 目標（8bit） |
| --- | --- | --- |
| background（家族ごと） | 12〜18 | 地。真っ黒ではなく「暗い色紙」 |
| `LAMP_BASE` | 0.07 | 無音時の灯の中心 = 地 + 0.07×light ≈ 30〜32 |
| `LAMP_GAIN` | 0.05 | 大音量時の中心 ≈ 42 以下 |
| `LAMP_RADIUS` | 0.75 | 画面幅の 0.75 倍で消える。中心から画面の短辺を越えるくらい |
| `FRAME_DARK` | 0.45 | 四隅 ×0.55 → 7〜10。「額縁」が見える |
| `PULSE_LIFT` | 0.02 | 拍頭で灯の中心 +5 階調以下。中心で相対 +15% 未満、縁で 0。現状（全面 +15）より弱い |
| 画面平均 | 18〜22 | 「暗い基調」の数値定義。測り方は §5 |

`iLamp` は `TextureBackground` のフレームコールバック（既存の `time` 更新と同じ worklet）で `target = silence ? 0 : 0.3 + 0.7·energy` に τ = 800ms で追従する。`silence` は shared value として新たに渡す（`useBeatSharedValues` に `silence` を足す、1 行）。`iFocus` も同じコールバックで `focusTarget` に τ = 600ms で追従する（焦点の決め方は §3c.3）。

#### 3b.2 素材（4 シェーダの書き換え方針）

素材は **乗算**で、平均 1.0 を保つ（`material ∈ 約 0.85〜1.15`）。calm / lively の 2 表情と `energyBlend()` は維持（段階 6 の資産）。素材の振幅は地ではなく「灯に照らされた面」に掛かるので、中心では見え、四隅では自然に消える。これが「素材は灯に照らされて初めて見える」の実装。

| 素材 | calm（現状の式をどう変えるか） | lively | 振幅の目安（灯の中心、8bit） |
| --- | --- | --- | --- |
| paper 和紙 | 繊維 `1 + (fbm3 − 0.4375)·0.45`（旧 0.08 の加算係数 → 乗算 0.45）、ムラ `± 0.04`、**簾の目**（6px 周期の横線、`1 − 0.03·step(0.5, fract(y/6))`）を追加 | 現状の「張る」表情を同じ乗算形に | ±4〜5 |
| grain フィルム | `1 + (hash − 0.5)·(0.14 + 0.10·iHigh)`（旧 0.04〜0.10 の加算 → 乗算） | 横筋 65% 混合は維持 | ±2〜4。地でクリップしない |
| void 漆 | 素材なし（1.0）。代わりに灯が鋭い: `pool = pow(lamp, 1.6)` で中心に寄せ、`LAMP_BASE` を 0.09 に | 傾き（tilt）は維持 | 中心 36〜44、周辺は地 |
| scan ブラウン管 | `1 − dark·(0.18 + 0.12·iMid)`（旧 0.05〜0.13 → 0.18〜0.30） | 破線の這いは維持 | 線の明暗差 5〜9 |

4 シェーダ共通の尾は `col = surface(uv) * material; col += beatLift(uv); col *= frame(uv); return dropDip(col)` とし、既存テスト「`iPulse * iConfidence` を含む」が `beatLift` の定義で満たされるようにする（文字列検査は `beatLift` 内の `iPulse` と `iConfidence` の積で通る）。

#### 3b.3 奥行きの手がかり（面の側）

- 灯が主役の行に寄る（`iFocus`）ので、行が画面上部に組まれれば灯も上へ、縦組みなら中央の列へ寄る。idle では錨の文字へ。これが「構図の焦点」になり、行の交代ごとに 0.6 秒かけて灯が滑る（点滅ではなく移動）。
- 額縁（四隅 ×0.55）で画面の縁が沈み、刷り物の「版面」が見える。

#### 3b.4 TS の双子（テストで数値目標を判定する仕組み）

新規 `src/textures/surfaceModel.ts` に SkSL と同じ式を TS で書き（`lamp(uv)`, `surface(uv)`, `frame(uv)`, `beatLift`）、`SURFACE_CONSTANTS` を共有する。テストは双子に対して「中心 ≤ 42/255」「四隅 ≤ 12/255」「画面平均（16×16 サンプル）18〜22」「拍リフトの最大 ≤ 5/255 かつ中心での相対 ≤ 15%」を判定する。シェーダ文字列には定数が同じテンプレートで入っていることを文字列検査で確かめる（段階 6 の流儀）。実描画は単体テストでは保証できないので、実機のスクショで同じ 4 点を測る（§5）。

### 3c. 主役の文字の質感と焦点の作り方

#### 3c.1 墨の身体（グリフ単位、描画命令は増やさない）

`GlyphLayer` の `<Text>` に `LinearGradient` を子として与え、塗りを「上が光、下が影」のわずかなグラデーションにする。Skia の `Text` は子にシェーダを取れる（`renderer/components/shaders/LinearGradient`）。描画ノード数（`skText`）は変わらない。

```tsx
<Text x={glyph.x} y={glyph.y} text={glyph.char} font={font}>
  <LinearGradient
    start={{ x: glyph.x, y: glyph.y - glyph.sizePx * 0.88 }}
    end={{ x: glyph.x, y: glyph.y + glyph.sizePx * 0.12 }}
    colors={inkGradient}   // SharedValue<string[]>: [mix(inkNow, light, 0.12), mix(inkNow, background, 0.10)]
  />
</Text>
```

- `inkGradient` は `LyricStage` で 1 回だけ `useDerivedValue` し（`inkNow` と同じ場所）、全グリフで共有する。強調文字は `[mix(accentNow, accentHigh, 0.3), accentNow]`。`interpolateColor` は既に worklet で使っている（`GlyphLayer.tsx:248`）。
- 回転グリフ（縦組みの長音など）はグリフの Group ごと回るので、グラデーションも文字自身の上下に沿う。許容。
- 振幅は 12% / 10% で「刷りの乗り」程度。文字がメタリックに見えたら 8% / 6% に落とす（段階 G）。

#### 3c.2 接地影（行単位、オフスクリーン 1 枚）

主役の行の `GlyphLayer` 全体を `Group layer={<Paint><Shadow dx={0} dy={2} blur={3} color={shadowColor} /></Paint>}` で包み、行全体に 1 回だけ影を落とす（Skia の `Group.layer` と `imageFilters/Shadow`）。グリフごとに影を作らない（40 グリフ × ぼかしは重い）。

- `shadowColor` は `rgba(background, 0.6)` に近い暗色（面が灯で明るい部分でだけ影が見える。黒地では見えない。§3b と組で効く）。
- 影は **主役の行と idle** に限る。前後行・退場中の行・caption・グローには付けない。
- 退場中の行は影なしで薄れるので、交代の瞬間に「影が消えて行が浮く」のが「落ちる / 抜ける」の予兆として効く。
- 代替（fps が割れたとき、§6）: `Shadow` を外し、各グリフに `dy +1.5px` の暗色の双子 `<Text>` を足す（ぼかし無し。描画ノードは 2 倍）。さらに割れるなら影なし。

#### 3c.3 焦点（灯の中心と前後行の半影）

- **灯の中心**: `LyricStage` が主役の行の `layout.bounds` の中心を `focusTarget`（shared value、uv）に書く。行が変わるときだけ JS が書き、追従は UI スレッド（§3b.1）。空行・idle では idle の accent 錨（§3e）の位置、錨が無ければ画面中心やや上（0.5, 0.42）。
- **前後行の位置**: 画面の隅ではなく **主役の行の bounds に相対**して置く。横組みなら、前の行は bounds の上 28px（右揃え）、次の行は bounds の下 28px（左揃え）。縦組みなら、前の行は列ブロックの右上、次の行は左下。どちらも予約帯（ワードマーク行、操作列、caption 行。`idleComposition.ts:69-83` と同じ定数を `layout.ts` に移して共有）と左右余白にクランプする。右下の前後行が操作列の裏に入る既知の欠陥はこれで直る。
- **前後行の見え方**: 不透明度 0.5、色は `mix(ink, light, 0.3)`（半影に沈む）、先頭に accent の 10×2px の罫（前の行は末尾側、次の行は先頭側）。書体は現状どおり gothic xs。xl の行では消す（現状どおり）。
- **グロー**: 変更なし（surge 中の拍頭、強調 3 文字、半径 8px）。

### 3d. オーナメントと構図

オーナメントは「刷られた印」にする。ink 単色の髪の毛線から、特色と太さのある印へ。語彙（6 種）は増やさない。

| ornament | 現状 | 新設計 |
| --- | --- | --- |
| `rule` | ink 2px、行の長さ | accent 行は accent、他は ink 0.7。**3px**、両端 12px 延ばす（はみ出しが刷り物らしさ） |
| `frame` | ink 1px、bounds ぴったり | ink 0.6、1.5px、bounds の外 8px。さらに外 4px に 0.5px の内側の線（二重罫） |
| `circle` | ink 1px、半径 0.6h | accent 0.7、1.5px、半径は変えない |
| `grid` | ink 0.5px、不透明度 0.18 | ink 1px、不透明度 0.10。灯の外では額縁で自然に沈む |
| `numeral` | gothic xs、ink、右上 | gothic **s**、accent、右上。数字の下に 24×2px の ink 罫 |
| `none` | 無し | 無し |

構図の規則（新規に明文化）:

- **版面**: 上の予約帯（ワードマーク行 + 24px）、下の予約帯（操作列 + caption 行 + 24px）、左右 24px の内側を版面とし、主役の行・前後行・オーナメント・idle はすべて版面に収める。`idleComposition.ts` の `TOP_RESERVED` / `BOTTOM_RESERVED` / `CAPTION_GAP` を `layout.ts` の `Viewport` 由来の関数 `printArea(viewport)` に移し、`layoutLine`（横組みの垂直センタリングと縦組みの上端）と `contextGlyphs` と `composeIdle` が同じ版面を使う。
- **焦点**: 灯の中心 = 主役の行。前後行は半影。オーナメントは主役の行の付属。
- **余白**: 版面の外には何も描かない（クロームは版面の外の「欄外」）。

### 3e. idle の見た目（刷り物化）

構造化（PR #6）の規則（基線 4 本、列 3 本、段 3 つ、エポック、1 小節 1 文字の差し替え、無音凍結、回転なし）は維持し、**書体・色・影・焦点**だけ足す。

| 項目 | 規則 |
| --- | --- |
| 書体 | 錨（xl）は「主書体」、相方（l / m）と caption は「副書体」。曲が認識済み（`direction !== null`）なら主書体 = その曲の行で最も多い書体、副書体 = もう 1 つの書体（1 種しか無ければ gothic）。未認識なら主書体 `mincho-old`、副書体 `gothic`。idle 画面に出る書体は常に 2 つ以内 |
| ウェイト | 主書体が gothic なら錨は bold。他は regular（bold ファイルが無い） |
| 色 | エポックごとに錨 1 つ（`pick('accentRow', 4)` の行の錨）を accent。直近に差し替わった 1 文字（`index ≥ 1000` のスロット）も accent で rise し、次の差し替えまで accent のまま。他は ink。相方の m 段は ink 0.75 |
| 影 | 主役の行と同じ行単位の接地影（§3c.2）を idle レイヤーにも掛ける（fps を測る。§6） |
| 灯 | 灯の中心 = accent の錨の中心。エポックごと（約 16 秒）に灯が別の行へ滑る。焼き付き対策にもなる |
| caption | 副書体 xs、ink 0.6。上に accent の 12×2px 罫。位置は現状どおり |
| 無音 | `iLamp → 0` で灯が絞られ、面は地と額縁だけになる（置物が「休んでいる」状態）。文字は静止（現状どおり） |

実装は `PlacedGlyph` に任意フィールド `face?: 'primary' | 'secondary'` と `accent?: boolean` を足し（`phaseOffset` と同じ流儀）、`LyricStage` が idle グリフを face ごとに 2 つの `GlyphLayer` に分ける。`composeIdle` のシグネチャは `faces: { primary: FontKey; secondary: FontKey }` を 1 引数足すだけ。

### 3f. クローム UI を舞台と統一する

#### 3f.1 書体

`expo-font` を直接依存に足し（所有者が `npx expo install expo-font` を実行。ネイティブモジュールなので Development Build / TestFlight は再ビルドが要る。Expo Go には同梱済み）、`App.tsx` のルートで `useFonts` により `ZenKakuGothicNew-Regular` / `-Bold` を読み込む。フォントの読み込みを待たない（舞台は Skia の `useTypeface` で独立に読む。クロームは読み込み前はシステム書体で出し、読み込み後に差し替わる）。`src/theme/chromeFonts.ts` に `useChromeFonts(): { regular?: string; bold?: string }` を置く。

代替（依存を足したくない場合）: ワードマークと状態語だけ Skia の `Canvas` + `Text` で描く（既存の typeface を使える）。ボタンと設定シートはシステム書体のまま。統一感は落ちるので推奨しない。

#### 3f.2 色（palette からの導出、`src/theme/chrome.ts`）

```ts
export function chromeTheme(palette: Palette) {
  return {
    ink: palette.ink,                                   // ワードマーク、ボタンの文字
    inkMuted: mixHex(palette.ink, palette.background, 0.45),  // 状態語、説明文
    border: mixHex(palette.ink, palette.background, 0.65),    // ボタン・シートの枠
    accent: palette.accent,                             // 状態の点、主ボタンの枠、Switch
    surface: mixHex(palette.background, palette.ink, 0.06),   // 設定シートの地
    scrim: withAlpha(palette.background, 0.6),          // ボタンの地、モーダルの幕
    pressed: withAlpha(palette.accent, 0.18),           // 押下
  };
}
```

`MusicageApp` は `stage.source.direction?.palette ?? DEFAULT_PALETTE` から `chromeTheme` を 1 回 `useMemo` し、各部品に `theme` prop で渡す。再レンダーはパレットが変わるときだけ。独自色 8 つは全部消す。

#### 3f.3 部品ごとの規則

| 部品 | 規則 |
| --- | --- |
| ワードマーク | `MUSICAGE`、gothic bold 12pt、字間 5、ink 0.85。位置は現状 |
| 状態 | 左に 6px の点（accent。idle は中抜き、listening は塗り、matching / lyrics は塗り + 外周 1px）、右に状態語 gothic regular 10pt、字間 2.5、inkMuted。点は点滅させない |
| ボタン（共通部品 `ChromeButton` に統合） | 高さ 48、角丸 14（現状 22 の丸薬から、刷り物の「欄」に寄せる）、枠 1px `border`、地 `scrim`、文字 gothic bold 12pt 字間 1.5 ink 0.9。主ボタン（曲を読み取る）は枠を accent に。押下 `pressed`、無効 0.4。3 つのボタンのスタイル重複をこの部品に寄せる |
| 文（エラー・案内） | gothic regular 13pt、inkMuted、現状の最大幅 |
| 設定シート | 地 `surface`、上辺 1px `border`、角丸 16。見出し gothic bold 15pt 字間 2 ink。ラベル gothic regular 14pt ink。説明 inkMuted 12pt。`Switch` の `trackColor={{ true: accent, false: border }}`、`thumbColor={ink}`。閉じるは `ChromeButton` |
| FIX ピル（開発のみ） | 色を `inkMuted` / `border` に寄せる。優先度低。計画には含めるが実機判定の対象外 |

予約帯の高さ（ワードマーク行 28、操作列 130。`idleComposition.ts:73-81`）は **変えない**。ボタンの高さ 48 と gap 16 を保つ。

### 3g. 設計書への最小追記（実装前に行う）

本設計は設計書の「実装者に任せること」（質感シェーダの見た目、縦書きの詳細）の範囲が大半だが、次の 3 点は設計書に注記する（「2026-11-09 改定」）。

1. §4 `SongDirection.palette` に任意の `light`（灯の色）を足す。
2. §6 に「質感シェーダは `iFocus`（焦点）・`iLight`・`iLamp` を受け取り、1 つの光だまりを描く。暗い基調の数値定義: 画面平均 ≤ 22/255、光だまりの中心 ≤ 42/255。拍による持ち上げは光だまり内に限り絶対値 +5/255 以下」を追記し、「背景の平均輝度を変えない」は「calm / lively の交差で平均を変えない」の意味であることを明記する。
3. §7 に「クロームは舞台のパレットと同梱書体から導く」を 1 行追記する。

---

## 4. 段階分けした実装計画

各段階は独立にブランチ・PR・実機確認ができ、前の段階に依存する箇所は明記する。各段階で `npm test -- --watchman=false` と `npm run typecheck` を通し、進捗ファイル `docs/superpowers/reports/2026-11-03-phase2-progress.md`（または新規 `2026-11-09-visual-overhaul-progress.md`）に追記する。テストは失敗を先に書く（AGENTS.md）。現時点の基準は 45 スイート / 424 件通過（2026-11-08 の記録。本セッションでは未実行）。

### 段階 A: 色システム（曲ごとのパレット）

- **見た目の変化**: 曲ごとに背景の色味・文字の色・質感が変わる。フィクスチャは `kohaku`（「夜明け」「暁」「光」が辞書に当たる）になる見込み。背景はまだ暗いままなので、この段階では主に文字の色と accent の出現で違いが分かる。
- **触るファイル**: 新規 `src/direction/palettes.ts`、`src/direction/ruleBasedDirector.ts`（palette / texture の選択）、`src/direction/types.ts`（`light?`）、`src/direction/validateDirection.ts`（`light` の検証）、`src/dev/fixture/fixtureSong.ts`（palette を明示するか、ルールに任せるかを決める。推奨: 明示せず `directSongByRules` の結果を使う）、開発用に `src/dev/fixture/FixtureControl.tsx` と `useFixturePlayback.ts` に `PAL` ピル（タップで 8 家族を巡回、長押しで質感を巡回。開発ビルドのみ）。
- **テスト**: `palettes.test.ts`（8 家族すべてで ink ≥ 10:1、accent ≥ 3.5:1、`light` 省略時の導出、辞書による選択が決定的、該当なしはハッシュ抽選で 8 家族に散る）。`ruleBasedDirector.test.ts`（架空の行で家族が選ばれる、texture が家族に従う）。`validateDirection.test.ts`（`light` 省略可 / 不正は null）。既存の「palette が DEFAULT と同じ」を前提にしたテストがあれば更新。
- **実機**: 3 曲で 3 色になる。`PAL` ピルで 8 家族を見て、文字が読めない家族が無い。
- **前提**: 無し。

### 段階 B: 面と灯（背景の再設計）

- **見た目の変化**: 画面が黒から「暗い色紙 + 一灯」になる。質感 4 種がスクショで識別できる。四隅が沈む。拍の全面フラッシュが消え、灯の中だけがわずかに脈打つ。無音で灯が絞られる。
- **触るファイル**: `src/textures/textureShader.ts`（プレリュードに `lamp` / `surface` / `frame` / `beatLift`、`SURFACE_CONSTANTS` のテンプレート埋め込み、uniform 3 つ）、`grain.ts` / `paper.ts` / `void.ts` / `scan.ts`（面 × 素材への書き換え）、新規 `src/textures/surfaceModel.ts`（TS の双子）、`src/textures/TextureBackground.tsx`（`focus` / `light` / `silence` props、フレームコールバックで `iLamp` / `iFocus` / 色の追従。`useFrameCallback` の関数を `useCallback` で固定する既知の指摘もここで直す）、`src/typesetting/useBeatSharedValues.ts`（`silence`）、`src/app/useStageSource.ts`（`silence` の書き込み 1 行）、`src/typesetting/LyricStage.tsx`（`focusTarget` の shared value を持ち、行の bounds 中心を書く。idle は画面中心やや上）。
- **テスト**: `surfaceModel.test.ts`（中心 ≤ 42、四隅 ≤ 12、平均 18〜22、拍リフト ≤ 5 かつ相対 ≤ 15%、無音で `iLamp` 目標 0）。`TextureBackground.test.tsx`（uniform 宣言と使用の整合テストに新 uniform を足す、`SURFACE_CONSTANTS` がプレリュードに埋まっている、各シェーダが `surface(` と `frame(` と `beatLift(` を通る、`iPulse * iConfidence` の既存検査が通る、色の追従が derived value で動く）。`LyricStage.test.tsx`（行の bounds 中心が `focusTarget` に書かれる）。
- **実機**: スクショ 4 点の測定（§5）。4 質感で fps 55 以上（paper のクロスフェード中を含む）。灯が行の位置に寄る。無音で灯が絞られる。10 分放置で発熱が気にならない。
- **前提**: 段階 A（`light` の色）。A 無しでも `lightHexFor` の導出で動く。

### 段階 C: 墨の身体と焦点

- **見た目の変化**: 文字が面に「乗る」。上下のわずかなグラデーションと接地影で浮き上がる。前後行が主役の行の上下（半影）に来て、accent の短い罫が付く。右下の前後行が操作列に隠れなくなる。
- **触るファイル**: `src/typesetting/GlyphLayer.tsx`（`LinearGradient` の子、`inkGradient` / `accentGradient` props）、`src/typesetting/LyricStage.tsx`（グラデーションの derived value、主役の行を `Group layer` + `Shadow` で包む、`contextGlyphs` を bounds 相対に、accent 罫の `Line`）、`src/typesetting/layout.ts`（`printArea(viewport)`、`idleComposition.ts` の予約帯定数を移す）、`src/typesetting/idleComposition.ts`（`printArea` を使うだけ）。
- **テスト**: `GlyphLayer.test.tsx`（グリフごとに `skText` が 1 枚のまま、`skLinearGradient` が子にある、強調文字は accent 側のグラデーション）。`LyricStage.test.tsx`（主役の行だけ影の `Paint` / `Shadow` を持つ、退場中・前後行・caption には無い、前後行が bounds の上下に置かれ版面と予約帯に収まる、xl で消える）。`layout.test.ts`（`printArea` が `idleComposition.test.ts` の予約帯の期待値と一致する）。`idleComposition.test.ts` は定数の出所が変わるだけで期待値不変。
- **実機**: 影とグラデーションが「刷りの乗り」に見える（メタリックに見えたら振幅を下げる）。前後行が焦点を作る。fps 55 以上（xl 縦組みの行 + グロー + 太い行で測る）。
- **前提**: 段階 B（面が明るくないと影は見えない）。

### 段階 D: 欄外の構図とオーナメント

- **見た目の変化**: 罫・枠・円・数字が「刷られた印」になる（太く、特色、はみ出し、二重罫）。
- **触るファイル**: `src/typesetting/Ornaments.tsx`（6 種の見直し、`accent` と `accentValue` を受ける）、`src/typesetting/LyricStage.tsx`（props 追加）。
- **テスト**: `LyricStage.test.tsx` の「draws each line ornament」を更新（testID は維持、太さ・色・延長・二重罫を検査）。
- **実機**: rule / numeral がある行で印が見える。grid が灯の外で沈む。
- **前提**: 段階 A（accent）。B・C と独立にマージできる。

### 段階 E: idle の刷り物化

- **見た目の変化**: idle の錨が明朝（または曲の主書体）になり、1 つが特色、相方は小さく薄い。灯が錨に当たり、16 秒ごとに別の行へ滑る。差し替わる文字が特色で現れる。caption に特色の罫が付く。
- **触るファイル**: `src/typesetting/idleComposition.ts`（`faces` 引数、`face` / `accent` フィールド、`accentRow`）、`src/typesetting/layout.ts`（`PlacedGlyph` の任意フィールド 2 つ）、`src/typesetting/LyricStage.tsx`（face ごとの 2 レイヤー、主書体の決定、影、`focusTarget` を錨に、caption の罫）、`src/typesetting/fonts.ts`（変更なしの見込み。bold の有無の問い合わせだけ足すかもしれない）。
- **テスト**: `idleComposition.test.ts`（錨は primary、相方と caption は secondary、エポックに accent の錨がちょうど 1 つ、差し替え文字は accent、既存の構造テストは不変）。`LyricStage.test.tsx`（idle が 2 書体以内、認識済みの曲では曲の書体、未認識では mincho-old + gothic、`focusTarget` が錨の中心）。
- **実機**: 静かな部屋で idle が「刷り物」に見える。16 秒ごとの灯の移動が「動いている背景」に見えない。錨が強すぎれば `TIERS` を落とす（既存の退避先）。
- **前提**: 段階 B（灯）、C（影）。A 無しでも既定色で動く。

### 段階 F: クロームの統一

- **見た目の変化**: ワードマーク・状態・ボタン・設定が舞台と同じ書体・墨・特色になる。緑がかった設定シートと 8 つの独自色が消える。状態の点が付く。
- **人にお願いすること**: `npx expo install expo-font` の実行と、`package-lock.json` の同期、再ビルド（ネイティブモジュール）。
- **触るファイル**: `package.json`（expo-font）、`App.tsx`（`useFonts`）、新規 `src/theme/chrome.ts` / `src/theme/chromeFonts.ts` / `src/components/ChromeButton.tsx`、`src/app/MusicageApp.tsx`、`src/components/RecognitionControls.tsx` / `ListeningControls.tsx` / `SettingsSheet.tsx`、`src/dev/fixture/FixtureControl.tsx`（色だけ）。
- **テスト**: `chrome.test.ts`（8 家族で ink/surface ≥ 10:1、inkMuted/background ≥ 4.5:1、border が ink と background の間）。各部品のテスト（`theme` を渡すと色がそこから来る、`theme` 省略で `DEFAULT_PALETTE` 由来、フォント未読込でも描画される）。`MusicageApp.test.tsx`（パレットが変わるとクロームの色が変わる。既存 521 行のテストは testID / ラベル文言ベースなので大きくは壊れない見込み）。`jest-expo` の `expo-font` モック（`useFonts` が `[true, null]` を返す）を確認し、無ければ `jest/` に足す。
- **実機**: 画面全体が 1 つの刷り物に見える。読み込み直後にシステム書体から差し替わる瞬間が気にならない（気になれば `SplashScreen` で待つ）。
- **前提**: 段階 A（palette）。他と独立。

### 段階 G: 実機所見による数値調整

- **見た目の変化**: 所有者のスクショと所見に基づき、`SURFACE_CONSTANTS`、素材の振幅、グラデーション振幅、影の濃さ、8 家族の hex、accent の面積を動かす。コードの構造は変えない。
- **触るファイル**: 定数と hex だけ（`palettes.ts`、`textureShader.ts` の定数、`surfaceModel.ts` の目標値、各シェーダの係数、`GlyphLayer` の振幅）。
- **テスト**: 数値目標のテストを所見に合わせて更新。
- **実機**: §5 の実機判定をすべて通す。
- **前提**: A〜F。

### 進め方

1. A → B → C を先に通し、ここで所有者が「大幅改善」を感じるかを判定する（この 3 段階で 2.1 の条件 1〜3 が揃う）。
2. D・E・F は独立なので、所有者の優先順位で並べ替えてよい。推奨は E（一番長く見る画面）→ F（統一感）→ D。
3. G は各段階の後に小さく回してもよいが、まとめて 1 回置く。
4. 各段階の終わりに TestFlight（Codemagic `ios-testflight`）で配り、所有者がスクショを撮る。A〜E は Expo Go のフィクスチャでも確認できる（Expo Go に Skia と expo-font は同梱）。

---

## 5. 受け入れ条件

### 5.1 テストで判定するもの

| # | 条件 | 判定するテスト |
| --- | --- | --- |
| T1 | 8 家族すべてで ink/background ≥ 10:1、accent/background ≥ 3.5:1 | `palettes.test.ts` |
| T2 | 同じ歌詞と seed で同じ家族。辞書に当たらない曲はハッシュで 8 家族に散る | `palettes.test.ts`、`ruleBasedDirector.test.ts` |
| T3 | 面の TS 双子で、灯の中心 ≤ 42/255、四隅 ≤ 12/255、16×16 サンプルの平均 18〜22/255、拍リフト ≤ 5/255 かつ中心で相対 ≤ 15% | `surfaceModel.test.ts` |
| T4 | 4 シェーダが `surface` / `frame` / `beatLift` / `dropDip` を通り、使う uniform がすべて宣言されている。`SURFACE_CONSTANTS` がプレリュードに埋まっている | `TextureBackground.test.tsx` |
| T5 | 無音で `iLamp` の目標が 0、音ありで 0.3〜1.0。灯の色と背景色がパレット変更で追従する | `TextureBackground.test.tsx` |
| T6 | グリフは 1 文字 1 `skText`（太い行は 2）のまま。グラデーションの子がある | `GlyphLayer.test.tsx` |
| T7 | 影の `Shadow` は主役の行と idle にだけある | `LyricStage.test.tsx` |
| T8 | 前後行が主役の行の bounds 相対に置かれ、版面と予約帯に収まる | `LyricStage.test.tsx`、`layout.test.ts` |
| T9 | idle は 2 書体以内、accent の錨が 1 つ、差し替え文字が accent | `idleComposition.test.ts`、`LyricStage.test.tsx` |
| T10 | クロームの色が palette から導かれ、独自 hex が部品に残っていない（`#` の文字列検査） | `chrome.test.ts`、各部品のテスト |
| T11 | 毎フレームの React 再レンダーが無い（既存の「GlyphLayer が memo されている」「shared value で動く」テストの維持） | 既存 |
| T12 | `npm test -- --watchman=false` 全通過、`npm run typecheck` 通過 | — |

### 5.2 実機で所有者が判定するもの

| # | 条件 | 測り方 |
| --- | --- | --- |
| D1 | 同じ曲の静かな場面でスクショを撮り、灯の中心 30〜42、四隅 7〜12、全体平均 18〜22（8bit） | 画像編集アプリのスポイトと平均（または PC で ImageMagick `convert shot.png -format "%[mean]" info:`） |
| D2 | 4 質感がスクショで識別できる（紙の繊維と簾の目、粒、漆の艶、走査線） | `PAL` ピル長押しで巡回 |
| D3 | 3 曲で 3 つの色の世界になる。どの家族でも文字が読める | 実曲 3 つ + `PAL` ピルで 8 家族 |
| D4 | 文字に身体がある（グラデーションと影が「刷りの乗り」に見え、メタリックや浮き輪に見えない） | 目視。違えば段階 G |
| D5 | 灯が主役の行に寄り、行の交代で 0.6 秒かけて滑る。「動いている背景」に見えない | 目視 |
| D6 | 拍で灯が脈打つのが「わずか」で、全面が光らない。点滅に見えない | 目視。速い曲（160 BPM 以上）で |
| D7 | 前後行が焦点を作り、操作列に隠れない | 操作列を出した状態で |
| D8 | idle が刷り物に見え、静かな部屋で灯が絞られて静止する | 10 分放置 |
| D9 | クロームが舞台と同じ刷り物に見える。設定シートに緑がかりが無い | 目視 |
| D10 | fps 55 以上（FIX ピル）: paper のクロスフェード中、xl 縦組み + 太い行 + グロー、idle の影 | 3 場面で測る |
| D11 | 10 分放置で発熱が気にならない。焼き付きの懸念（平均輝度 ≤ 22、灯が動く）が増えない | 体感 + D1 |
| D12 | 認識ドロップ、surge のグロー、色の変化が従来どおり働く（回帰） | 実曲 |

---

## 6. リスクと性能

### 6.1 Skia シェーダの画素単価

画面は 390×844pt @3x ≈ 296 万画素（段階 6 の見積りと同じ）。

| 追加分 | 画素あたりの追加 | 見積り |
| --- | --- | --- |
| `lamp()` | `length` 1、`smoothstep` 1（`surface` と `beatLift` で共有できるよう 1 回だけ計算して変数に持つ） | 無視できる |
| `frame()` | 現状の vignette と同じ | 0 |
| paper の簾の目 | `fract` 1、`step` 1 | 無視できる |
| paper の fbm3 | 変更なし（最重量のまま。クロスフェード中 1.75 倍の既知の問題も不変） | 既存 |
| 色の追従 | uniform の計算は worklet 側。シェーダは 0 | 0 |

**退避先**（paper で fps が割れたとき、段階 6 の判断 6 と同じ順）: lively の fbm3 を 2 オクターブに、ブレンド幅を狭める、lively を calm の再整形だけにする。

### 6.2 グリフ側の追加

| 追加分 | コスト | 退避先 |
| --- | --- | --- |
| `LinearGradient` の子（全グリフ） | 塗りがシェーダになるだけ。描画ノード数不変。GPU ではほぼ 0 | 無し（必要なら単色に戻すのは 1 行） |
| 行単位の `Group layer` + `Shadow`（主役の行） | 行の bounds のオフスクリーン 1 枚 + ぼかし半径 3 の 2 パス。xl 縦組み 2 列でも bounds ≈ 150×750pt → 約 100 万画素。1 フレームに 1 回 | `Shadow` を外して `dy +1.5` の暗色の双子（ノード 2 倍、ぼかし無し）→ 影なし |
| idle の影 | idle の bounds は画面の大半（4 行 × 3 列）→ 全画面規模のオフスクリーン + ぼかし | idle だけ双子方式、または idle は影なし |
| 前後行の accent 罫 | `Line` 2 本 | 0 |
| グロー | 変更なし（強調 3 文字、個別ぼかし） | 既存 |

グリフ数は増えない（グラデーションも影もノードを足さない。退避先の双子だけが 2 倍にする）。

### 6.3 焼き付きと点滅

- 画面平均 ≤ 22/255 で、現状（≈ 11）の 2 倍だが OLED の焼き付きの観点では十分低い。灯は行の位置とエポックで動き、全体は既存のドリフト（±8px、73s / 113s）で漂う。
- 時間変化は、灯の追従（0.6〜1.2 秒）、無音の絞り（0.8 秒）、色の追従（1.2 秒）、拍リフト（灯の中だけ ≤ 5 階調）、既存の scan の這い・void の傾き・grain の毎フレーム更新。点滅の定義（1 秒 2 回以上 × 20% 超）に当たるものは無く、現状の全面リフトより安全側。
- 影とグラデーションは静的（文字と一緒に動くだけ）。

### 6.4 既存テストへの影響

- `TextureBackground.test.tsx`（410 行）: 「uniform の宣言と使用の整合」「`iPulse * iConfidence`」「calm / lively の構造」「`iEnergy` のクランプ経由」「共通の尾」の検査が、プレリュードの再設計で **大半は書き直し**になる。段階 B で最初に更新する（失敗を先に確認）。
- `LyricStage.test.tsx`（682 行、fake timers）: 前後行の位置、オーナメント、idle の書体、影の有無で更新。ドロップ・surge・退場の検査は不変。
- `GlyphLayer.test.tsx`: `skText` の枚数検査は不変。グラデーションの子の検査を足す。
- `idleComposition.test.ts`: 予約帯の期待値は不変、`faces` 引数が増えるので呼び出しを更新。
- `MusicageApp.test.tsx`（521 行）: testID / ラベル文言ベースなので色・書体の変更では壊れない見込み。`expo-font` のモックが要る可能性（`jest-expo` に含まれるか確認。無ければ `jest/setupSkia.js` の隣に 3 行）。
- `textureShader.test.tsx`: `getTextureEffect` の遅延コンパイルとフォールバックの検査は不変。
- Skia の jest モック（`jest/setupSkia.js`）はパッケージ同梱の `Mock` を使い、`LinearGradient` / `Shadow` / `Paint` / `Group.layer` もホスト要素として出る（`renderer/components/` に実在することを確認済み）。実描画は保証されないので、**SkSL のコンパイル可否と見た目は実機でしか分からない**。失敗時は既存の単色フォールバック（`getTextureEffect` が null → `<Fill color>`）が効くので、起動は死なない。

### 6.5 その他のリスク

- **`expo-font` の追加**はネイティブモジュールの追加なので、所有者のコマンド実行と再ビルドが要る。段階 F を最後に置いた理由の一つ。
- **家族の辞書**は日本語の表層語に依存する。英語歌詞は該当なし → ハッシュ抽選になる（意味は反映されない）。フェーズ 3 の Claude ディレクターが hex を直接返せば解決するので、辞書は「無いよりまし」の位置づけ。
- **灯の中心が行ごとに動く**のが「落ち着かない」と感じられる可能性。τ を 1.0 秒に延ばす、または idle と横組みの行では y だけ追従する、で緩和できる（段階 G）。
- **影が見えない家族**（`koori` のように地が青白い）では影色を `background` ではなく `mix(background, #000, 0.5)` にする必要があるかもしれない。段階 G。

---

## 7. やらないこと（アンチゴールの再確認）

- 点滅の定義（輝度変化が 1 秒に 2 回以上かつ振幅 20% 超）を超える演出。拍頭の全面フラッシュ。本設計はむしろ現状の全面リフトを灯の中に局所化して弱める。
- 音量で文字の大きさを直接変えること。擬似的な語・音節同期。文字の大きさ・動きの語彙（entrance / hold / exit）・拍の配線は一切触らない。
- ペット、実績、共有ボタン、通知、常時の点滅。状態の点は点滅させない。「同期歌詞」等のラベルを描かない（状態語は既存の `MATCHING` 等に限る）。
- テクスチャの種類を増やす（4 種のまま。見え方は大きく変える）。新しい素材のシェーダ（ガラス、ネオン、パーティクル、ぼかしガラス）を足す。
- 同梱フォントを増やす（6 書体のまま）。1 曲 3 書体以上。idle も 2 書体以内。
- 毎フレームの React 再レンダー。灯の追従・色の追従・グラデーション・影はすべて UI スレッドの shared value と Skia の宣言で動く。
- 焼き付き回避ドリフトと画面点灯維持の変更。灯の平均輝度は 22/255 以下に抑える。
- 文字を発光体にする（常時グロー）。グローは設計書 §5 の上限（surge 中の拍頭、強調 3 文字、半径 10px 以下）のまま。
- アートワーク（`artworkUrl`）の表示。将来、パレットの種として色を 1 つ抽出する案は残すが、本設計には含めない。
- iPhone 縦画面以外。Android、横向き、iPad。
- 実在曲の歌詞をリポジトリに入れること（家族の辞書は単語のみ。テストは架空の行で書く）。
- 認識・同期・拍・surge・ドロップの挙動変更。フェーズ 3（Claude ディレクター）の実装。ただし §3a のパレット型はフェーズ 3 がそのまま使える形にした。

---

## 付録 A: 数値の一覧（初期値。段階 G で動かす）

| 名 | 値 | 場所 |
| --- | --- | --- |
| `LAMP_BASE` / `LAMP_GAIN` / `LAMP_RADIUS` | 0.07 / 0.05 / 0.75 | `textureShader.ts` `SURFACE_CONSTANTS` |
| void の `LAMP_BASE` と指数 | 0.09、`pow(lamp, 1.6)` | `void.ts` |
| `FRAME_DARK` | 0.45 | `SURFACE_CONSTANTS` |
| `PULSE_LIFT` | 0.02 | `SURFACE_CONSTANTS` |
| `iLamp` 目標 / τ | `silence ? 0 : 0.3 + 0.7·energy` / 800ms | `TextureBackground.tsx` |
| `iFocus` τ | 600ms | `TextureBackground.tsx` |
| 色の追従 τ | 400ms（約 1.2 秒で収束） | `TextureBackground.tsx` |
| paper 繊維 / ムラ / 簾の目 | ×0.45 / ±0.04 / −0.03・6px | `paper.ts` |
| grain 粒 | `0.14 + 0.10·iHigh`（乗算） | `grain.ts` |
| scan 線 | `0.18 + 0.12·iMid` | `scan.ts` |
| 墨のグラデーション | 上 `mix(ink, light, 0.12)`、下 `mix(ink, background, 0.10)` | `GlyphLayer.tsx` |
| 接地影 | `dy 2`、`blur 3`、`rgba(background, 0.6)` | `LyricStage.tsx` |
| 前後行 | 不透明度 0.5、`mix(ink, light, 0.3)`、gap 28px、accent 罫 10×2px | `LyricStage.tsx` |
| オーナメント | rule 3px + 12px、frame 1.5px + 8px（内側 0.5px + 4px）、circle 1.5px、grid 1px 0.10、numeral s + 24×2px 罫 | `Ornaments.tsx` |
| idle | 錨 = 主書体（bold if gothic）、accent 錨 1 + 差し替え 1、相方 m は ink 0.75、caption 罫 12×2px | `idleComposition.ts`、`LyricStage.tsx` |
| クローム | ボタン高さ 48・角丸 14、ワードマーク 12pt 字間 5、状態 10pt 字間 2.5、点 6px | `theme/chrome.ts`、`components/*` |
| 暗い基調の定義 | 平均 ≤ 22、灯の中心 ≤ 42、四隅 ≤ 12（8bit） | `surfaceModel.test.ts` と設計書 §6 の追記 |

## 付録 B: 相棒の診断との対応表

| 診断 | 判定 | 補強 / 訂正 | 本書の対応 |
| --- | --- | --- | --- |
| 1 背景が黒で平坦 | 正しい | 数値は 8bit で 1〜2 階調。原因は振幅より「地の明るさ」と「加算合成」。全面の拍リフトだけが +15 階調で最大の輝度変化 | §3b、段階 B |
| 2 色が固定 | 正しい | accent は accent 行の強調 1 文字の後半にしか出ない。`iInk` / `iAccent` は背景が読んでいない | §3a、段階 A |
| 3 文字が平坦 | 正しい | 例外（ストローク、グロー）は「音楽に反応したとき」だけで静止画の質感ではない | §3c、段階 C |
| 4 枠が弱い | 正しい | 右下の前後行は操作列の裏（既知）。ビネットは 2 階調 | §3b.3、§3c.3、§3d、段階 C・D |
| 5 クロームが別世界 | 正しい | 独自色は 8 つ。同梱書体を RN から使う経路（expo-font）が直接依存に無い | §3f、段階 F |
| 6 idle が平坦 | 正しい | 書体・色は `LyricStage` が固定で渡している。構造は良いので壊さない | §3e、段階 E |
