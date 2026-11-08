# 歌詞タイポグラフィ・オブジェ フェーズ 2 実装計画（Development Build と耳モジュール）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPhone の EAS Development Build 上で、Swift の「耳」モジュール 1 つがマイクを掴み、ShazamKit の認識結果（matchOffset）と vDSP の音響特徴（約 50Hz）を JS に渡し、フェーズ 1 の文字の舞台が実在曲の LRCLIB 行を本当に同期して流す。AudD と校正系は削除し、expo-audio メーターは Expo Go 用フォールバックとしてだけ残す。

**Architecture:** `modules/expo-musicage-ear/` は Expo Modules API の Swift モジュール。1 つの `AVAudioEngine` 入力タップから、(a) `SHSession.matchStreamingBuffer` へ送出（`listenForMatch` 中だけ）、(b) 20ms ホップごとに RMS / low / mid / high を計算して `onFeatures` を送出する。JS 側は `useEar`（ネイティブがあれば `useNativeEar`、無ければ既存の `useMicrophoneAnalysis`）が `EarStream` を出し、`useStageSource` の拍エンジンがそれを購読する。認識は `useEarRecognition` が ShazamKit 結果を `LyricAnchor`（フェーズ 1 の `src/sync/lyricClock.ts`、設計書 §2 の式）に変換し LRCLIB の行と組にして `LyricResult` を出す。自動再認識は純関数のトリガー `createAutoRecognitionTrigger` が決める。ネイティブと JS の単調時計は、ネイティブの同期関数 `now()` との差を測って JS の `performance.now()` 系に変換する。

**Tech Stack:** Expo SDK 57 / React Native 0.86 / TypeScript / Expo Modules API（Swift）/ ShazamKit / AVFoundation + Accelerate(vDSP) / EAS Build（クラウド iOS）/ expo-dev-client / Jest + React Native Testing Library

**Spec:** `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（以下「設計書」）。土台: `docs/superpowers/specs/2026-09-06-shazamkit-lyric-sync-design.md`（以下「ShazamKit 設計」）と `docs/superpowers/plans/2026-09-06-shazamkit-lyric-sync.md`（以下「ShazamKit 計画」）。

## 前提

- 作業ブランチは **`origin/master`（PR beesan82/musicage#4 のマージ `70d0ee5`）** から切る。ローカルの `master` は `18590e0` で止まっており、フェーズ 1 の成果（`src/app/useStageSource.ts`、`src/beat/`、`src/sync/`、`src/typesetting/` など）を含まない。
- ブランチ `codex/shazamkit-lyric-sync` に、実機で動いた ShazamKit モジュールの先行実装がある（`modules/expo-shazamkit/ios/ExpoShazamKitModule.swift` ほか）。本計画はそのファイルを **参照元として読む**（マージしない）。そこで分かった実機の事実:
  - `SHSessionDelegate` は `NSObject` 継承の別クラスで受ける（`Module` に直接付けられない）。
  - 入力ノード直結ではなく、48kHz モノラルの標準フォーマットに変換した `AVAudioMixerNode` にタップを置くと ShazamKit が照合できる。
  - **ミュートしたノードの後段にタップを置くと無音になる**（`mixer.volume = 0` を外して直した履歴がある）。本計画では「タップはミュートより前段、ミュートは `mainMixerNode.outputVolume = 0`」で、マイク音をスピーカーに戻さずに照合する。
  - `didNotFindMatchFor` が `error == nil` で来るのは一時的な不一致なので送出を止めない。
  - `SHMatchedMediaItem.matchOffset` / `predictedCurrentMatchOffset` を使う（`SHMatch` 側ではない）。
- `npm install` / `npx expo install` / `eas` のネットワーク操作はエージェントの権限で失敗する。それらは Task 0 と Task 9 で **所有者が PowerShell で実行する**。実装者は依存が入っていることを `package.json` と `node_modules` で確認してから進む。
- ローカルで `npx expo prebuild` は走らせない（`ios/` ディレクトリを作らない）。ネイティブは EAS がクラウドでビルドする。

## Global Constraints

- iPhone 縦画面のみ。Android の実装は入れない（`expo-module.config.json` の `platforms` は `["apple"]`）。
- ネイティブ → JS のイベントに音声バッファ・`SHMatch`・`SHSignature`・生レスポンスを入れない。渡すのは設計書 §1 の `EarFeatures` と `EarRecognition` のフィールドだけ（型と Task 2 のテストで保証）。
- 音声を端末外に送るのは ShazamKit のフィンガープリントだけ。LRCLIB へ送るのは曲名・アーティスト・アルバム名だけ。
- マイクを掴むのはネイティブモジュール 1 つ。Development Build では expo-audio の録音を使わない。
- 認識（ShazamKit への送出）はフォアグラウンドでボタンまたは自動トリガーが起動したときだけ動き、マッチ確定か 20 秒（`MATCH_TIMEOUT_MS = 20_000`）で止める。音響解析は止めない。
- 自動再認識: LRCLIB 最終行 + 15 秒（既存 `OUTRO_MS`）を過ぎたとき、または無音 4 秒以上（`SILENCE_REARM_MS = 4_000`）の後に音が戻ったとき。定期ポーリングはしない。
- 同期時計は `offsetMs + (performance.now() − anchoredAtMonotonicMs)`（既存 `songPositionMs`）のみ。補正係数・PLL・Kalman は入れない。
- Expo Go（`npx expo start --go`）でも舞台・拍エンジン・フィクスチャは動く。認識だけ `unavailable` になる。
- バンドル ID は `com.musicage.app`。`eas.json` のプロファイルは `development`（developmentClient, internal）/ `preview` / `production`。
- 「同期歌詞」などのラベルは描かない。同期できないときは idle 構成に落ちる。認識失敗・マイク拒否は操作列を出したときだけ 1 行の文で見せる。
- 未追跡の `backup-before-musicage-initial-merge-20260826/` には触れず、ステージしない。
- `package.json` の依存の追加・削除は所有者のコマンドで行う（ロックファイルをオフラインで壊さない）。
- 毎フレーム JS で React を再レンダーしない。拍の状態は「新しい拍頭が立ったとき即時、それ以外は 60ms に 1 回」だけ React に流す。
- コミットメッセージ末尾: 実装セッションのモデルに合わせた `Co-Authored-By:` 行（例: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`）

## Review Focus

- タップのバッファが要求より大きい（iOS は 4096 フレーム前後を返すことがある）: 20ms ホップに分割して各ホップの時刻で送るので、`onFeatures` は 85ms 間隔ではなく 20ms 刻みの時刻で届く。JS 側はイベントを間引かず全部ストリームに流す。→ Task 3 の Swift 構造、Task 4 のテスト（1 tick に 3 イベント → 3 回配信）。
- 同じ曲を再認識した（アウトロ後に同じレコードをもう一度かけた、または無音→音で再認識した）: LRCLIB を呼び直さず `anchor` だけ差し替え、スケジューラは巻き戻る。→ Task 6 のテスト。
- 取り消し・タイムアウト・バックグラウンド遷移の後に届いた ShazamKit 結果: 無視し、状態を変えない。→ Task 6 のテスト。
- ネイティブ時計と JS 時計のずれ: `matchedAtNativeMs` も `onFeatures.t` も `createClockConverter` で JS 時計に変換し、変換後の時刻は単調非減少にする。→ Task 2 のテスト。
- Expo Go（ネイティブ無し）: `useEar` はメーター経路、認識は `unavailable`、「曲を読み取る」は無効で 1 行の説明、フィクスチャは動く。→ Task 4 / Task 8 のテスト。

---

### Task 0: 所有者が行う手順（実装者は代行できない）

**Files:** なし（Apple Developer ポータル、EAS、`package.json` への依存追加）

**Interfaces:**
- Produces: App ID `com.musicage.app`（ShazamKit App Service 有効）、EAS に登録された開発用 iPhone、`app.json` の `extra.eas.projectId`、`package.json` の `expo-dev-client`

- [ ] **Step 1: Apple Developer ポータルで App ID を作る**

https://developer.apple.com/account/resources/identifiers/list で「Identifiers +」→ App IDs → App。Description `MUSICAGE`、Bundle ID は **Explicit** で `com.musicage.app`。「App Services」タブで **ShazamKit** にチェックして登録する（ShazamKit は entitlement ではなく App Service なので、後から有効化しても証明書の作り直しは不要）。

- [ ] **Step 2: EAS CLI を入れてログインを確認する（PowerShell）**

```powershell
npm install -g eas-cli
eas whoami
```

Expected: `beesan` と表示される。表示されなければ `eas login`。

- [ ] **Step 3: 開発用 iPhone を EAS に登録する**

```powershell
eas device:create
```

Expected: 表示された URL（または QR）を iPhone の Safari で開き、プロビジョニング用プロファイルをインストールすると、その UDID が EAS の Apple チームに登録される。Apple ID のログインを求められたら Developer Program のアカウントで入る。

- [ ] **Step 4: 依存を追加して EAS プロジェクトを作る（PowerShell、リポジトリのルートで）**

> **superseded（2026-11-08 注記）**: この Step の `eas init` は **実行しない**。EAS プロジェクトは 2026 年 9 月の ShazamKit 版で作成済みで、既存の `projectId`（所有者 `beesan`）を `app.json` に引き継いだ（進捗記録 Ruling 9、`AGENTS.md`「EAS」）。`eas init` を実行すると別の EAS プロジェクトができてしまう。`expo-dev-client` の追加は所有者が 2026-10-20 に実施済み。本文は履歴として残す。

```powershell
npx expo install expo-dev-client
eas init
```

Expected: `package.json` に `"expo-dev-client": "~57.0.x"` が入り、`app.json` の `expo.extra.eas.projectId` に UUID が書かれる。`eas init` がプロジェクト名を聞いたら `musicage` のまま。両ファイルの差分はコミットせずに残す（Task 1 がまとめてコミットする）。

- [ ] **Step 5: 実装者に合図する**

`git status` の結果（`package.json`、`package-lock.json`、`app.json` が変更されていること）と `eas whoami` の出力を実装者に伝える。初回の `eas build`（Apple ログインと証明書生成の承認）は Task 9 で行う。

---

### Task 1: Development Build の設定

**Files:**
- Create: `eas.json`
- Modify: `app.json`（`ios.bundleIdentifier`、マイク権限文、Task 0 の `projectId` を含めてコミット）
- Modify: `tsconfig.json`（`include` に `modules/**/*.ts`）
- Modify: `package.json`（Task 0 で入った `expo-dev-client` を確認してコミット。`start:go` スクリプトを追加）
- Test: `src/app/__tests__/appConfig.test.ts`

**Interfaces:**
- Produces: `eas.json` のプロファイル `development` / `preview` / `production`（ShazamKit 計画 Task 1 Step 3 と同じ）
- Produces: `app.json` の `expo.ios.bundleIdentifier = "com.musicage.app"`、`expo.ios.infoPlist.NSMicrophoneUsageDescription`、`expo-audio` プラグインの `microphonePermission` を同じ文に更新
- Produces: `npm run start:go`（`expo start --go`、Expo Go フォールバック用）

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/app/__tests__/appConfig.test.ts
import appJson from '../../../app.json';
import easJson from '../../../eas.json';
import packageJson from '../../../package.json';

const PERMISSION_COPY = '周囲で流れている音楽を聴き取り、曲を認識して歌詞を表示するためにマイクを使用します。音声は端末の外に送らず、保存もしません（曲の照合には ShazamKit のフィンガープリントだけを使います）。';

test('the iOS app is com.musicage.app with a ShazamKit-era microphone copy', () => {
  expect(appJson.expo.ios.bundleIdentifier).toBe('com.musicage.app');
  expect(appJson.expo.ios.infoPlist.NSMicrophoneUsageDescription).toBe(PERMISSION_COPY);
  const audioPlugin = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-audio') as [string, { microphonePermission: string }];
  expect(audioPlugin[1].microphonePermission).toBe(PERMISSION_COPY);
  expect(JSON.stringify(appJson)).not.toMatch(/AudD/);
  expect(appJson.expo.extra.eas.projectId).toMatch(/^[0-9a-f-]{36}$/);
});

test('eas.json has a development client profile with internal distribution', () => {
  expect(easJson.build.development).toEqual({ developmentClient: true, distribution: 'internal' });
  expect(easJson.build.preview).toEqual({ distribution: 'internal' });
  expect(easJson.build.production).toEqual({});
});

test('expo-dev-client is a dependency and Expo Go keeps a start script', () => {
  expect(packageJson.dependencies['expo-dev-client']).toMatch(/^~57\./);
  expect(packageJson.scripts['start:go']).toBe('expo start --go');
});
```

`tsconfig.json` の `resolveJsonModule` は `expo/tsconfig.base` が有効にしている。`include` に `src/app/__tests__/appConfig.test.ts` は既に入る（`src/**/*.ts`）。

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/app/__tests__/appConfig.test.ts --runInBand --watchman=false`
Expected: FAIL（`eas.json` が無い、`bundleIdentifier` が無い）

- [ ] **Step 3: 設定を書く**

`eas.json`（2026-11-08 注記: 実際のコミットでは `appVersionSource` を `remote` にした（Ruling 9、既存 EAS プロジェクトの設定に合わせるため）。下の例は `remote` に直してある）:

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": {}
  }
}
```

`app.json` に `"ios": { "bundleIdentifier": "com.musicage.app", "infoPlist": { "NSMicrophoneUsageDescription": <PERMISSION_COPY> } }` を追加し、`expo-audio` プラグインの `microphonePermission` を同じ文に替える。`tsconfig.json` の `include` を `["App.tsx", "src/**/*.ts", "src/**/*.tsx", "modules/**/*.ts"]` にする。`package.json` の `scripts` に `"start:go": "expo start --go"`。

- [ ] **Step 4: 通過を確認して型チェック**

Run: `npx jest src/app/__tests__/appConfig.test.ts --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add eas.json app.json tsconfig.json package.json package-lock.json src/app/__tests__/appConfig.test.ts
git commit -m "feat: configure the EAS development build for com.musicage.app"
```

---

### Task 2: 耳モジュールの JS 契約（型・写像・時計変換）

**Files:**
- Create: `modules/expo-musicage-ear/src/types.ts`
- Create: `modules/expo-musicage-ear/src/mapNative.ts`
- Create: `modules/expo-musicage-ear/src/clockConverter.ts`
- Create: `modules/expo-musicage-ear/src/index.ts`
- Create: `modules/expo-musicage-ear/package.json`（`{ "name": "expo-musicage-ear", "version": "0.1.0", "private": true, "main": "src/index.ts" }`。依存には入れない。autolinking は `modules/` を自動で見る）
- Test: `modules/expo-musicage-ear/src/__tests__/mapNative.test.ts`, `modules/expo-musicage-ear/src/__tests__/clockConverter.test.ts`, `modules/expo-musicage-ear/src/__tests__/index.test.ts`

**Interfaces:**
- Produces（`types.ts`、設計書 §1 の型をそのまま）:
  - `interface EarFeatures { timestampMs: number; rms: number; low: number; mid: number; high: number }`
  - `interface EarRecognition { trackId: string; title: string; artist: string; album?: string; artworkUrl?: string; matchedAtMonotonicMs: number; currentOffsetMs: number }`
  - `type EarErrorCode = 'microphone_denied' | 'audio_setup_failed' | 'interrupted' | 'match_timeout' | 'match_failed' | 'invalid_match'`
  - `interface EarError { code: EarErrorCode }`
  - `interface Subscription { remove(): void }`
  - ネイティブ生イベント: `interface NativeFeaturesEvent { t: number; rms: number; low: number; mid: number; high: number }`（`t` はネイティブ単調時計 ms）、`interface NativeRecognitionEvent { trackId: string; title: string; artist: string; album?: string | null; artworkUrl?: string | null; matchedAtNativeMs: number; currentOffsetMs: number }`
  - `NATIVE_MODULE_NAME = 'ExpoMusicageEar'`、`NATIVE_EVENTS = ['onFeatures', 'onRecognition', 'onEarError'] as const`、`NATIVE_FUNCTIONS = ['now', 'startListening', 'stopListening', 'listenForMatch', 'cancelMatch'] as const`（Task 3 の Swift と突き合わせる）
  - `interface NativeEarModule { now(): number; startListening(): Promise<void>; stopListening(): Promise<void>; listenForMatch(timeoutMs: number): Promise<void>; cancelMatch(): Promise<void>; addListener(name: 'onFeatures', l: (e: NativeFeaturesEvent) => void): Subscription; addListener(name: 'onRecognition', l: (e: NativeRecognitionEvent) => void): Subscription; addListener(name: 'onEarError', l: (e: EarError) => void): Subscription }`
- Produces（`mapNative.ts`）:
  - `mapNativeFeatures(e: NativeFeaturesEvent, toJsMs: (nativeMs: number) => number): EarFeatures`（4 値を 0..1 にクランプ。余分なキーは落とす）
  - `mapNativeRecognition(e: NativeRecognitionEvent, toJsMs: (nativeMs: number) => number): EarRecognition | null`（`trackId` 空、`currentOffsetMs` が非有限または負なら `null`。`album` / `artworkUrl` は空文字・null なら省く）
- Produces（`clockConverter.ts`）:
  - `interface ClockConverter { offsetMs: number; toJsMs(nativeMs: number): number }`
  - `createClockConverter(nativeNow: () => number, jsNow: () => number = () => performance.now(), samples = 5): ClockConverter`（`nativeNow() − jsNow()` を `samples` 回測り中央値を `offsetMs` とする。`toJsMs` は `nativeMs − offsetMs` を返し、直前の戻り値より小さければ直前の値を返す = 単調非減少）
- Produces（`index.ts`）:
  - `interface EarModule { now(): number; startListening(): Promise<void>; stopListening(): Promise<void>; listenForMatch(timeoutMs: number): Promise<void>; cancelMatch(): Promise<void>; addFeaturesListener(l: (f: EarFeatures) => void): Subscription; addRecognitionListener(l: (r: EarRecognition) => void): Subscription; addErrorListener(l: (e: EarError) => void): Subscription }`
  - `createEarModule(native: NativeEarModule, converter: ClockConverter): EarModule`（リスナー登録時に写像を挟む。`mapNativeRecognition` が `null` なら `onEarError { code: 'invalid_match' }` としてエラーリスナーに回す）
  - `loadNativeEarModule(): NativeEarModule | null`（`expo-modules-core` の `requireOptionalNativeModule<NativeEarModule>(NATIVE_MODULE_NAME)`。例外は `null`）
  - `ExpoMusicageEar: EarModule | null`（モジュール読み込み時に `loadNativeEarModule()` が非 null なら `createEarModule(native, createClockConverter(() => native.now()))`、Expo Go と jest では `null`）

- [ ] **Step 1: 失敗するテストを書く**

```ts
// mapNative.test.ts
const identity = (ms: number) => ms;
test('maps features onto the JS clock and clamps to 0..1', () => {
  expect(mapNativeFeatures({ t: 1000, rms: 1.2, low: -0.1, mid: 0.5, high: 0.25 }, (ms) => ms - 400))
    .toEqual({ timestampMs: 600, rms: 1, low: 0, mid: 0.5, high: 0.25 });
});
test('drops unknown keys so no audio can ride along', () => {
  const f = mapNativeFeatures({ t: 0, rms: 0, low: 0, mid: 0, high: 0, samples: [1, 2, 3] } as never, identity);
  expect(Object.keys(f).sort()).toEqual(['high', 'low', 'mid', 'rms', 'timestampMs']);
});
test('maps a recognition and omits empty album and artwork', () => {
  expect(mapNativeRecognition({ trackId: 't1', title: 'Song', artist: 'Artist', album: '', artworkUrl: null, matchedAtNativeMs: 5000, currentOffsetMs: 12345 }, (ms) => ms - 400))
    .toEqual({ trackId: 't1', title: 'Song', artist: 'Artist', matchedAtMonotonicMs: 4600, currentOffsetMs: 12345 });
});
test('rejects an empty track id or a negative offset', () => {
  expect(mapNativeRecognition({ trackId: '', title: 'x', artist: 'y', matchedAtNativeMs: 0, currentOffsetMs: 1 }, identity)).toBeNull();
  expect(mapNativeRecognition({ trackId: 't', title: 'x', artist: 'y', matchedAtNativeMs: 0, currentOffsetMs: -1 }, identity)).toBeNull();
});
test('recognition exposes exactly the spec fields', () => {
  const r = mapNativeRecognition({ trackId: 't', title: 'x', artist: 'y', album: 'A', artworkUrl: 'https://img', matchedAtNativeMs: 0, currentOffsetMs: 1, raw: {} } as never, identity)!;
  expect(Object.keys(r).sort()).toEqual(['album', 'artist', 'artworkUrl', 'currentOffsetMs', 'matchedAtMonotonicMs', 'title', 'trackId']);
});

// clockConverter.test.ts
test('offset is the median of native minus js samples', () => {
  const native = [1000, 1001, 1500, 1002, 1003][Symbol.iterator]();
  const js = [0, 0, 0, 0, 0][Symbol.iterator]();
  const c = createClockConverter(() => native.next().value, () => js.next().value);
  expect(c.offsetMs).toBe(1002);
  expect(c.toJsMs(2002)).toBe(1000);
});
test('toJsMs never goes backwards', () => {
  const c = createClockConverter(() => 100, () => 0, 1);
  expect(c.toJsMs(500)).toBe(400);
  expect(c.toJsMs(480)).toBe(400);
  expect(c.toJsMs(520)).toBe(420);
});

// index.test.ts
test('ExpoMusicageEar is null when the native module is absent (Expo Go, jest)', () => {
  expect(ExpoMusicageEar).toBeNull();
});
test('createEarModule converts events and routes an invalid match to the error listener', () => {
  const listeners: Record<string, (e: unknown) => void> = {};
  const native = { now: () => 0, startListening: jest.fn(), stopListening: jest.fn(), listenForMatch: jest.fn(), cancelMatch: jest.fn(),
    addListener: jest.fn((name: string, l: (e: unknown) => void) => { listeners[name] = l; return { remove: jest.fn() }; }) };
  const ear = createEarModule(native as never, { offsetMs: 100, toJsMs: (ms) => ms - 100 });
  const onFeatures = jest.fn(); const onRecognition = jest.fn(); const onError = jest.fn();
  ear.addFeaturesListener(onFeatures); ear.addRecognitionListener(onRecognition); ear.addErrorListener(onError);
  listeners.onFeatures({ t: 300, rms: 0.5, low: 0.5, mid: 0.5, high: 0.5 });
  expect(onFeatures).toHaveBeenCalledWith({ timestampMs: 200, rms: 0.5, low: 0.5, mid: 0.5, high: 0.5 });
  listeners.onRecognition({ trackId: '', title: '', artist: '', matchedAtNativeMs: 0, currentOffsetMs: 0 });
  expect(onRecognition).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith({ code: 'invalid_match' });
  listeners.onRecognition({ trackId: 't', title: 'S', artist: 'A', matchedAtNativeMs: 1100, currentOffsetMs: 30000 });
  expect(onRecognition).toHaveBeenCalledWith({ trackId: 't', title: 'S', artist: 'A', matchedAtMonotonicMs: 1000, currentOffsetMs: 30000 });
});
test('commands pass straight through to the native module', async () => {
  await ear.listenForMatch(20_000);
  expect(native.listenForMatch).toHaveBeenCalledWith(20_000);
  await ear.startListening(); await ear.stopListening(); await ear.cancelMatch();
  expect(native.startListening).toHaveBeenCalledTimes(1);
  expect(native.stopListening).toHaveBeenCalledTimes(1);
  expect(native.cancelMatch).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest modules/expo-musicage-ear --runInBand --watchman=false`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装**

`index.ts` の `loadNativeEarModule` は `try { return requireOptionalNativeModule(NATIVE_MODULE_NAME) ?? null } catch { return null }`。`createEarModule` の `addRecognitionListener` は `native.addListener('onRecognition', e => { const r = mapNativeRecognition(e, converter.toJsMs); r ? l(r) : errorListeners.forEach(el => el({ code: 'invalid_match' })) })`。エラーリスナーの集合はモジュール内で保持し、`addErrorListener` はネイティブ `onEarError` の購読と集合への登録を 1 つの `Subscription` にまとめる。

- [ ] **Step 4: 通過を確認して型チェック**

Run: `npx jest modules/expo-musicage-ear --runInBand --watchman=false && npm run typecheck`
Expected: PASS（`tsconfig.json` の `include` に `modules/**/*.ts` が入っているので型チェック対象になる）

- [ ] **Step 5: コミット**

```bash
git add modules/expo-musicage-ear/package.json modules/expo-musicage-ear/src
git commit -m "feat: define the ear module's JS contract and clock conversion"
```

---

### Task 3: Swift の耳モジュール（ShazamKit + vDSP）

**Files:**
- Create: `modules/expo-musicage-ear/expo-module.config.json`
- Create: `modules/expo-musicage-ear/ios/ExpoMusicageEar.podspec`
- Create: `modules/expo-musicage-ear/ios/EarAnalyzer.swift`（純粋な DSP。Expo に依存しない）
- Create: `modules/expo-musicage-ear/ios/ExpoMusicageEarModule.swift`（エンジン・セッション・イベント）
- Test: `modules/expo-musicage-ear/src/__tests__/nativeContract.test.ts`（Swift ソースを文字列として読み、関数名・イベント名・禁止事項を突き合わせる。Windows に Swift コンパイラは無いので、コンパイルは Task 9 の EAS ビルドで確認する）

**Interfaces:**
- Consumes: Task 2 の `NATIVE_EVENTS`、`NATIVE_FUNCTIONS`、`NativeFeaturesEvent`、`NativeRecognitionEvent`、`EarErrorCode`
- Produces: Expo モジュール `ExpoMusicageEar`。`Function("now")` は `ProcessInfo.processInfo.systemUptime * 1000`（Double）。`AsyncFunction("startListening")` / `("stopListening")` / `("listenForMatch", timeoutMs: Double)` / `("cancelMatch")`。`Events("onFeatures", "onRecognition", "onEarError")`。
- Produces: `struct EarFrame { let hostTimeSeconds: Double; let rms: Float; let low: Float; let mid: Float; let high: Float }`、`final class EarAnalyzer { init(sampleRate: Double = 48_000); func push(_ samples: UnsafePointer<Float>, count: Int, bufferStartHostTime: UInt64, onFrame: (EarFrame) -> Void) }`

- [ ] **Step 1: 失敗する契約テストを書く**

```ts
// nativeContract.test.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { NATIVE_EVENTS, NATIVE_FUNCTIONS, NATIVE_MODULE_NAME } from '../types';

const ios = (f: string) => readFileSync(join(__dirname, '..', '..', 'ios', f), 'utf8');

test('the Swift module declares exactly the JS contract', () => {
  const src = ios('ExpoMusicageEarModule.swift');
  expect(src).toContain(`Name("${NATIVE_MODULE_NAME}")`);
  expect(src).toContain(`Events(${NATIVE_EVENTS.map((e) => `"${e}"`).join(', ')})`);
  expect(src).toContain('Function("now")');
  for (const fn of NATIVE_FUNCTIONS.filter((f) => f !== 'now')) expect(src).toContain(`AsyncFunction("${fn}")`);
});
test('events carry only scalar fields named in the contract', () => {
  const src = ios('ExpoMusicageEarModule.swift');
  for (const key of ['"t"', '"rms"', '"low"', '"mid"', '"high"']) expect(src).toContain(key);
  for (const key of ['"trackId"', '"title"', '"artist"', '"album"', '"artworkUrl"', '"matchedAtNativeMs"', '"currentOffsetMs"']) expect(src).toContain(key);
  expect(src).not.toMatch(/sendEvent\([^)]*buffer/);
  expect(src).not.toMatch(/"signature"|"mediaItem"|"match":/);
});
test('the tap sits before the mute and the mic is never played back', () => {
  const src = ios('ExpoMusicageEarModule.swift');
  expect(src).toContain('mainMixerNode.outputVolume = 0');
  expect(src).toMatch(/analysisMixer\.installTap/);
  expect(src).not.toMatch(/analysisMixer\.(volume|outputVolume) = 0/);
});
test('the module config targets apple only and names the module class', () => {
  const config = JSON.parse(readFileSync(join(__dirname, '..', '..', 'expo-module.config.json'), 'utf8'));
  expect(config).toEqual({ platforms: ['apple'], apple: { modules: ['ExpoMusicageEarModule'] } });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest modules/expo-musicage-ear/src/__tests__/nativeContract.test.ts --runInBand --watchman=false`
Expected: FAIL（ファイルが無い）

- [ ] **Step 3: `expo-module.config.json` と podspec を書く**

`expo-module.config.json`: `{ "platforms": ["apple"], "apple": { "modules": ["ExpoMusicageEarModule"] } }`。
podspec は `codex/shazamkit-lyric-sync:modules/expo-shazamkit/ios/ExpoShazamKit.podspec` を元に、`s.name = 'ExpoMusicageEar'`、`s.platforms = { :ios => '16.0' }`、`s.source_files = '*.swift'`、`s.dependency 'ExpoModulesCore'`、`s.frameworks = 'ShazamKit', 'AVFoundation', 'Accelerate'`。

- [ ] **Step 4: `EarAnalyzer.swift` を実装**

決めること（設計書「実装者に任せること」のうち、拍エンジンの閾値を引き継ぐために固定する）:
- 入力は 48kHz モノラル Float32。ホップ `HOP = 960` フレーム（20ms）、解析窓 `N = 1024`（直近 1024 サンプル、Hann 窓、`vDSP_fft_zrip` log2n = 10 または `vDSP.FFT`）。タップのバッファ長に関係なく、内部リングバッファに積み、960 サンプル溜まるごとに 1 フレーム出す（余りは次の呼び出しへ持ち越す）。
- フレームの時刻 `hostTimeSeconds` = `AVAudioTime.seconds(forHostTime: bufferStartHostTime) + (そのホップ末尾のサンプル位置 / sampleRate)`。これは `mach_absolute_time` 系で、`ProcessInfo.systemUptime` と同じ時計。
- `rms` = 直近 960 サンプルの RMS を dBFS にし、フェーズ 1 のメーター写像と同じ **floor −72 dB / ceiling −12 dB で 0..1 に線形化してから平方根**（`src/audio/meterFeatureProcessor.ts` と同じ。`SILENCE_RMS = 0.018` がそのまま効く）。
- 帯域: 周波数ビン幅 46.875Hz。`low` = ビン 1–4（< 200Hz）、`mid` = ビン 5–42（200Hz–2kHz）、`high` = ビン 43–511（> 2kHz）。各帯域のパワー和を Parseval で「全ビン和 = 時間領域 RMS²」になるよう正規化し、帯域 RMS を `rms` と同じ dB 写像で 0..1 にする。
- 計算はすべてオーディオスレッドで行い、割り当てを避ける（セットアップとバッファは `init` で確保）。

- [ ] **Step 5: `ExpoMusicageEarModule.swift` を実装**

構造（`codex/shazamkit-lyric-sync` のモジュールを土台にし、1 タップ化と解析を足す）:

```swift
public final class ExpoMusicageEarModule: Module {
  // AVAudioEngine, analysisMixer (AVAudioMixerNode), analyzer (EarAnalyzer),
  // session: SHSession?, sessionDelegate: EarSessionDelegate?, matchTimer: DispatchWorkItem?
  // eventQueue = DispatchQueue(label: "musicage.ear.events")
  public func definition() -> ModuleDefinition {
    Name("ExpoMusicageEar")
    Events("onFeatures", "onRecognition", "onEarError")
    Function("now") { ProcessInfo.processInfo.systemUptime * 1_000 }
    AsyncFunction("startListening") { ... }
    AsyncFunction("stopListening") { ... }
    AsyncFunction("listenForMatch") { (timeoutMs: Double) in ... }
    AsyncFunction("cancelMatch") { ... }
    OnDestroy { stopListening() }
  }
}
```

- `startListening`: マイク権限を要求（iOS 17+ は `AVAudioApplication.requestRecordPermission`、それ未満は `AVAudioSession.requestRecordPermission`）。拒否なら `onEarError { code: "microphone_denied" }`。`AVAudioSession` は `.playAndRecord` / `.measurement` / `[.mixWithOthers]`。グラフは `inputNode → analysisMixer（48kHz mono 標準フォーマットに変換）→ mainMixerNode → outputNode`、**`engine.mainMixerNode.outputVolume = 0`**（マイク音をスピーカーに戻さない。タップはその前段の `analysisMixer` に置く）。`analysisMixer.installTap(onBus: 0, bufferSize: 1024, format: 48kHz mono)`。タップ内で (a) `matching == true` なら `session?.matchStreamingBuffer(buffer, at: when)`、(b) `analyzer.push(...)` し、各フレームを `eventQueue` で `sendEvent("onFeatures", ["t": seconds * 1000, "rms": ..., "low": ..., "mid": ..., "high": ...])`。既に動いていれば何もしない。失敗は `onEarError { code: "audio_setup_failed" }`。
- `AVAudioSession.interruptionNotification` を購読し、`.began` で `onEarError { code: "interrupted" }`、`.ended` で（`shouldResume` なら）エンジンを再始動する。
- `listenForMatch(timeoutMs)`: 新しい `SHSession()` とデリゲート（`NSObject` 継承の `EarSessionDelegate`）を作って `matching = true`。`timeoutMs` 後に `matching = false`、`session = nil`、`onEarError { code: "match_timeout" }`。既にマッチ中なら何もしない。`startListening` 前なら `audio_setup_failed`。
- `cancelMatch`: タイマー取り消し、`matching = false`、`session = nil`。イベントは出さない。
- `didFind match`: 先頭の `SHMatchedMediaItem` から `predictedCurrentMatchOffset`（非有限なら `matchOffset`）を秒→ms に。`matching = false`、タイマー取り消し、`sendEvent("onRecognition", ["trackId": item.shazamID ?? "", "title": item.title ?? "", "artist": item.artist ?? "", "album": NSNull(), "artworkUrl": item.artworkURL?.absoluteString ?? NSNull(), "matchedAtNativeMs": ProcessInfo.processInfo.systemUptime * 1_000, "currentOffsetMs": offsetMs])`。`SHMediaItem` にアルバム名のプロパティは無い（先行実装が `albumTitle` を外した履歴がある）ので `album` は `NSNull()` 固定にし、JS 側が省く。LRCLIB 検索は曲名とアーティストだけで行う。
- `didNotFindMatchFor signature, error`: `error == nil` なら何もしない（送出継続）。`error != nil` なら `matching = false`、`onEarError { code: "match_failed" }`。
- `stopListening`: タップ除去、エンジン停止、`cancelMatch()`、セッション非アクティブ化。

- [ ] **Step 6: 契約テストの通過と型チェック**

Run: `npx jest modules/expo-musicage-ear --runInBand --watchman=false && npm run typecheck`
Expected: PASS。Swift のコンパイルは Task 9 Step 2 の EAS ビルドログで確認し、エラーはそのログで直す。

- [ ] **Step 7: コミット**

```bash
git add modules/expo-musicage-ear
git commit -m "feat: add the Swift ear module with ShazamKit matching and vDSP features"
```

---

### Task 4: EarStream、ネイティブ耳フック、経路の選択

**Files:**
- Create: `src/audio/earStream.ts`
- Create: `src/audio/useNativeEar.ts`
- Create: `src/audio/useEar.ts`
- Modify: `src/audio/types.ts`（`EarFeatures` を `modules/expo-musicage-ear/src/types` から再エクスポートし、ローカル定義を消す）
- Modify: `src/audio/useMicrophoneAnalysis.ts`（`earStream` を追加。`pauseForRecognition` / `resumeAfterRecognition` と `recognitionPauseRef` 系を削除）
- Modify: `src/audio/__tests__/useMicrophoneAnalysis.test.tsx`（pause/resume の 2 テストを削除、`earStream` のテストを 1 件追加）
- Modify: `src/app/MusicageApp.tsx`, `src/app/MusicageApp.test.tsx`（`createAnalysis` の mock から `pauseForRecognition` / `resumeAfterRecognition` を外し `earStream: createEarEmitter()` を足す。App は Step 4 のとおり一時的な定数で `useSongRecognition` の型を通す）
- Test: `src/audio/__tests__/earStream.test.ts`, `src/audio/__tests__/useNativeEar.test.tsx`, `src/audio/__tests__/useEar.test.tsx`

**Interfaces:**
- Consumes: Task 2 `ExpoMusicageEar`, `EarModule`, `EarFeatures`, `EarError`
- Produces（`earStream.ts`）: `interface EarStream { subscribe(listener: (f: EarFeatures) => void): () => void }`、`interface EarEmitter extends EarStream { emit(f: EarFeatures): void }`、`createEarEmitter(): EarEmitter`
- Produces（`useNativeEar.ts`）:
  - `type ListeningStatus` は既存の `useMicrophoneAnalysis` のものを `src/audio/types.ts` に移して共有（`'idle' | 'requesting' | 'listening' | 'denied' | 'error'`）
  - `interface Ear { kind: 'native' | 'meter'; status: ListeningStatus; errorMessage: string | null; earStream: EarStream; start(): Promise<void>; stop(): void; retry(): Promise<void>; recognizer: EarModule | null }`
  - `useNativeEar(module: EarModule): Ear`（`kind: 'native'`、`recognizer: module`。null を受けない: 呼び分けは `useEar` が行う）
  - `NATIVE_EAR_ERROR_COPY: Record<'audio_setup_failed' | 'interrupted', string>` = `{ audio_setup_failed: 'マイクを開始できませんでした。もう一度試してください。', interrupted: '通話などで音声が中断しました。もう一度試してください。' }`
- Produces（`useEar.ts`）: `const NATIVE_EAR: EarModule | null = ExpoMusicageEar`、`useEar(): Ear`（`NATIVE_EAR !== null ? useNativeEar(NATIVE_EAR) : useMeterEar()`。モジュール読み込み時に決まりプロセス中に変わらないので hooks の順序は安定）。`useMeterEar(): Ear` は `useMicrophoneAnalysis()` を包み `kind: 'meter'`, `recognizer: null`
- `ListeningStatus` の移動に合わせ、`useMicrophoneAnalysis.ts` は `export type { ListeningStatus } from './types'` で再エクスポートし、既存の import 元（`ListeningControls`、`useStageSource`、`MusicageApp`）は触らない
- Produces（`useMicrophoneAnalysis.ts`）: `MicrophoneAnalysis` に `earStream: EarStream` を追加（`setEar` と同じ場所で `emitter.emit`）、`pauseForRecognition` / `resumeAfterRecognition` を削除

- [ ] **Step 1: 失敗するテストを書く**

```ts
// earStream.test.ts
test('delivers every frame to every subscriber, and unsubscribe stops delivery', ...);

// useNativeEar.test.tsx  — module は jest.fn() の束で渡す
test('start requests native listening and enters listening', async () => {
  const { result } = renderHook(() => useNativeEar(fakeModule));
  await act(() => result.current.start());
  expect(fakeModule.startListening).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('listening');
});
test('microphone_denied puts the ear in denied with no error copy', ...);        // errorMessage null、status 'denied'
test('audio_setup_failed and interrupted enter error with their copy', ...);
test('forwards three native frames arriving in one tick as three stream frames', () => {
  const frames: EarFeatures[] = [];
  result.current.earStream.subscribe((f) => frames.push(f));
  act(() => { for (const t of [0, 20, 40]) emitFeatures({ timestampMs: t, rms: 0.5, low: 0.5, mid: 0.5, high: 0.5 }); });
  expect(frames.map((f) => f.timestampMs)).toEqual([0, 20, 40]);
});
test('stop calls native stopListening and returns to idle', ...);
test('backgrounding stops listening and foregrounding restarts it', ...);          // AppState を mock
test('unmount removes native subscriptions and stops listening', ...);

// useEar.test.tsx
test('selects the meter ear with no recognizer when the native module is null', () => {
  // ExpoMusicageEar は jest で null → useEar() は kind 'meter'、recognizer null
});
test('the meter ear exposes an earStream fed from the meter', ...);           // useMicrophoneAnalysis を mock

// useMicrophoneAnalysis.test.tsx に追加
it('emits each ear frame on earStream as well as in state', ...);
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/audio --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装**

`useNativeEar`: `status` と `errorMessage` は `useState`、`earStream` は `useRef(createEarEmitter())`。`start` は `requesting` → `module.startListening()` → `listening`（`microphone_denied` が先に届けば `denied`）。`module.addFeaturesListener` は `listening` 中だけ `emitter.emit`。`AppState` が `active` 以外になったら `module.stopListening()` と `status 'idle'`、戻ったら直前が `listening` なら `start()`。`retry` は `start`。
`useMicrophoneAnalysis`: `pauseForRecognition` / `resumeAfterRecognition` / `recognitionPauseRef` / `resumeWhenActiveRef` を外し、`setEar(...)` の直後に `emitter.emit(...)`。

- [ ] **Step 4: 通過を確認して型チェック**

Run: `npx jest src/audio --runInBand --watchman=false && npm run typecheck`
Expected: PASS（`MusicageApp.tsx` が `pauseForRecognition` を参照している間は型エラーになる。その参照は Task 5 で消すので、このタスクでは `useSongRecognition` 呼び出しに渡す 2 関数を `MusicageApp.tsx` 内の `async () => false` / `async () => {}` の定数に置き換えて型を通す）

- [ ] **Step 5: コミット**

```bash
git add src/audio src/app/MusicageApp.tsx src/app/MusicageApp.test.tsx
git commit -m "feat: stream ear features from the native module or the Expo Go meter"
```

---

### Task 5: 認識の型の置き換えと AudD・校正系の削除

**Files:**
- Modify: `src/recognition/types.ts`（全面書き換え）
- Modify: `src/recognition/resolveLyrics.ts`, `src/recognition/__tests__/resolveLyrics.test.ts`
- Modify: `src/recognition/lrclibClient.ts`, `src/recognition/__tests__/lrclibClient.test.ts`（`duration` パラメータを削除）
- Modify: `src/sync/lyricClock.ts`, `src/sync/__tests__/lyricClock.test.ts`（`anchorFromRecognition` を追加）
- Delete: `src/recognition/auddClient.ts`, `captureRecognitionClip.ts`, `lyricTiming.ts`, `tokenStore.ts`, `useSongRecognition.ts`, `syncDiagnostics/`（一式）とそれらの `__tests__`
- Delete: `src/components/AudDTokenSheet.tsx`, `SyncDiagnosticsSheet.tsx` とそのテスト
- Modify: `src/app/MusicageApp.tsx`, `src/app/MusicageApp.test.tsx`（認識の配線を一旦外す。`RecognitionControls` には `{ phase: 'unavailable', result: null, message: null, retryable: false }` を渡す。認識に関する既存テストは削除し Task 8 で書き直す）
- Modify: `src/components/RecognitionControls.tsx`（`setup_required` 分岐と `onOpenSettings` を外し、新しい `RecognitionPhase` に合わせる。表示文は Task 7 で確定）

**Interfaces:**
- Consumes: Task 2 `EarRecognition`
- Produces（`types.ts`）:
  - `interface Track { trackId: string; title: string; artist: string; album: string | null; artworkUrl: string | null }`
  - `interface LyricLine { startMs: number; text: string }`（既存のまま）
  - `interface TimestampedLyricResult { kind: 'timestamped'; track: Track; lines: LyricLine[]; anchor: LyricAnchor }`
  - `type LyricResult = TimestampedLyricResult | { kind: 'plain'; track: Track; text: string } | { kind: 'instrumental'; track: Track } | { kind: 'lyrics_unavailable'; track: Track } | { kind: 'not_recognized' }`
  - `type RecognitionPhase = 'idle' | 'listening' | 'resolving_lyrics' | 'error' | 'unavailable'`
  - `interface RecognitionViewState { phase: RecognitionPhase; result: LyricResult | null; message: string | null; retryable: boolean }`
  - `trackFromRecognition(r: EarRecognition): Track`
- Produces: `resolveLyrics(track: Track, record: LrclibLyricsRecord | null, anchor: LyricAnchor): LyricResult`
- Produces（`lyricClock.ts`）: `anchorFromRecognition(r: Pick<EarRecognition, 'currentOffsetMs' | 'matchedAtMonotonicMs'>): LyricAnchor`（`{ offsetMs: currentOffsetMs, anchoredAtMonotonicMs: matchedAtMonotonicMs }`）
- Produces: `lookupLrclib(track: Track, fetchImpl?, signal?)` は `track_name` / `artist_name` / `album_name`（あれば）だけを送る

- [ ] **Step 1: 失敗するテストを書く・直す**

```ts
// resolveLyrics.test.ts（timingEvidence を anchor に）
const anchor = { offsetMs: 72_250, anchoredAtMonotonicMs: 7_000 };
test('preserves timestamped LRC and carries the anchor', () =>
  expect(resolveLyrics(track, lyricRecord, anchor)).toEqual({ kind: 'timestamped', track, lines: [{ startMs: 3500, text: 'first' }, { startMs: 62000, text: 'second' }], anchor }));
// plain / instrumental / lyrics_unavailable の既存テストは引数を anchor に替えるだけ

// lrclibClient.test.ts
test('sends track, artist and album only', () => { ...toContain('album_name=Test+Album'); ...not.toContain('duration=') });

// lyricClock.test.ts に追加
test('anchorFromRecognition maps offset and matched time', () =>
  expect(anchorFromRecognition({ currentOffsetMs: 30_000, matchedAtMonotonicMs: 1_000 })).toEqual({ offsetMs: 30_000, anchoredAtMonotonicMs: 1_000 }));

// types のテスト（src/recognition/__tests__/types.test.ts）
test('trackFromRecognition keeps nulls for missing album and artwork', () =>
  expect(trackFromRecognition({ trackId: 't', title: 'S', artist: 'A', matchedAtMonotonicMs: 0, currentOffsetMs: 0 })).toEqual({ trackId: 't', title: 'S', artist: 'A', album: null, artworkUrl: null }));
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/recognition src/sync --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 型を書き換え、旧ファイルを削除し、App から外す**

```bash
git rm -r src/recognition/auddClient.ts src/recognition/captureRecognitionClip.ts src/recognition/lyricTiming.ts src/recognition/tokenStore.ts src/recognition/useSongRecognition.ts src/recognition/syncDiagnostics src/recognition/__tests__/auddClient.test.ts src/recognition/__tests__/captureRecognitionClip.test.ts src/recognition/__tests__/lyricTiming.test.ts src/recognition/__tests__/tokenStore.test.ts src/recognition/__tests__/useSongRecognition.test.tsx src/components/AudDTokenSheet.tsx src/components/SyncDiagnosticsSheet.tsx src/components/__tests__/AudDTokenSheet.test.tsx src/components/__tests__/SyncDiagnosticsSheet.test.tsx
```

`MusicageApp.tsx` から `useSongRecognition` / `useSyncDiagnostics` / `AudDTokenSheet` / `SyncDiagnosticsSheet` / `tokenStore` の import と state を外す。`useStageSource` には `result: null` を渡す（Task 8 で戻す）。`MusicageApp.test.tsx` からそれらの mock と認識テストを外し、`'uses the approved duration…'`、`'closes token settings…'`、`'names the recognition phase…'`、`'passes the recognized track…'`、`'gives a plain-lyrics track…'` を削除する（Task 8 で新しい形で復活）。`src/audio/deleteTemporaryRecording.ts` はメーター経路が使うので残す。

- [ ] **Step 4: 全テストと型チェック**

Run: `npm test -- --watchman=false && npm run typecheck`
Expected: 全 PASS、型エラーなし。`git grep -n -i "audd\|syncDiagnostics\|lyricTiming\|tokenStore" -- src modules app.json` が **README 以外で 0 件**。

- [ ] **Step 5: コミット**

```bash
git add -A src
git commit -m "refactor: replace AudD recognition types with ShazamKit anchors and remove the calibration suite"
```

---

### Task 6: 認識フックと自動再認識トリガー

**Files:**
- Create: `src/recognition/useEarRecognition.ts`
- Create: `src/recognition/recognitionCopy.ts`
- Create: `src/recognition/autoRecognition.ts`
- Test: `src/recognition/__tests__/useEarRecognition.test.tsx`, `src/recognition/__tests__/autoRecognition.test.ts`

**Interfaces:**
- Consumes: Task 2 `EarModule`, `EarRecognition`, `EarError`; Task 5 `trackFromRecognition`, `resolveLyrics`, `lookupLrclib`, `anchorFromRecognition`; 既存 `LrclibRequestError`
- Produces（`recognitionCopy.ts`）: `RECOGNITION_COPY: Record<'unavailable' | 'match_timeout' | 'match_failed' | 'invalid_match' | 'lyrics_failed', string>` =
  - `unavailable: 'Development Build でのみ曲を読み取れます。'`
  - `match_timeout`: `'曲が分かりませんでした。スピーカーに近づけてもう一度。'`
  - `match_failed`: `'曲の照合に失敗しました。通信を確認してもう一度。'`
  - `invalid_match`: `'曲の位置を読めませんでした。もう一度。'`
  - `lyrics_failed`: `'歌詞を取得できませんでした。もう一度。'`
  - マイク側の文（拒否・開始失敗・中断）は Task 4 の `NATIVE_EAR_ERROR_COPY` と `ListeningControls` の既存 `DENIED_COPY` が担い、ここには置かない
- Produces（`useEarRecognition.ts`）:
  - `MATCH_TIMEOUT_MS = 20_000`
  - `interface EarRecognitionController { state: RecognitionViewState; recognize(): void; cancel(): void }`
  - `useEarRecognition(recognizer: EarModule | null, earStatus: ListeningStatus): EarRecognitionController`（`recognizer === null` なら常に `phase: 'unavailable'`、`message: RECOGNITION_COPY.unavailable`）
- Produces（`autoRecognition.ts`）:
  - `SILENCE_REARM_MS = 4_000`
  - `interface AutoRecognitionInput { nowMs: number; silence: boolean; pastOutro: boolean; hasResult: boolean; recognizing: boolean; enabled: boolean }`
  - `interface AutoRecognitionTrigger { push(input: AutoRecognitionInput): boolean; reset(): void }`
  - `createAutoRecognitionTrigger(): AutoRecognitionTrigger`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// autoRecognition.test.ts
const at = (nowMs: number, over: Partial<AutoRecognitionInput> = {}): AutoRecognitionInput =>
  ({ nowMs, silence: false, pastOutro: false, hasResult: false, recognizing: false, enabled: true, ...over });
test('fires on the first sound when nothing is recognized yet (launch into music)', () => {
  const t = createAutoRecognitionTrigger();
  expect(t.push(at(0, { silence: true }))).toBe(false);
  expect(t.push(at(20))).toBe(true);
});
test('does not fire again while recognizing or while the result stands', () => {
  const t = createAutoRecognitionTrigger();
  t.push(at(0)); // fired
  expect(t.push(at(20, { recognizing: true }))).toBe(false);
  expect(t.push(at(40, { hasResult: true }))).toBe(false);
});
test('re-arms after 4 s of silence and fires when sound returns', () => {
  const t = createAutoRecognitionTrigger();
  t.push(at(0)); t.push(at(20, { hasResult: true }));
  for (let ms = 40; ms < 3_900; ms += 20) expect(t.push(at(ms, { hasResult: true, silence: true }))).toBe(false);
  expect(t.push(at(3_920, { hasResult: true }))).toBe(false);          // 無音が 4 秒に満たずに戻った → 発火しない
  for (let ms = 4_000; ms <= 8_100; ms += 20) t.push(at(ms, { hasResult: true, silence: true }));
  expect(t.push(at(8_120, { hasResult: true }))).toBe(true);            // 4 秒超の無音の後の音
});
test('fires once on the outro edge while sound continues', () => {
  const t = createAutoRecognitionTrigger();
  t.push(at(0)); t.push(at(20, { hasResult: true }));
  expect(t.push(at(40, { hasResult: true, pastOutro: true }))).toBe(true);
  expect(t.push(at(60, { hasResult: true, pastOutro: true }))).toBe(false);
});
test('never fires when disabled, and reset forgets the arming', ...);
test('after a failed attempt (no result) it waits for the next silence-to-sound edge, not a timer', () => {
  const t = createAutoRecognitionTrigger();
  t.push(at(0));                                     // fired, recognizing follows
  for (let ms = 20; ms < 25_000; ms += 20) expect(t.push(at(ms, { recognizing: ms < 20_000 }))).toBe(false);
  t.push(at(25_020, { silence: true }));
  expect(t.push(at(25_040))).toBe(true);
});

// useEarRecognition.test.tsx  — recognizer は jest.fn() の束、lookupLrclib は mock
test('is unavailable without a recognizer', () => expect(result.current.state).toEqual({ phase: 'unavailable', result: null, message: RECOGNITION_COPY.unavailable, retryable: false }));
test('recognize starts a 20 s match and enters listening', () => { expect(recognizer.listenForMatch).toHaveBeenCalledWith(20_000); expect(phase).toBe('listening'); });
test('a match resolves LRCLIB lyrics into a timestamped result anchored on the match', async () => {
  emitRecognition({ trackId: 't1', title: 'Song', artist: 'Artist', matchedAtMonotonicMs: 10_000, currentOffsetMs: 12_345 });
  await waitFor(() => expect(result.current.state.phase).toBe('idle'));
  expect(lookupLrclib).toHaveBeenCalledWith(expect.objectContaining({ title: 'Song', artist: 'Artist' }), undefined, expect.anything());
  expect(result.current.state.result).toEqual({ kind: 'timestamped', track: { trackId: 't1', title: 'Song', artist: 'Artist', album: null, artworkUrl: null }, lines: [{ startMs: 12_000, text: 'first line' }], anchor: { offsetMs: 12_345, anchoredAtMonotonicMs: 10_000 } });
});
test('the same track matched again only moves the anchor and skips LRCLIB', async () => {
  // 1 回目の後、同じ trackId を matchedAt 50_000 / offset 40_000 で emit
  expect(lookupLrclib).toHaveBeenCalledTimes(1);
  expect(result.current.state.result).toMatchObject({ kind: 'timestamped', anchor: { offsetMs: 40_000, anchoredAtMonotonicMs: 50_000 } });
});
test('match_timeout keeps the previous result, sets the copy and makes retry possible', ...);
test('a match after cancel is ignored', () => { act(() => result.current.cancel()); emitRecognition(...); expect(lookupLrclib).not.toHaveBeenCalled(); expect(phase).toBe('idle'); });
test('a match after the ear left listening is ignored', ...);           // earStatus が 'idle' に変わった後
test('an LRCLIB failure keeps the track as lyrics_unavailable with the lyrics_failed copy', ...);  // lookupLrclib rejects LrclibRequestError('network')
test('recognize while listening is a no-op', ...);
test('unmount cancels the native match', ...);
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/recognition --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装**

`createAutoRecognitionTrigger`: 内部状態 `previousSilence = true`、`quietSinceMs: number | null`、`armed = true`、`previousPastOutro = false`。`push`: 無音の連続長を更新し、`SILENCE_REARM_MS` 以上なら `armed = true`。`!hasResult` でも `armed = true`。発火条件は `enabled && !recognizing && armed && ((previousSilence && !silence) || (pastOutro && !previousPastOutro && !silence))`。発火したら `armed = false`、`quietSinceMs = null`。最後に `previousSilence`、`previousPastOutro` を更新。`reset` は初期状態に戻す。

`useEarRecognition`: `recognize` は `phase 'listening'`、`activeRef = { id }`、`recognizer.listenForMatch(MATCH_TIMEOUT_MS)`。認識イベント: `activeRef` が生きていて `earStatus === 'listening'` のときだけ処理。同じ `trackId` の `timestamped` 結果があれば `anchor` だけ差し替えて `idle`。違えば `resolving_lyrics` → `lookupLrclib(track, undefined, signal)` → `resolveLyrics(track, record, anchorFromRecognition(r))` → `idle`。`LrclibRequestError` は `{ kind: 'lyrics_unavailable', track }` + `message: RECOGNITION_COPY.lyrics_failed`。エラーイベントは `match_timeout` / `match_failed` / `invalid_match` を `phase 'idle'`（`result` は前のまま）、`message` は対応する文、`retryable: true`。`cancel` は `activeRef = null`、`recognizer.cancelMatch()`。`earStatus` が `listening` から外れたら `cancel()`。

- [ ] **Step 4: 通過を確認して型チェック**

Run: `npx jest src/recognition --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/recognition
git commit -m "feat: recognize songs through the ear module and decide automatic re-recognition"
```

---

### Task 7: 設定（自動再認識）と操作列の文言

**Files:**
- Create: `src/settings/settingsStore.ts`, `src/settings/useSettings.ts`
- Create: `src/components/SettingsSheet.tsx`
- Modify: `src/components/RecognitionControls.tsx`, `src/components/__tests__/RecognitionControls.test.tsx`
- Test: `src/settings/__tests__/settingsStore.test.ts`, `src/settings/__tests__/useSettings.test.tsx`, `src/components/__tests__/SettingsSheet.test.tsx`

**Interfaces:**
- Consumes: Task 5 `RecognitionViewState`, Task 6 `RECOGNITION_COPY`
- Produces（`settingsStore.ts`）: `interface Settings { autoRecognize: boolean }`、`DEFAULT_SETTINGS: Settings = { autoRecognize: true }`、`loadSettings(): Promise<Settings>`、`saveSettings(s: Settings): Promise<void>`（`expo-file-system` の `File(Paths.document, 'musicage-settings.json')` に JSON。読めない・壊れている → `DEFAULT_SETTINGS`。フェーズ 3 が Claude キー以外の項目をここに足す）
- Produces（`useSettings.ts`）: `useSettings(): { settings: Settings; ready: boolean; update(patch: Partial<Settings>): Promise<void> }`
- Produces（`SettingsSheet.tsx`）: `SettingsSheet({ visible, settings, onToggleAutoRecognize(next: boolean), onClose })`（`Modal`。見出し `設定`、スイッチ `曲の自動読み取り`、説明 1 行 `曲が終わった後や無音のあとに音が戻ったとき、自動で曲を読み取ります。`、`閉じる`）
- Produces（`RecognitionControls.tsx`）: props `{ state: RecognitionViewState; onRecognize(): void; onCancel(): void; onOpenSettings(): void }`。ラベル: `listening` → `聴き取り中…`（押すと `onCancel`）、`resolving_lyrics` → `歌詞を探しています…`（無効）、`unavailable` → `曲を読み取る`（無効）+ `message`、`error` または `result.kind === 'not_recognized'` または `message` あり → `もう一度読み取る`、それ以外 → `曲を読み取る`。右に `設定` ボタン（`accessibilityLabel: '設定'`）

- [ ] **Step 1: 失敗するテストを書く**

```ts
// settingsStore.test.ts（expo-file-system を mock）
test('returns defaults when the file is missing or malformed', ...);
test('round-trips autoRecognize', ...);
// useSettings.test.tsx
test('loads settings on mount, ready flips to true, update saves and reflects', ...);
// SettingsSheet.test.tsx
test('shows the auto-recognize switch with its value and calls onToggleAutoRecognize', ...);
// RecognitionControls.test.tsx（既存テストを置き換え）
test.each([
  ['idle', '曲を読み取る', false],
  ['listening', '聴き取り中…', false],
  ['resolving_lyrics', '歌詞を探しています…', true],
  ['unavailable', '曲を読み取る', true],
])('phase %s shows %s (disabled %s)', ...);
test('listening press cancels, idle press recognizes', ...);
test('an error message is shown with もう一度読み取る', ...);
test('unavailable shows the development build copy', () => expect(getByText(RECOGNITION_COPY.unavailable)).toBeTruthy());
test('the settings button opens settings', ...);
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/settings src/components --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装**

`settingsStore` は `File.exists` → `file.text()` → `JSON.parse` → `typeof parsed.autoRecognize === 'boolean'` を検査。`saveSettings` は `file.write(JSON.stringify(s))`（親ディレクトリは `Paths.document` なので作成不要）。

- [ ] **Step 4: 通過を確認して型チェック**

Run: `npx jest src/settings src/components --runInBand --watchman=false && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/settings src/components
git commit -m "feat: add the auto-recognition setting and ShazamKit-era recognition controls"
```

---

### Task 8: 舞台への配線（synced ソース、自動再認識、App）と README

**Files:**
- Modify: `src/app/useStageSource.ts`
- Create: `src/app/__tests__/useStageSource.test.tsx`
- Modify: `src/app/MusicageApp.tsx`, `src/app/MusicageApp.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 4 `Ear`, `useEar`, `EarStream`; Task 6 `useEarRecognition`, `createAutoRecognitionTrigger`; Task 7 `useSettings`, `SettingsSheet`, `RecognitionControls`; 既存 `scheduleLine`, `isPastOutro`, `songPositionMs`, `directSongByRules`, `LyricStage`
- Produces（`useStageSource.ts`）:
  - 入力 `interface StageSourceInput { earStream: EarStream; status: ListeningStatus; playback: FixturePlayback; result: LyricResult | null }`（`ear: EarFeatures` を `earStream` に替える）
  - 出力 `interface StageInputs { source: StageSource; beat: BeatState; nowMonotonicMs: number; pastOutro: boolean }`
  - 拍エンジンは `earStream.subscribe` の中で `push` し、`setBeat` は「`next.pulse > previous.pulse`（新しい拍頭）なら即時、それ以外は前回の公開から 60ms 以上経ったときだけ」。`status !== 'listening'` で `reset()` と `QUIET_BEAT`。
  - ソースの優先順位: フィクスチャが有効 → 既存の `synced`（フィクスチャ）。それ以外で `result.kind === 'timestamped'` → `synced` で `lines = result.lines`、`direction = directSongByRules(texts, `${artist}/${title}`)`、位置は `songPositionMs(result.anchor, now)`、`isPastOutro` なら `index −1` の idle 行（`pastOutro: true`）。それ以外 → 既存の `idle`。
  - `result.anchor` が変わったら（再認識）スケジューラは即時 tick して巻き戻しや前進を反映する（既存 `scheduleLine` が `previous` との比較で入りをやり直す）。
- Produces（`MusicageApp.tsx`）:
  - `const ear = useEar()`、`const recognition = useEarRecognition(ear.recognizer, ear.status)`、`const { settings, update } = useSettings()`、`const stage = useStageSource({ earStream: ear.earStream, status: ear.status, playback, result: recognition.state.result })`
  - 自動再認識: `useRef(createAutoRecognitionTrigger())` を `stage.beat` / `stage.pastOutro` が変わるたびに `push({ nowMs: performance.now(), silence: stage.beat.silence, pastOutro: stage.pastOutro, hasResult: result !== null && result.kind !== 'not_recognized', recognizing: phase === 'listening' || phase === 'resolving_lyrics', enabled: settings.autoRecognize && ear.kind === 'native' && ear.status === 'listening' })` し、`true` なら `recognition.recognize()`。
  - 隅のステータス: `phase 'listening'` → `MATCHING`、`'resolving_lyrics'` → `LYRICS`、それ以外は既存の `LISTENING` / `MIC OFF` / `MIC ERROR` / `IDLE`。
  - 操作列: `RecognitionControls`（`onRecognize: recognition.recognize`、`onCancel: recognition.cancel`、`onOpenSettings`）、`ListeningControls`（`ear.start/stop/retry`）、`SettingsSheet`。
  - `useKeepScreenOn(ear.status === 'listening')`、`useBurnInDrift` はそのまま。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
// useStageSource.test.tsx（renderHook、performance.now を mock、earStream は createEarEmitter()）
const result: LyricResult = { kind: 'timestamped', track, lines: [{ startMs: 0, text: '夜の底で' }, { startMs: 4_000, text: '走れ！' }], anchor: { offsetMs: 1_000, anchoredAtMonotonicMs: 10_000 } };
test('a timestamped result becomes a synced source positioned on the anchor', async () => {
  clockMs = 10_500;                                   // 位置 1_500ms → 行 0
  expect(source.kind).toBe('synced'); expect(source.scheduled.index).toBe(0); expect(source.direction.lines).toHaveLength(2);
  clockMs = 13_100; await waitFor(() => expect(scheduled().index).toBe(1));
});
test('a new anchor for the same lines rewinds the scheduled line at once', async () => {
  // anchor を { offsetMs: 0, anchoredAtMonotonicMs: clockMs } に差し替え → index 0、startedAtMs === clockMs
});
test('past the outro the source is an idle line and pastOutro is true', ...);
test('the fixture wins over a recognized song while it is active', ...);
test('ear frames drive the beat without re-rendering per frame: a hit publishes at once, a steady bed at most every 60 ms', () => {
  // 20ms 刻みで 0.1 を 45 フレーム → renders は ≤ 16 増える; 0.9 を 1 フレーム → 直後の beat.pulse > 0.5
});
test('leaving listening resets to the quiet beat', ...);

// MusicageApp.test.tsx（useEar / useEarRecognition / useSettings を mock、LyricStage の wrapper は既存のまま）
test('renders the stage, starts the ear, and shows LISTENING', ...);
test('shows MATCHING while listening for a match and LYRICS while resolving', ...);
test('passes a timestamped result to the stage as a synced source', ...);
test('passes a plain-lyrics result as an idle caption only', ...);
test('in Expo Go the recognize button is disabled with the development build copy and the fixture still plays', ...);
test('auto recognition fires on the first sound when enabled and native, not when disabled or on the meter ear', ...);  // earStream に無音→音を流す
test('opens the settings sheet from the controls and toggles auto recognition', ...);
test('keeps the stage inside the drifting text layer', ...);                 // 既存
test('hides and restores the controls when the empty scene is tapped', ...);  // 既存
// 'with a mocked monotonic clock' のフィクスチャ 2 テストは既存のまま
```

- [ ] **Step 2: 失敗を確認**

Run: `npx jest src/app --runInBand --watchman=false`
Expected: FAIL

- [ ] **Step 3: 実装して README を書き換える**

README: 冒頭の説明を「文字のオブジェ」に合わせ、`Prerequisites` に「iOS Development Build（EAS）」と「Expo Go はフォールバック（`npm run start:go`、認識なし）」を書く。`Run` を Development Build（`npm start` → dev client で開く）と Expo Go の 2 本にする。`What it does` の AudD 行を「『曲を読み取る』か自動トリガーで ShazamKit がフィンガープリントだけで曲を照合し、LRCLIB の同期歌詞を行単位で流す。音声は端末外に送らず保存もしない」に替える。`Real lyrics setup` と `AudD歌詞同期の診断プロトコル` の節を削除し、`Development Build` の節（Task 0 と Task 9 のコマンド、ShazamKit App Service の有効化、`eas device:create`）を置く。`Device validation` は Task 9 Step 4 の項目にする。

- [ ] **Step 4: 全テストと型チェック**

Run: `npm test -- --watchman=false && npm run typecheck`
Expected: 全 PASS、型エラーなし。`git grep -n -i "audd" -- . ':!backup-before-musicage-initial-merge-20260826' ':!docs'` が 0 件。

- [ ] **Step 5: コミット**

```bash
git add src/app README.md
git commit -m "feat: drive the lyric stage from ShazamKit anchors with automatic re-recognition"
```

---

### Task 9: EAS ビルドと実機確認（所有者 + 実装者）

**Files:**
- Modify: `eas.json` / `app.json`（EAS の検証が求めた場合のみ）
- Modify: `modules/expo-musicage-ear/ios/*.swift`（ビルドログの Swift エラーを直す）
- Create: `docs/superpowers/reports/2026-10-19-phase2-device-verification.md`
- Modify: この計画の末尾「実機確認メモ」

**Interfaces:**
- Consumes: Task 1–8 のすべて
- Produces: インストールできる iPhone 用 Development Build と、受け入れ条件 3・4・6・7 の実機記録

- [ ] **Step 1: 設定の解決を確認する（実装者）**

Run: `npx expo config --type public`
Expected: `ios.bundleIdentifier` が `com.musicage.app`、`extra.eas.projectId` が入っている。`npx expo-modules-autolinking search --platform apple` の出力に `expo-musicage-ear` が含まれる。

- [ ] **Step 2: 初回ビルド（所有者、PowerShell、リポジトリのルートで。作業ブランチをチェックアウトした状態）**

```powershell
eas build --platform ios --profile development
```

Apple ID のログイン、Distribution Certificate と Provisioning Profile の生成を承認する（EAS が管理）。Expected: ビルドが成功し、インストール用の URL / QR が出る。失敗したらビルドページの Xcode ログ（`Run fastlane` の Swift エラー）を実装者に渡す。実装者が Swift を直してコミットしたら、同じコマンドをもう一度実行する（1 往復 15〜30 分）。

- [ ] **Step 3: インストールして起動（所有者）**

iPhone でビルドの URL を開いてインストール。起動時にマイクを許可。PC で `npm start` を実行し、Development Build の画面で LAN の URL を開く（トンネルは使わない）。

- [ ] **Step 4: 実機で確認する（所有者。結果は Step 5 のレポートに）**

1. 起動直後: 黒地の grain 背景と idle グリフ。音を鳴らすと脈打つ（拍はネイティブ 50Hz 入力。フェーズ 1 のメーター入力より体感が合うか）。
2. 実在曲（平沢進を含む 3 曲）をレコード／スピーカーで鳴らし「曲を読み取る」。**3 秒以内に歌詞の行が出る**こと、以降 **1 分間で行の切り替わりが体感 ±0.5 秒**に収まること（受け入れ条件 3）。切り替わりが拍に寄る瞬間があるか。
3. 認識中もグリフの脈動と背景が止まらない（受け入れ条件 7）。
4. 曲が終わる／針を上げる → 15 秒後または無音 4 秒後に idle 構成へ。次の曲をかけると設定「曲の自動読み取り」オンで自動で再認識する（受け入れ条件 4）。オフにすると起きない。
5. LRCLIB に同期歌詞が無い曲 → idle 構成に曲名だけ。「同期歌詞」などのラベルは出ない。
6. 操作列を出すと、失敗時の 1 行の文（曲が分からない、マイク拒否）が読める。マイクをいったん設定で拒否して再起動 → `MIC OFF` と復帰の文。
7. 通話または Siri で中断 → 戻ったあとに聴き取りが再開する。
8. 1 分放置して落ちない。右上ピルの fps が 55 以上。
9. Expo Go（`npm run start:go`）でも起動し、フィクスチャが動き、「曲を読み取る」は無効で Development Build の説明が出る。

- [ ] **Step 5: 記録（実装者が所有者の報告を書く）**

`docs/superpowers/reports/2026-10-19-phase2-device-verification.md` に、ビルド ID、コミットハッシュ、iOS バージョン、試した曲（曲名は所有者の報告のまま。歌詞本文は書かない）、認識までの秒数、1 分間のずれの体感、自動再認識の挙動、fps、残った懸念（LRCLIB の版違いによるずれ、`album` が取れたか、`predictedCurrentMatchOffset` と `matchOffset` のどちらが使われたか）を書く。この計画の「実機確認メモ」に日付と結論（続行 / 方針見直し）を 3 行で書く。

- [ ] **Step 6: 最終チェックとコミット**

Run: `npm test -- --watchman=false && npm run typecheck`
Expected: 全 PASS。

```bash
git add docs/superpowers/reports/2026-10-19-phase2-device-verification.md docs/superpowers/plans/2026-10-19-lyric-typography-phase2.md modules/expo-musicage-ear eas.json app.json
git commit -m "docs: record the phase 2 device verification"
```

---

## 実機確認メモ

（所有者の報告をもとに実装者が記入）

## フェーズ 3 への引き継ぎ

- `src/settings/settingsStore.ts` に Claude API キーの保存先は入れない。キーは `expo-secure-store` に別ストア（旧 `tokenStore.ts` の形を Claude キー用に作り直す）。`SettingsSheet` にキーの設定・削除を足す。
- `useStageSource` の `directSongByRules(...)` 呼び出しを、`trackId` キーのキャッシュ付き演出ディレクター（Claude API → ルールベース）に差し替える。`LyricResult` の `track.trackId` がその鍵になる。
- `expo-crypto` は校正系の削除で未使用になった。所有者が `npm uninstall expo-crypto` を実行してロックファイルごと更新する（本フェーズでは触らない）。
