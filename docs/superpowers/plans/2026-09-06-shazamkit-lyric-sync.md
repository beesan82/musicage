# ShazamKit Lyric Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unreliable AudD midpoint synchronization with an iPhone ShazamKit native module and display matching LRCLIB timestamped lyrics in real time.

**Architecture:** A thin Swift Expo Module owns `SHSession` and microphone recognition, returning only safe track metadata and a match offset. React Native owns recognition state, LRCLIB lookup, a monotonic-clock projection, and lyric presentation. The app remains iPhone-only and is delivered as an EAS Development Build.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, Swift/ShazamKit, Expo Modules API, EAS Build, Jest and React Native Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-06-shazamkit-lyric-sync-design.md`

## Global Constraints

- Target iPhone only; do not add Android ShazamKit work.
- Use Windows for authoring and EAS Cloud for iOS native builds; Mac is not required.
- Do not upload or persist audio from the new recognition path.
- Do not use AudD timecode, capture midpoint, equal lyric distribution, fixed bias, PLL, or Kalman filtering for synchronization.
- Do not add music playback, background recognition, a relay server, or manual lyric timing correction.
- Native-to-JS results must exclude microphone audio, tokens, and raw provider payloads.
- Preserve the existing visualizer and keep visual changes outside this migration.
- Keep the existing untracked `backup-before-musicage-initial-merge-20260826/` directory untouched and unstaged.

---

### Task 1: Add the iPhone Development Build and Expo Module scaffold

**Files:**
- Create: `modules/expo-shazamkit/expo-module.config.json`
- Create: `modules/expo-shazamkit/package.json`
- Create: `modules/expo-shazamkit/src/ExpoShazamKit.ts`
- Modify: `app.json`
- Modify: `package.json`
- Create: `eas.json`
- Test: `modules/expo-shazamkit/src/ExpoShazamKit.test.ts`

**Interfaces:**
- Produces `ExpoShazamKit.startRecognition(): Promise<void>`, `stopRecognition(): Promise<void>`, and an event named `onRecognition`.
- Produces the TypeScript shape `{ trackId: string; title: string; artist: string; album?: string; matchedAtMonotonicMs: number; currentOffsetMs: number }`.

- [ ] **Step 1: Write the failing JS module contract test**

  Mock `expo-modules-core` and assert the exported module has the two commands and subscribes to the `onRecognition` event with the exact safe result shape. Assert no `audio`, `token`, or `raw` field is part of the public type.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npx jest modules/expo-shazamkit/src/ExpoShazamKit.test.ts --runInBand --watchman=false`
  Expected: FAIL because the module and its public contract do not exist.

- [ ] **Step 3: Add the minimal module scaffold and app configuration**

  Define the JS wrapper with `requireNativeModule` and `EventEmitter`. Add the local module to the workspace/package dependency using the Expo module template conventions. Add `expo-dev-client`, an iOS bundle identifier `com.musicage.app`, and the `expo-shazamkit` plugin entry. Add EAS profiles named `development`, `preview`, and `production`; the development profile uses a development client and internal distribution.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `npx jest modules/expo-shazamkit/src/ExpoShazamKit.test.ts --runInBand --watchman=false`
  Expected: PASS.

- [ ] **Step 5: Run typecheck and commit**

  Run: `npm run typecheck`
  Expected: PASS.
  Commit: `git add modules/expo-shazamkit app.json package.json eas.json; git commit -m "feat: scaffold ShazamKit development build"`

### Task 2: Implement the Swift ShazamKit recognizer

**Files:**
- Create: `modules/expo-shazamkit/ios/ExpoShazamKitModule.swift`
- Create: `modules/expo-shazamkit/ios/ExpoShazamKit.podspec`
- Modify: `modules/expo-shazamkit/expo-module.config.json`
- Test: `modules/expo-shazamkit/src/ExpoShazamKit.test.ts`

**Interfaces:**
- Consumes: `startRecognition()` and `stopRecognition()` from Task 1.
- Produces: `onRecognition` events carrying safe metadata and offsets; emits a typed error event for permission or recognition failure.

- [ ] **Step 1: Extend the JS contract tests for native event mapping**

  Add tests that a native event with `mediaItem`, `matchOffset`, and `predictedCurrentMatchOffset` becomes the public result, that `matchedAtMonotonicMs` is captured from the native monotonic clock, and that stop removes the listener. Add a rejection test for microphone permission denial.

- [ ] **Step 2: Run focused tests to verify the new behavior fails**

  Run: `npx jest modules/expo-shazamkit/src/ExpoShazamKit.test.ts --runInBand --watchman=false`
  Expected: FAIL because no native event bridge or permission behavior exists.

- [ ] **Step 3: Implement the minimum Swift module**

  Define an Expo Module with `AsyncFunction("startRecognition")`, `AsyncFunction("stopRecognition")`, and an `Events("onRecognition", "onRecognitionError")` declaration. Create an `SHSession`, configure `AVAudioSession` for record/measurement, install an input tap, and feed buffers to `session.matchStreamingBuffer`. On `session(_:didFind:)`, select the first matched media item and emit only `trackId`, title, artist, optional album, `matchedAtMonotonicMs`, and `currentOffsetMs` from `predictedCurrentMatchOffset` (falling back to `matchOffset` only for the initial match). Stop and remove the audio tap on stop, failure, and module deinitialization. Request microphone permission before installing the tap. Never include audio buffers or raw `SHMatch` objects in events.

- [ ] **Step 4: Run focused JS tests and typecheck**

  Run: `npx jest modules/expo-shazamkit/src/ExpoShazamKit.test.ts --runInBand --watchman=false` and `npm run typecheck`
  Expected: both PASS. Native compilation is verified in Task 6 through EAS.

- [ ] **Step 5: Commit**

  Run: `git add modules/expo-shazamkit; git commit -m "feat: bridge ShazamKit streaming recognition"`

### Task 3: Replace the AudD recognition hook with ShazamKit state

**Files:**
- Create: `src/recognition/shazamRecognition.ts`
- Create: `src/recognition/__tests__/shazamRecognition.test.tsx`
- Modify: `src/recognition/useSongRecognition.ts`
- Modify: `src/recognition/__tests__/useSongRecognition.test.tsx`
- Modify: `src/app/MusicageApp.tsx`
- Modify: `src/components/RecognitionControls.tsx`
- Modify: `src/components/__tests__/RecognitionControls.test.tsx`

**Interfaces:**
- Consumes: `ExpoShazamKit.startRecognition`, `stopRecognition`, and `onRecognition`.
- Produces: `status: 'idle' | 'listening' | 'recognized' | 'error'`, `recognition`, `lyricResult`, `message`, `start`, and `stop` without an AudD token requirement.

- [ ] **Step 1: Write failing hook tests**

  Test start calls ShazamKit and enters `listening`; a recognition event produces track metadata and calls the existing direct LRCLIB `getLyrics` once; stop calls the native stop command; permission and recognition errors produce a safe Japanese message; starting a second time does not create a second listener.

- [ ] **Step 2: Run focused RED tests**

  Run: `npx jest src/recognition/__tests__/shazamRecognition.test.tsx src/recognition/__tests__/useSongRecognition.test.tsx --runInBand --watchman=false`
  Expected: FAIL because the current hook requires AudD recording/token flow.

- [ ] **Step 3: Implement the hook migration**

  Subscribe to the native event once per active recognition session, pass the safe recognition result to `resolveLyrics`, and remove the subscription on stop/unmount. Remove `getAudDToken`, temporary recording creation/deletion, and AudD-specific setup messages from the normal path. Preserve abort handling and ensure stale events from a stopped session are ignored.

- [ ] **Step 4: Update controls and app wiring**

  Change setup copy from AudD token instructions to microphone/ShazamKit recognition. Keep the existing start/stop controls and visualizer props. Remove the AudD token sheet from the normal screen; do not delete diagnostic files until Task 5 confirms no consumer remains.

- [ ] **Step 5: Run focused GREEN tests, full tests, and typecheck**

  Run: `npx jest src/recognition/__tests__/shazamRecognition.test.tsx src/recognition/__tests__/useSongRecognition.test.tsx src/app/MusicageApp.test.tsx src/components/__tests__/RecognitionControls.test.tsx --runInBand --watchman=false` and `npm run typecheck`
  Expected: PASS.

- [ ] **Step 6: Commit**

  Run: `git add src/recognition/shazamRecognition.ts src/recognition/__tests__/shazamRecognition.test.tsx src/recognition/useSongRecognition.ts src/recognition/__tests__/useSongRecognition.test.tsx src/app/MusicageApp.tsx src/components/RecognitionControls.tsx src/components/__tests__/RecognitionControls.test.tsx; git commit -m "feat: use ShazamKit for song recognition"`

### Task 4: Implement the monotonic lyric synchronization clock

**Files:**
- Create: `src/recognition/lyricSync.ts`
- Create: `src/recognition/__tests__/lyricSync.test.ts`
- Modify: `src/components/LyricTypography.tsx`
- Modify: `src/components/__tests__/LyricTypography.test.tsx`
- Modify: `src/app/MusicageApp.tsx`

**Interfaces:**
- Consumes: `ShazamRecognition` and parsed `SyncedLyricLine[]`.
- Produces: `getCurrentSongPositionMs(recognition, nowMonotonicMs): number` and `findActiveLyricLine(lines, positionMs): SyncedLyricLine | null`.

- [ ] **Step 1: Write failing pure-function tests**

  Assert an anchor at song 12,000ms and local 5,000ms returns 12,500ms at local 5,500ms; assert a later recognition replaces the old anchor; assert lines at 0ms, 1,000ms, and 2,000ms select the last line whose timestamp is not after the current position; assert empty and unsorted-invalid input is rejected without guessing times.

- [ ] **Step 2: Run RED tests**

  Run: `npx jest src/recognition/__tests__/lyricSync.test.ts --runInBand --watchman=false`
  Expected: FAIL because the new clock module does not exist.

- [ ] **Step 3: Implement the pure clock and active-line selection**

  Use `performance.now()` supplied by the caller. Never increment a counter from `setInterval`, apply a fixed offset, or use capture duration. Require finite non-negative timestamps and preserve the original LRC order after validation.

- [ ] **Step 4: Migrate LyricTypography to the new result shape**

  Remove the AudD calibration prop and `resolveLyricTiming` dependency. Use the Shazam recognition anchor only when `syncedLyrics` exists. Refresh display state on a rendering interval/animation frame, while deriving the position from the monotonic clock each refresh. Keep plain lyrics labeled as unsynchronized and show a clear no-sync message when only plain lyrics exist.

- [ ] **Step 5: Run focused tests and typecheck**

  Run: `npx jest src/recognition/__tests__/lyricSync.test.ts src/components/__tests__/LyricTypography.test.tsx src/app/MusicageApp.test.tsx --runInBand --watchman=false` and `npm run typecheck`
  Expected: PASS.

- [ ] **Step 6: Commit**

  Run: `git add src/recognition/lyricSync.ts src/recognition/__tests__/lyricSync.test.ts src/components/LyricTypography.tsx src/components/__tests__/LyricTypography.test.tsx src/app/MusicageApp.tsx; git commit -m "feat: sync lyrics from ShazamKit offsets"`

### Task 5: Remove obsolete AudD sync and token UI from the production path

**Files:**
- Modify: `app.json`
- Modify: `src/recognition/resolveLyrics.ts`
- Modify: `src/recognition/__tests__/resolveLyrics.test.ts`
- Modify: `src/recognition/lyricTiming.ts`
- Modify: `src/recognition/__tests__/lyricTiming.test.ts`
- Modify: `src/components/SyncDiagnosticsSheet.tsx`
- Modify: `src/recognition/syncDiagnostics/useSyncDiagnostics.ts`
- Modify: related tests that fail because production no longer imports AudD

**Interfaces:**
- Consumes: Shazam recognition result and LRCLIB record.
- Produces: a lyric result with safe track metadata and either timestamped synced lines or plain lyrics; no calibration requirement.

- [ ] **Step 1: Add regression tests proving old synchronization is unreachable**

  Assert `resolveLyrics` accepts a Shazam recognition result without AudD timing evidence, preserves true LRC timestamps, and returns plain lyrics without claiming synchronization. Assert the app does not render AudD token setup or calibration controls in the production flow.

- [ ] **Step 2: Run RED tests**

  Run: `npx jest src/recognition/__tests__/resolveLyrics.test.ts src/recognition/__tests__/lyricTiming.test.ts src/app/MusicageApp.test.tsx --runInBand --watchman=false`
  Expected: FAIL where old types still require AudD calibration or old UI remains wired.

- [ ] **Step 3: Remove only obsolete production plumbing**

  Delete the app’s imports and props for AudD token/calibration. Remove obsolete `lyricTiming` usage from production. Keep diagnostic implementation files only if their tests or explicit diagnostic screen still use them; otherwise remove them in one scoped commit. Update the microphone permission copy so it no longer promises AudD upload.

- [ ] **Step 4: Run the full verification suite**

  Run: `npm test -- --runInBand --watchman=false` and `npm run typecheck`
  Expected: all tests pass and typecheck exits successfully.

- [ ] **Step 5: Commit**

  Run: `git add app.json src; git commit -m "refactor: remove AudD sync production path"`

### Task 6: Build and verify the iPhone Development Build through EAS

**Files:**
- Modify: `eas.json` only if EAS validation requires profile adjustments
- Modify: `app.json` only if native plugin validation requires a configuration correction
- Create: `docs/superpowers/reports/2026-09-06-shazamkit-eas-verification.md`

**Interfaces:**
- Consumes: all code and config from Tasks 1–5.
- Produces: an installable iPhone Development Build and a reproducible verification report.

- [ ] **Step 1: Authenticate and validate the project**

  Run: `npx expo whoami` and `npx expo config --type public`
  Expected: the Expo account is signed in and the config resolves with `com.musicage.app` and the ShazamKit plugin.

- [ ] **Step 2: Configure EAS project metadata**

  Run: `npx eas login` if needed, then `npx eas project:init` and `npx eas build:configure` only when the command reports missing project metadata. Do not overwrite existing config without checking the diff.

- [ ] **Step 3: Create the development build**

  Run: `npx eas build --platform ios --profile development`
  Expected: the cloud build completes and provides an install link. If signing asks for credentials, use the Apple Developer account registered for MUSICAGE and let EAS manage the development certificate/profile.

- [ ] **Step 4: Install and test on the iPhone**

  Install the build, allow microphone access, tap `曲を読み取る`, play a known song from an external speaker, and verify the recognized title, artist, and LRC line changes. Stop recognition and verify the microphone session ends. Test a song without synced LRCLIB lyrics and a deliberately denied microphone permission.

- [ ] **Step 5: Record verification evidence**

  Write the build ID, commit hash, device iOS version, test songs, recognition result, lyric availability, observed timing behavior, and any remaining version-mismatch concern to `docs/superpowers/reports/2026-09-06-shazamkit-eas-verification.md`.

- [ ] **Step 6: Run final local checks and commit the report**

  Run: `npm test -- --runInBand --watchman=false` and `npm run typecheck`
  Expected: all tests pass and typecheck exits successfully.
  Commit: `git add docs/superpowers/reports/2026-09-06-shazamkit-eas-verification.md; git commit -m "docs: record ShazamKit device verification"`
