# 歌詞タイポグラフィ・オブジェ フェーズ 1 実装計画（Expo Go）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 架空歌詞のフィクスチャと偽の同期時計で、行ごとに書体・大きさ・縦横・入り方・滞留が変わり拍に乗って切り替わる文字の舞台（LyricStage）を Expo Go 上で動かす。

**Architecture:** 純 TypeScript の層（演出型・ルールベース演出・拍エンジン・同期時計・行スケジューラ・組版・動き・idle 構成）を Skia の描画層（質感シェーダー + 1 文字ずつ置くグリフ）から分離する。配置は行が変わったときだけ JS で計算し、毎フレームの変形は Reanimated の共有値と worklet で UI スレッドが計算する。音は既存の expo-audio メーターを 60ms 間隔で `EarFeatures` に変換して拍エンジンに流す（フェーズ 2 でネイティブ入力に差し替える）。

**Tech Stack:** Expo SDK 57 / React Native 0.86 / TypeScript / @shopify/react-native-skia 2.6 / react-native-reanimated 4.5 / Jest + React Native Testing Library

**Spec:** `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（以下「設計書」）

## Global Constraints

- iPhone 縦画面のみ。Expo Go で動くこと（ネイティブモジュールを追加しない）。
- 同梱フォントは OFL ライセンス、日本語常用漢字収録、合計 40MB 以内、6 書体。
- 1 曲で書体は 2 種まで、`xl` は 3 行まで、`scatter` / `shake` は連続させない（ルールベース演出もこれを守る）。
- 実在曲の歌詞本文をリポジトリに入れない。フィクスチャは架空歌詞。
- 「同期歌詞」などのラベルは描かない。同期できないときは idle 構成に落ちる。
- 拍の信頼度が低い間は `pulse` を弱め、行は歌詞時刻だけで切り替える。拍への整列は ±80ms 以内のみ。
- 常時表示の作法を保つ: `useKeepScreenOn`、`useBurnInDrift` は文字レイヤー全体に適用。
- `reducedMotion` では入り・滞留の動きを止め、最終状態を描く。
- 未追跡の `backup-before-musicage-initial-merge-20260826/` には触れず、ステージしない。
- AudD と校正系の削除はフェーズ 2。このフェーズでは触らない（App からの参照は残す）。
- 毎フレーム JS で React を再レンダーしない。配置は行の切り替わりでのみ計算する。
- コミットメッセージ末尾: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

## Review Focus

- 空行（間奏）や空白だけの行: 文字を描かず idle 構成に落ち、前後行も消える。→ Task 5 / Task 9 のテスト。
- 英数字のみの行の縦書き: 英数字は 90 度回転して並べ、長音「ー」と括弧も回転する。→ Task 6 のテスト。
- 画面に収まらない長い行（40 文字超）: 縦書きなら 2 列、横書きなら 2 段に折り返し、収まらなければサイズを 1 段落とす。→ Task 6 のテスト。
- 歌詞の時刻が巻き戻る（シークや再認識で位置が前に飛ぶ）: スケジューラは前の行へ戻り、入りのアニメーションをやり直す。→ Task 5 のテスト。
- フォント読み込み前のフレーム: グリフを描かず背景だけ描き、クラッシュしない。→ Task 10 のテスト。

---

### Task 1: フォント同梱とフォント台帳

**Files:**
- Create: `assets/fonts/ShipporiMincho-Regular.ttf`, `assets/fonts/ZenOldMincho-Regular.ttf`, `assets/fonts/NotoSansJP-Regular.ttf`, `assets/fonts/NotoSansJP-Bold.ttf`, `assets/fonts/DelaGothicOne-Regular.ttf`, `assets/fonts/ZenMaruGothic-Regular.ttf`, `assets/fonts/YujiSyuku-Regular.ttf`
- Create: `assets/fonts/LICENSES.md`
- Create: `src/typesetting/fonts.ts`
- Modify: `jest/setupSkia.js`
- Test: `src/typesetting/__tests__/fonts.test.ts`

**Interfaces:**
- Produces: `type FontKey = 'mincho' | 'mincho-old' | 'gothic' | 'gothic-heavy' | 'gothic-round' | 'brush'`
- Produces: `type FontWeight = 'light' | 'regular' | 'bold'`
- Produces: `FONT_SOURCES: Record<FontKey, { regular: number; bold?: number }>`（`require()` の戻り値）
- Produces: `resolveFontSource(key: FontKey, weight: FontWeight): number`（bold が無い書体は regular を返す。light は regular と同じファイル）
- Produces: `useStageTypefaces(): Partial<Record<FontKey, { regular: SkTypeface; bold: SkTypeface }>> | null`（全書体が読めるまで `null`。Skia の `useTypeface` を 7 ファイル分呼ぶ）
- Produces: `createStageFont(typeface: SkTypeface, sizePx: number): SkFont`（`Skia.Font(typeface, sizePx)` の薄い包み）

- [ ] **Step 1: フォントを取得して置く**

Google Fonts の GitHub（`github.com/google/fonts/tree/main/ofl/<family>`）から 7 ファイルを取得し `assets/fonts/` に置く。各ファイルの OFL 本文へのリンクとファイルサイズを `assets/fonts/LICENSES.md` に記す。合計が 40MB を超える書体は、同じ役割の軽い OFL 書体に差し替えてよい（設計書「実装者に任せること」）。

- [ ] **Step 2: 失敗するテストを書く**

```ts
// src/typesetting/__tests__/fonts.test.ts
import { FONT_SOURCES, resolveFontSource } from '../fonts';

test('every font key has a regular source', () => {
  for (const key of ['mincho', 'mincho-old', 'gothic', 'gothic-heavy', 'gothic-round', 'brush'] as const) {
    expect(FONT_SOURCES[key].regular).toBeDefined();
  }
});

test('bold falls back to regular when the family has no bold file', () => {
  expect(resolveFontSource('brush', 'bold')).toBe(FONT_SOURCES.brush.regular);
  expect(resolveFontSource('gothic', 'bold')).toBe(FONT_SOURCES.gothic.bold);
  expect(resolveFontSource('mincho', 'light')).toBe(FONT_SOURCES.mincho.regular);
});
```

- [ ] **Step 3: 失敗を確認**

Run: `npx jest src/typesetting/__tests__/fonts.test.ts --runInBand --watchman=false`
Expected: FAIL（モジュールが無い）

- [ ] **Step 4: `src/typesetting/fonts.ts` を実装**

`FONT_SOURCES` は `require('../../assets/fonts/...')`。`useStageTypefaces` は Skia の `useTypeface` を各ファイルに対し呼び、1 つでも `null` なら `null` を返す。

- [ ] **Step 5: `jest/setupSkia.js` に Skia のテキスト系スタブを足す**

既存の mock に重ねて `useTypeface: () => ({ __mockTypeface: true })`、`Skia.Font: (typeface, size) => ({ measureText: (t) => ({ width: size * [...t].length, height: size }), getMetrics: () => ({ ascent: -size * 0.88, descent: size * 0.12 }), getSize: () => size })` を追加する。

- [ ] **Step 6: 通過を確認して型チェック**

Run: `npx jest src/typesetting/__tests__/fonts.test.ts --runInBand --watchman=false && npm run typecheck`
Expected: PASS、型エラーなし

- [ ] **Step 7: コミット**

```bash
git add assets/fonts src/typesetting/fonts.ts src/typesetting/__tests__/fonts.test.ts jest/setupSkia.js
git commit -m "feat: bundle six Japanese OFL fonts and a stage font registry"
```

---

### Task 2: 演出の型、検証、ルールベース演出

**Files:**
- Create: `src/direction/types.ts`
- Create: `src/direction/validateDirection.ts`
- Create: `src/direction/ruleBasedDirector.ts`
- Test: `src/direction/__tests__/validateDirection.test.ts`, `src/direction/__tests__/ruleBasedDirector.test.ts`

**Interfaces:**
- Consumes: `FontKey`, `FontWeight`（Task 1）
- Produces（`types.ts`、設計書の型をそのまま）:
  - `type Size = 'xs' | 's' | 'm' | 'l' | 'xl'`
  - `type Entrance = 'cut' | 'drop' | 'rise' | 'scatter' | 'trace' | 'fade'`
  - `type Hold = 'still' | 'pulse' | 'drift' | 'shake' | 'breathe'`
  - `type Ornament = 'none' | 'rule' | 'frame' | 'grid' | 'circle' | 'numeral'`
  - `type Texture = 'paper' | 'grain' | 'void' | 'scan'`
  - `type TempoFeel = 'still' | 'sway' | 'march' | 'drive'`
  - `interface LineDirection { font: FontKey; weight: FontWeight; size: Size; orientation: 'vertical' | 'horizontal'; entrance: Entrance; hold: Hold; emphasis: number[]; accent: boolean; ornament: Ornament }`
  - `interface Palette { background: string; ink: string; accent: string }`
  - `interface SongDirection { palette: Palette; texture: Texture; tempoFeel: TempoFeel; idleGlyphs: string; lines: LineDirection[] }`
  - `DEFAULT_PALETTE: Palette = { background: '#0B0B0C', ink: '#F2EFE6', accent: '#D7263D' }`
  - `DEFAULT_IDLE_GLYPHS = '0123456789○△□＝ー'`
- Produces: `validateSongDirection(input: unknown, lineTexts: readonly string[]): SongDirection | null`（型・列挙値・`lines.length === lineTexts.length`・emphasis ≤ 3 かつ各行の文字数未満・色は `#RRGGBB` を検査。制約「書体 2 種・xl 3 行・scatter/shake 非連続」に違反したら `null`）
- Produces: `directSongByRules(lines: readonly string[], seed: string): SongDirection`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// validateDirection.test.ts
test('accepts a well-formed direction with matching line count', ...)        // → not null
test('rejects when lines.length differs from lineCount', ...)                // → null
test('rejects more than two fonts in one song', ...)                          // → null
test('rejects more than three xl lines', ...)                                 // → null
test('rejects scatter followed directly by scatter', ...)                     // → null
test('rejects emphasis index beyond the line text length', ...)

// ruleBasedDirector.test.ts
const LINES = ['夜の底で灯りを数える', '走れ！', '', 'tokyo midnight line', 'ああ', ...20行];
test('is deterministic for the same seed', () => expect(directSongByRules(LINES,'a')).toEqual(directSongByRules(LINES,'a')));
test('uses at most two fonts and at most three xl lines', ...);
test('kanji-heavy line gets mincho and short exclamation gets gothic-heavy xl', () => {
  const d = directSongByRules(LINES, 'a');
  expect(d.lines[0].font).toBe('mincho');
  expect(d.lines[1].font).toBe('gothic-heavy'); expect(d.lines[1].size).toBe('xl');
});
test('empty line gets size xs, entrance fade, hold still', ...);
test('passes its own validator', () => expect(validateSongDirection(directSongByRules(LINES,'a'), LINES)).not.toBeNull());
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/direction --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: `types.ts`、`validateDirection.ts`、`ruleBasedDirector.ts` を実装**

ルールベースの規則（設計書 §4 フォールバック）:
- 漢字率（`\p{Script=Han}` の割合）≥ 0.4 → `mincho`、感嘆符（`！!`）か 3 回以上現れる反復行 → `gothic-heavy`、それ以外 → `gothic`。曲全体で使用書体が 3 種になったら 3 番目を `gothic` に寄せる。
- 文字数 ≤ 4 → `xl`（4 行目以降は `l`）、≤ 12 → `l`、≤ 20 → `m`、≤ 30 → `s`、それ以上 → `xs`。
- 縦横: 漢字かな主体 → `vertical`、英数字率 ≥ 0.5 または 20 文字超 → `horizontal`。
- entrance / hold はシード付きハッシュで選ぶが、`scatter`・`shake` の直後は別のものに置き換える。
- `emphasis`: 行中で最初の漢字 1 文字（無ければ空）。`accent`: 反復行のみ true。`ornament`: `xl` なら `rule`、それ以外 `none`。
- 空行: `xs / fade / still / emphasis []`。
- `palette: DEFAULT_PALETTE`、`texture: 'grain'`、`tempoFeel: 'sway'`、`idleGlyphs: DEFAULT_IDLE_GLYPHS`。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/direction --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/direction
git commit -m "feat: add direction types, validator and rule-based director"
```

---

### Task 3: EarFeatures と 60ms メーター変換

**Files:**
- Modify: `src/audio/types.ts`
- Create: `src/audio/earFeaturesFromMeter.ts`
- Modify: `src/audio/useMicrophoneAnalysis.ts:119`（`useAudioRecorderState(meterRecorder, 60)`）、戻り値に `ear` を追加
- Test: `src/audio/__tests__/earFeaturesFromMeter.test.ts`、`src/audio/__tests__/useMicrophoneAnalysis.test.tsx` に 1 件追加

**Interfaces:**
- Produces: `interface EarFeatures { timestampMs: number; rms: number; low: number; mid: number; high: number }`（設計書 §1）
- Produces: `createMeterEarAdapter(): { process(meterDb: number | undefined, timestampMs: number): EarFeatures; reset(): void }`
- Produces: `MicrophoneAnalysis.ear: EarFeatures`（既存の `features` は残す）

- [ ] **Step 1: 失敗するテストを書く**

```ts
test('maps -12 dB to rms 1 and -72 dB or below to 0', ...);
test('low follows rms, and high is larger on a rising sample than on a steady one', () => {
  const a = createMeterEarAdapter();
  a.process(-60, 0);
  const rising = a.process(-20, 60);
  const steady = a.process(-20, 120);
  expect(rising.low).toBeCloseTo(rising.rms, 5);
  expect(rising.high).toBeGreaterThan(steady.high);
  expect(rising.mid).toBeGreaterThan(steady.mid);
});
test('useMicrophoneAnalysis exposes ear with the latest timestamp', ...); // 既存テストのメーター mock を流用
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/audio --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装**

`earFeaturesFromMeter.ts` は `meterFeatureProcessor.ts` の dB→energy 変換（floor −72 / ceiling −12 / sqrt）を再利用し、`rms = energy`、`low = energy`、`rise = max(0, energy − prev)`、`mid = clamp01(energy * 0.6 + rise * 0.4)`、`high = clamp01(energy * 0.3 + rise * 0.7)`。平滑化はしない（拍エンジン側で行う）。`useMicrophoneAnalysis` は同じ `meterState.metering` から `ear` も更新する。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/audio --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/audio
git commit -m "feat: expose EarFeatures from the meter at 60ms"
```

---

### Task 4: 拍エンジン

**Files:**
- Create: `src/beat/types.ts`, `src/beat/beatEngine.ts`
- Test: `src/beat/__tests__/beatEngine.test.ts`, `src/beat/__tests__/syntheticClicks.ts`（テスト用ヘルパー）

**Interfaces:**
- Consumes: `EarFeatures`（Task 3）
- Produces: `interface BeatState { bpm: number | null; confidence: number; phase: number; pulse: number; bar: number; nextBeatAtMs: number | null; energy: number; silence: boolean }`
- Produces: `createBeatEngine(options?: { windowMs?: number; minBpm?: number; maxBpm?: number }): { push(features: EarFeatures): BeatState; reset(): void }`（既定 8000 / 60 / 180）
- Produces: `SILENCE_RMS = 0.018`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// syntheticClicks.ts: generateClicks(bpm, durationMs, intervalMs = 20): EarFeatures[]
//   拍頭で rms=low=0.9、以降 80ms で指数減衰して 0.05 のノイズ床。

test('locks onto 120 BPM clicks within ±3 BPM after 8 seconds', () => {
  const engine = createBeatEngine();
  let state!: BeatState;
  for (const f of generateClicks(120, 10_000)) state = engine.push(f);
  expect(Math.abs(state.bpm! - 120)).toBeLessThanOrEqual(3);
  expect(state.confidence).toBeGreaterThan(0.5);
});
test.each([90, 150])('tracks %i BPM within ±3', ...);
test('pulse rises to >= 0.9 within 30ms of a click and decays below 0.3 within 300ms', ...);
test('phase is near 0 at a click once locked', ...);  // |phase| < 0.08 or > 0.92
test('bar increments every four beats', ...);
test('silence: rms below SILENCE_RMS for 500ms sets silence=true, confidence decays and pulse stays 0', ...);
test('nextBeatAtMs is about one period after the last click when locked', ...);
test('reports bpm null and confidence 0 before the window fills', ...);
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/beat --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: `beatEngine.ts` を実装**

設計書 §3 のアルゴリズム。サンプル列は `timestampMs` 不等間隔を許し、内部で 20ms グリッドにリサンプルする:
- オンセット強度 `o = 0.7·max(0, low − lowPrev) + 0.3·max(0, rms − rmsPrev)`（`lowPrev` は 100ms の移動平均）。
- 500ms ごとに直近 `windowMs` の `o` を自己相関し、`60000/maxBpm`〜`60000/minBpm` ms のラグで最大を探す。ピーク前後 1 サンプルの放物線補間でラグをサブサンプル化する。`confidence = clamp01((peak − mean) / (peak + 1e-6))`、ただし窓が満ちるまで 0。
- 位相は周期で進め、`o` が直近 2 秒の `o` の平均 + 2σ を超えた時刻で `phase` を `0.3` だけ 0 に引き込み、`pulse = 1`。`pulse` は時定数 120ms で指数減衰（300ms 後に < 0.3 になる値）。
- `bar` は位相が 1 を越えた回数 / 4 の整数部。`energy` は rms を時定数 400ms で追従。`silence` は rms < `SILENCE_RMS` が 500ms 続いたとき true、その間 `confidence` を時定数 1s で減衰、`pulse = 0`。
- `nextBeatAtMs = lastBeatAtMs + period`（ロック前は null）。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/beat --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/beat
git commit -m "feat: add the beat engine with tempo lock and pulse"
```

---

### Task 5: 同期時計と行スケジューラ

**Files:**
- Create: `src/sync/lyricClock.ts`, `src/sync/lineScheduler.ts`
- Test: `src/sync/__tests__/lyricClock.test.ts`, `src/sync/__tests__/lineScheduler.test.ts`

**Interfaces:**
- Consumes: `LyricLine { startMs; text }`（`src/recognition/types.ts` 既存）、`BeatState`（Task 4）
- Produces: `interface LyricAnchor { offsetMs: number; anchoredAtMonotonicMs: number }`
- Produces: `songPositionMs(anchor: LyricAnchor, nowMonotonicMs: number): number`（設計書 §2 の式）
- Produces: `interface ScheduledLine { index: number; startedAtMs: number; isEmpty: boolean }`（`index` は −1 で「行なし」）
- Produces: `scheduleLine(lines: readonly LyricLine[], positionMs: number, beat: BeatState, nowMonotonicMs: number, previous: ScheduledLine | null): ScheduledLine`
- Produces: `ALIGN_WINDOW_MS = 80`、`OUTRO_MS = 15_000`
- Produces: `isPastOutro(lines, positionMs): boolean`（最終行の startMs + OUTRO_MS を過ぎたか。フェーズ 2 の再認識トリガーに使う）

- [ ] **Step 1: 失敗するテストを書く**

```ts
test('songPositionMs advances by the monotonic delta', () => expect(songPositionMs({offsetMs: 30_000, anchoredAtMonotonicMs: 1000}, 2500)).toBe(31_500));

const LINES = [{startMs: 0, text: 'a'}, {startMs: 2000, text: ''}, {startMs: 4000, text: 'b'}];
const noBeat: BeatState = { bpm: null, confidence: 0, phase: 0, pulse: 0, bar: 0, nextBeatAtMs: null, energy: 0, silence: false };
test('switches to the line whose startMs has passed', ...);
test('empty text line yields isEmpty true', ...);
test('position before the first line yields index -1', ...);
test('waits for a predicted beat within 80ms when confidence is high', () => {
  const beat = { ...noBeat, confidence: 0.8, nextBeatAtMs: 10_060 };
  const s = scheduleLine(LINES, 4000, beat, 10_000, { index: 0, startedAtMs: 0, isEmpty: false });
  expect(s.index).toBe(0);                      // まだ切り替えない
  expect(scheduleLine(LINES, 4060, beat, 10_060, s).index).toBe(2);
});
test('does not wait for a beat more than 80ms away', ...);
test('ignores beats when confidence is below 0.5', ...);
test('rewinds to an earlier line and restarts its entrance when position jumps back', () => {
  const prev = { index: 2, startedAtMs: 10_000, isEmpty: false };
  const s = scheduleLine(LINES, 500, noBeat, 12_000, prev);
  expect(s.index).toBe(0); expect(s.startedAtMs).toBe(12_000);
});
test('isPastOutro is true 15s after the last line', ...);
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/sync --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装**

`scheduleLine`: `activeLyricIndex`（`src/recognition/lrc.ts` 既存）で候補を求める。候補が `previous.index` と同じならそのまま返す。違う場合、`beat.confidence ≥ 0.5` かつ `beat.nextBeatAtMs` が `nowMonotonicMs` から `(0, 80]` ms 先なら `previous` を返し、それ以外は `{ index, startedAtMs: nowMonotonicMs, isEmpty: text.trim() === '' }`。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/sync --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/sync
git commit -m "feat: add the lyric clock and beat-aligned line scheduler"
```

---

### Task 6: 組版（横書き・縦書き）

**Files:**
- Create: `src/typesetting/layout.ts`
- Test: `src/typesetting/__tests__/layout.test.ts`

**Interfaces:**
- Consumes: `LineDirection`, `Size`（Task 2）
- Produces: `interface Viewport { width: number; height: number; insetTop: number; insetBottom: number }`
- Produces: `interface GlyphMeasure { (char: string, sizePx: number): { advance: number; ascent: number; descent: number } }`
- Produces: `interface PlacedGlyph { char: string; index: number; x: number; y: number; rotateDeg: 0 | 90; sizePx: number; emphasized: boolean }`
- Produces: `interface LineLayout { glyphs: PlacedGlyph[]; sizePx: number; bounds: { x: number; y: number; width: number; height: number }; columns: number }`
- Produces: `SIZE_RATIO: Record<Size, number> = { xs: 0.045, s: 0.06, m: 0.08, l: 0.11, xl: 0.16 }`（`viewport.width` に対する比）
- Produces: `layoutLine(text: string, direction: LineDirection, viewport: Viewport, measure: GlyphMeasure): LineLayout`
- Produces: `ROTATED_IN_VERTICAL = /[A-Za-z0-9ー（）「」『』【】()\[\]<>〈〉…‐–—]/`

- [ ] **Step 1: 失敗するテストを書く**

```ts
const vp = { width: 390, height: 844, insetTop: 59, insetBottom: 34 };
const measure = (ch, size) => ({ advance: size, ascent: -size * 0.88, descent: size * 0.12 });
const base: LineDirection = { font: 'mincho', weight: 'regular', size: 'm', orientation: 'vertical', entrance: 'cut', hold: 'still', emphasis: [], accent: false, ornament: 'none' };

test('vertical: glyphs share x and descend by advance, centered horizontally', ...);
test('vertical: latin letters, digits, chōonpu and brackets are rotated 90', () => {
  const l = layoutLine('東京ーA1（夜）', base, vp, measure);
  expect(l.glyphs.map(g => g.rotateDeg)).toEqual([0, 0, 90, 90, 90, 90, 0, 90]);
});
test('horizontal: glyphs share y and advance by width, left-aligned at 24px', ...);
test('size xl uses 0.16 of the viewport width', () => expect(layoutLine('夜', {...base, size: 'xl'}, vp, measure).sizePx).toBeCloseTo(62.4));
test('emphasized glyphs are one size step larger and flagged', () => {
  const l = layoutLine('夜の底', {...base, emphasis: [0]}, vp, measure);
  expect(l.glyphs[0].emphasized).toBe(true);
  expect(l.glyphs[0].sizePx).toBeCloseTo(vp.width * SIZE_RATIO.l);
});
test('vertical: a line taller than the usable height wraps into a second column to the left', ...);
test('horizontal: a line wider than width-48 wraps into a second row', ...);
test('drops one size step when two columns still do not fit', ...);
test('empty text yields no glyphs and zero bounds', ...);
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/typesetting/__tests__/layout.test.ts --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: `layout.ts` を実装**

使える高さは `height − insetTop − insetBottom − 2·24`、幅は `width − 2·24`。縦書きは 1 列目を画面中央 x に置き、2 列目は左へ `sizePx · 1.4` ずらす。横書きは 24px 左寄せ、行間 `sizePx · 1.3`。折り返しても収まらなければ `size` を 1 段落として再帰（`xs` で打ち切り）。空白文字は advance だけ消費して `glyphs` に入れない。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/typesetting/__tests__/layout.test.ts --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/typesetting/layout.ts src/typesetting/__tests__/layout.test.ts
git commit -m "feat: lay out lyric lines vertically and horizontally"
```

---

### Task 7: 入りと滞留の動き（worklet）

**Files:**
- Create: `src/typesetting/motion.ts`
- Test: `src/typesetting/__tests__/motion.test.ts`

**Interfaces:**
- Consumes: `Entrance`, `Hold`（Task 2）
- Produces: `interface GlyphTransform { dx: number; dy: number; scale: number; opacity: number; rotateDeg: number }`
- Produces: `interface MotionInput { entrance: Entrance; hold: Hold; elapsedMs: number; glyphIndex: number; glyphCount: number; emphasized: boolean; pulse: number; phase: number; bar: number; confidence: number; reducedMotion: boolean; seed: number }`
- Produces: `glyphTransform(input: MotionInput): GlyphTransform`（`'worklet'` 指定。純関数、`Math` のみ使用）
- Produces: `ENTRANCE_DURATION_MS: Record<Entrance, number> = { cut: 0, drop: 420, rise: 420, scatter: 600, trace: 500, fade: 300 }`
- Produces: `entranceDone(entrance: Entrance, glyphCount: number, elapsedMs: number): boolean`

- [ ] **Step 1: 失敗するテストを書く**

```ts
const base: MotionInput = { entrance: 'cut', hold: 'still', elapsedMs: 0, glyphIndex: 0, glyphCount: 5, emphasized: false, pulse: 0, phase: 0, bar: 0, confidence: 1, reducedMotion: false, seed: 1 };
const identity = { dx: 0, dy: 0, scale: 1, opacity: 1, rotateDeg: 0 };

test('cut is identity from the first frame', () => expect(glyphTransform(base)).toEqual(identity));
test('drop starts 40px above with opacity 0 and settles within 420ms', ...);
test('rise starts 24px below', ...);
test('scatter staggers glyphs by 40ms: glyph 3 is still invisible at 100ms, visible at 400ms', ...);
test('trace reveals glyphs in order, 60ms each', ...);
test('fade is opacity-only', ...);
test('reducedMotion returns identity regardless of elapsed', ...);
test('hold pulse scales by 1 + 0.04·pulse (0.08 when emphasized)', ...);
test('hold shake moves at most 1.5px and only when pulse > 0.5', ...);
test('hold breathe scales ±0.02 over a two-bar period', ...);
test('hold drift moves at most 2px', ...);
test('low confidence (< 0.5) damps pulse-driven motion to a quarter', ...);
test('entranceDone is true after duration (+ stagger for scatter/trace)', ...);
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/typesetting/__tests__/motion.test.ts --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: `motion.ts` を実装**

`drop` / `rise` は減衰バネの閉形式 `1 − e^(−6t)·cos(9t)`（t = elapsed/duration）で位置と不透明度を補間。`scatter` は各グリフを `seed` と `glyphIndex` のハッシュで ±30px / ±12° の初期位置から 40ms·index 遅れでバネ収束。`trace` は `elapsed ≥ 60·index` で不透明度 0→1 を 120ms で上げる。滞留は入り完了後だけ効き、`confidence < 0.5` なら pulse 由来の量を 0.25 倍。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/typesetting/__tests__/motion.test.ts --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/typesetting/motion.ts src/typesetting/__tests__/motion.test.ts
git commit -m "feat: add glyph entrance and hold motion worklets"
```

---

### Task 8: 質感シェーダーと背景コンポーネント

**Files:**
- Create: `src/textures/textureShader.ts`, `src/textures/paper.ts`, `src/textures/grain.ts`, `src/textures/void.ts`, `src/textures/scan.ts`, `src/textures/TextureBackground.tsx`
- Test: `src/textures/__tests__/TextureBackground.test.tsx`

**Interfaces:**
- Consumes: `Texture`, `Palette`（Task 2）、`SCENE_SKSL_PRELUDE` のハッシュ/ノイズ関数（`src/scenes/skia/sceneShader.ts` から `hash21`/`vnoise`/`fbm3` を `src/textures/textureShader.ts` に移し、旧 prelude は Task 12 で削除）
- Produces: `TEXTURE_SKSL_PRELUDE`（uniforms: `float2 iResolution; float iTime; float iPulse; float iEnergy; float3 iBackground; float3 iInk; float3 iAccent;` + ノイズ関数）
- Produces: `compileTextureEffect(name: Texture, body: string): SkRuntimeEffect`
- Produces: `TEXTURE_EFFECTS: Record<Texture, SkRuntimeEffect>`
- Produces: `interface TextureBackgroundProps { texture: Texture; palette: Palette; pulse: SharedValue<number>; energy: SharedValue<number>; width: number; height: number; reducedMotion?: boolean }`
- Produces: `TextureBackground(props)`（Skia の `<Fill><Shader/></Fill>` を描く。`iTime` は `useFrameCallback` で進める。`SkiaShaderScene.tsx` の時間・uniform 構成を踏襲）
- Produces: `hexToRgb01(hex: string): [number, number, number]`

- [ ] **Step 1: 失敗するテストを書く**

```ts
test('hexToRgb01 converts #D7263D', () => expect(hexToRgb01('#D7263D').map(v => +v.toFixed(3))).toEqual([0.843, 0.149, 0.239]));
test('renders a shader fill for each texture without throwing', () => { for each texture: render(<TextureBackground .../>) and expect(getByTestId('texture-background')).toBeTruthy() });
test('every texture body declares main and uses iPulse', () => { for each body string expect(/half4 main\(/).toMatch; expect(body).toContain('iPulse') });
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/textures --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装**

4 つのシェーダーは `iBackground` を基調に、`paper`: 低周波の繊維ノイズ + ごく薄い斑、`grain`: フレームごとに変わる粒子（`hash21(fragCoord + fract(iTime)·13)`）、`void`: ほぼ単色 + 中心のわずかな明度、`scan`: 2px 周期の走査線が `iPulse` で位相ずれ。共通で `iPulse · 0.04` の全画面明滅と `iEnergy · 0.03` のビネット緩和、`iAccent` は使わない（文字側の色）。見た目の詳細は実装者に任せる（設計書）。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/textures --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/textures
git commit -m "feat: add four texture shaders and the beat-driven background"
```

---

### Task 9: idle 構成

**Files:**
- Create: `src/typesetting/idleComposition.ts`
- Test: `src/typesetting/__tests__/idleComposition.test.ts`

**Interfaces:**
- Consumes: `Viewport`, `PlacedGlyph`, `GlyphMeasure`（Task 6）、`DEFAULT_IDLE_GLYPHS`（Task 2）
- Produces: `type IdleTrack = { title: string; artist: string } | null`
- Produces: `interface IdleComposition { glyphs: PlacedGlyph[]; caption: { text: string; x: number; y: number; sizePx: number } | null }`
- Produces: `composeIdle(bar: number, glyphs: string, viewport: Viewport, track: IdleTrack, measure: GlyphMeasure): IdleComposition`

- [ ] **Step 1: 失敗するテストを書く**

```ts
test('is deterministic for the same bar', ...);
test('changes between consecutive bars', ...);
test('places between 5 and 9 glyphs on a 3x5 grid, no two in the same cell', ...);
test('uses only characters from the glyph string', ...);
test('caption is "artist — title" bottom-left at size xs when a track is given, null otherwise', ...);
test('falls back to DEFAULT_IDLE_GLYPHS when the string is empty', ...);
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/typesetting/__tests__/idleComposition.test.ts --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装**

`bar` をシードにしたハッシュで個数（5–9）、セル（3 列 × 5 行の格子、使える領域は Task 6 と同じ）、文字、サイズ（`s` か `m`）を選ぶ。グリフは縦書き扱いで `rotateDeg` を `ROTATED_IN_VERTICAL` に従って付ける。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/typesetting/__tests__/idleComposition.test.ts --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/typesetting/idleComposition.ts src/typesetting/__tests__/idleComposition.test.ts
git commit -m "feat: compose idle glyph arrangements per bar"
```

---

### Task 10: LyricStage（描画層）

**Files:**
- Create: `src/typesetting/LyricStage.tsx`, `src/typesetting/useBeatSharedValues.ts`, `src/typesetting/GlyphLayer.tsx`
- Test: `src/typesetting/__tests__/LyricStage.test.tsx`

**Interfaces:**
- Consumes: Task 1 `useStageTypefaces` / `createStageFont`、Task 2 型、Task 4 `BeatState`、Task 5 `ScheduledLine`、Task 6 `layoutLine`、Task 7 `glyphTransform` / `entranceDone`、Task 8 `TextureBackground`、Task 9 `composeIdle`
- Produces:
  - `type StageSource = { kind: 'synced'; lines: readonly LyricLine[]; direction: SongDirection; scheduled: ScheduledLine; track: IdleTrack } | { kind: 'idle'; direction: SongDirection | null; track: IdleTrack }`
  - `interface LyricStageProps { source: StageSource; beat: BeatState; nowMonotonicMs: number; reducedMotion?: boolean }`
  - `LyricStage(props)`: 全画面 `View`（`testID="lyric-stage"`）に `Canvas` を置き、`TextureBackground` → 装飾（`ornament`）→ グリフの順に描く
  - `useBeatSharedValues(beat: BeatState): { pulse; phase; bar; confidence; energy }`（`SharedValue<number>` を `.value` 直接代入で更新。`withTiming` は使わない）
  - `GlyphLayer({ glyphs, font, fonts, lineStartedAtMs, entrance, hold, palette, accent, beat, reducedMotion })`: グリフごとに `<Group transform={useDerivedValue(...)} ><Text .../></Group>`。変形は `glyphTransform` を worklet 内で呼ぶ。`elapsedMs` は `useFrameCallback` で進める `time` 共有値と `lineStartedAtMs` の差。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
const direction = directSongByRules(['夜の底で', '走れ！'], 's');
const beat = { bpm: 120, confidence: 0.9, phase: 0, pulse: 0, bar: 2, nextBeatAtMs: null, energy: 0.3, silence: false };
test('renders the stage and the texture background in idle', ...);           // getByTestId('lyric-stage'), ('texture-background')
test('renders one glyph per non-space character of the active synced line', () => {
  render(<LyricStage source={{ kind: 'synced', lines, direction, scheduled: { index: 0, startedAtMs: 0, isEmpty: false }, track: null }} beat={beat} nowMonotonicMs={100} />);
  expect(getAllByTestId(/^glyph-/)).toHaveLength(4);
});
test('renders idle glyphs when the scheduled line is empty', ...);
test('renders no glyphs but still the background while typefaces are loading', () => {
  jest.spyOn(fonts, 'useStageTypefaces').mockReturnValue(null); ...
});
test('uses the accent colour for emphasized glyphs of an accent line', ...);  // Text の color prop を検査
test('renders the previous and next lines small and faint, and hides them for an xl line', ...);  // testID 'context-prev' / 'context-next'
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/typesetting/__tests__/LyricStage.test.tsx --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装**

- `LyricStage` は `onLayout` で `Viewport` を作り（inset は `useSafeAreaInsets`）、`source` と `viewport` と書体が変わったときだけ `useMemo` で `layoutLine` / `composeIdle` を計算する。`measure` は `createStageFont(typeface, sizePx).measureText(ch).width` と `getMetrics()` から作る。
- `ornament`: `rule` は行の下（縦なら右）に `ink` の 2px 線、`frame` は bounds を 1px 枠、`grid` は使える領域に 3×5 の 0.5px 格子（不透明度 0.18）、`circle` は bounds 中心に半径 `bounds.height·0.6` の 1px 円、`numeral` は右上に `bar % 100` を `gothic` `xs` で描く。`none` は何も描かない。
- 文字色: 通常 `palette.ink`、`accent && emphasized` のとき `palette.accent`。
- 前後行: 前の行を左上（24px, insetTop + 24px）、次の行を右下に、`gothic` `xs` 横書き、不透明度 0.35、`entrance: 'fade'`、`hold: 'still'` で描く（`testID` は `context-prev` / `context-next`）。現在行の `size` が `xl` のとき、または前後行が空のときは描かない。
- idle 構成は `beat.bar` が変わったときに再計算し、`entrance: 'cut'`、`hold: 'pulse'` で描く。
- `reducedMotion` のとき `time` の frame callback を止める。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/typesetting --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/typesetting
git commit -m "feat: render lyric lines and idle glyphs on the Skia stage"
```

---

### Task 11: フィクスチャ曲と開発用再生コントロール

**Files:**
- Create: `src/dev/fixture/fixtureSong.ts`, `src/dev/fixture/useFixturePlayback.ts`, `src/dev/fixture/FixtureControl.tsx`
- Test: `src/dev/fixture/__tests__/fixtureSong.test.ts`, `src/dev/fixture/__tests__/useFixturePlayback.test.tsx`, `src/dev/fixture/__tests__/FixtureControl.test.tsx`

**Interfaces:**
- Consumes: `parseLrc`（既存）、`validateSongDirection`、`directSongByRules`（Task 2）、`LyricAnchor` / `songPositionMs`（Task 5）
- Produces: `FIXTURE_LRC: string`（架空の日本語歌詞 20 行、約 70 秒。漢字の多い行・4 文字以下の叫び・英語行・空行 2 つ・反復行を含む。実在曲の歌詞を使わない）
- Produces: `FIXTURE_DIRECTION: SongDirection`（手書きの演出 JSON。書体 2 種、xl 3 行、縦横混在、6 種の entrance と 5 種の hold をすべて 1 回以上使う。`palette` は黒地白文字 + 赤）
- Produces: `FIXTURE_TRACK: IdleTrack = { title: '仮題', artist: 'MUSICAGE' }`
- Produces: `useFixturePlayback(enabled: boolean): { active: boolean; anchor: LyricAnchor | null; toggle(): void; playPause(): void; seek(deltaMs: number): void; reloadDirection(): void; direction: SongDirection }`
- Produces: `FixtureControl({ playback })`: `__DEV__` のみ描く。右上のピルに `FIX ▶ 0:12` のように状態と位置を表示し、タップで再生/一時停止、長押しで有効/無効、左右の小ボタンで ±5 秒シーク。`useFrameRate` の fps を末尾に添える（`SceneLockControl` の見た目を踏襲）。

- [ ] **Step 1: 失敗するテストを書く**

```ts
test('fixture LRC parses to 20 lines spanning about 70 seconds', ...);
test('fixture direction validates against the fixture lines', () => expect(validateSongDirection(FIXTURE_DIRECTION, lines.map(l => l.text))).not.toBeNull());
test('fixture direction uses every entrance and every hold at least once', ...);
test('useFixturePlayback: toggle activates with anchor offset 0; playPause freezes the position; seek moves ±5000', ...);  // performance.now を mock
test('FixtureControl renders nothing when disabled and the pill with the position when active', ...);
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/dev/fixture --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装**

一時停止は `anchor` を「停止時刻で固定した位置」に差し替えて実現する（`offsetMs = 停止時の位置, anchoredAtMonotonicMs = 停止時刻` を保持し、再開時に `anchoredAtMonotonicMs` を現在時刻へ更新）。`reloadDirection` は `FIXTURE_DIRECTION` を再検証して差し替える（編集→ホットリロード時の確認用）。

- [ ] **Step 4: 通過を確認**

Run: `npx jest src/dev/fixture --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/dev/fixture
git commit -m "feat: add a fictional fixture song and dev playback controls"
```

---

### Task 12: App への組み込みと旧シーンの撤去

**Files:**
- Modify: `src/app/MusicageApp.tsx`
- Modify: `src/app/MusicageApp.test.tsx`
- Delete: `src/scenes/`（全部）、`src/style/`（全部）、`src/dev/sceneLock.ts`、`src/dev/useSceneLock.ts`、`src/dev/SceneLockControl.tsx` とそれらのテスト、`src/components/LyricTypography.tsx` とそのテスト
- Modify: `src/recognition/lyricTiming.ts`（`LyricTypography` だけが使っていた export があれば残す。フェーズ 2 で削除）
- Modify: `README.md`（「What it does」に文字の舞台とフィクスチャ操作を追記、Device validation の Ambient/Jazz の行を置き換え）

**Interfaces:**
- Consumes: Task 3 `microphone.ear`、Task 4 `createBeatEngine`、Task 5 `scheduleLine` / `songPositionMs`、Task 10 `LyricStage` / `StageSource`、Task 11 `useFixturePlayback` / `FixtureControl`
- Produces: `MusicageApp` は `LyricStage` を文字レイヤー（`useBurnInDrift` の `Animated.View`）の中に全画面で描く。`StageSource` の決め方:
  - フィクスチャが有効 → `synced`（`FIXTURE` の行・演出・`scheduleLine` の結果）
  - それ以外で `recognitionState.result` が `timestamped` / `plain` / `instrumental` / `lyrics_unavailable` → `idle`、`track` はその曲名・アーティスト、`direction` は `timestamped` のときだけ `directSongByRules(lines.map(l => l.text), `${artist}/${title}`)`（`idleGlyphs` と `palette` を使うため）、それ以外は `null`
  - それ以外 → `idle`、`track: null`、`direction: null`
- 拍エンジンは `useRef` で 1 つ持ち、`microphone.ear` が変わるたびに `push` し、結果を `useState` に入れる（60ms ごとの再レンダーは許容。`LyricStage` 内の毎フレーム更新は共有値で行う）。
- `nowMonotonicMs` は `performance.now()`。行スケジューラは 50ms の `setInterval` で回し、`ScheduledLine` が変わったときだけ state を更新する。

- [ ] **Step 1: `MusicageApp.test.tsx` を更新（失敗するテスト）**

```tsx
test('renders the lyric stage in idle with no track', ...);                 // getByTestId('lyric-stage')
test('shows the fixture control in development and activates fixture playback', ...);
test('passes the recognized track to the stage as idle caption', ...);      // 既存の AudD mock で result を与える
test('keeps the stage inside the drifting text layer', ...);               // text-layer の子孫に lyric-stage
test('feeds the beat engine from microphone ear features', ...);           // mock の metering を変えて pulse が 0 でなくなる
```

既存の `scene-lock` / `scene-ambient` / `lyric-primary` を見るテストは削除する。

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/app --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: `MusicageApp.tsx` を書き換え、旧ファイルを削除**

`SceneRenderer`、`LyricTypography`、`styleEngine`、`sceneLock` の import と使用を外し、`LyricStage` と `FixtureControl` を置く。`SceneLockControl` の位置（右上ピル）に `FixtureControl` を置く。`RecognitionControls` / `ListeningControls` / `AudDTokenSheet` / `SyncDiagnosticsSheet` はそのまま残す。

- [ ] **Step 4: 全テストと型チェック**

Run: `npm test -- --watchman=false && npm run typecheck`
Expected: 全 PASS、型エラーなし

- [ ] **Step 5: README を更新してコミット**

```bash
git add -A src README.md
git commit -m "feat: replace the scenes with the lyric stage and remove the style engine"
```

- [ ] **Step 6: 実機確認（所有者）**

`npx expo start`（LAN）で Expo Go から開き、以下を見る:
1. 起動直後に黒地の grain 背景と idle グリフが出る。idle グリフと背景は音にかすかに反応し（打音でわずかに明るくなる程度）、ピルが拍の脈動をはっきり示すのは安定した拍が鳴り続けてからでよい（メーター入力では信頼度が 0.5 未満にとどまりやすく、pulse 駆動の動きは 0.25 に減衰されるため）。
2. 右上ピル長押しでフィクスチャを有効化し、行が指示通りに書体・大きさ・縦横を変えて切り替わる。シークで巻き戻ると入りがやり直される。
3. 音楽を鳴らすと、信頼度が上がった後に切り替えが拍に寄る（体感）。
4. 1 分間放置しても落ちず、ピルの fps が 55 以上。
5. 「曲を読み取る」（AudD）後は曲名が idle 構成の左下に出る。

結果を `docs/superpowers/plans/2026-10-18-lyric-typography-phase1.md` 末尾の「実機確認メモ」に日付付きで追記する。

---

## 実機確認メモ

（所有者が記入）

## フェーズ 2 以降

フェーズ 2（Development Build と耳モジュール、AudD と校正系の削除）、フェーズ 3（Claude API 演出ディレクター）、フェーズ 4（仕上げ）は、このフェーズの実機確認後に別の計画として書く。フェーズ 2 は `docs/superpowers/plans/2026-09-06-shazamkit-lyric-sync.md` の Task 1–3（EAS 設定・Swift モジュール・同期時計）を土台にし、帯域解析と自動再認識を足す。
