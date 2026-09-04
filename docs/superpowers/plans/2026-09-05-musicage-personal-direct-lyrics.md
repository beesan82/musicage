# MUSICAGE Personal Direct Lyrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MUSICAGE an Expo SDK 54 personal iPhone visualizer that identifies an owner-triggered 12-second mic clip directly with AudD and displays truthful lyrics from LRCLIB, without a MUSICAGE relay server.

**Architecture:** The SDK 57 PCM stream is replaced with SDK 54 recorder metering for the current scene engine. Direct provider code stays in pure modules: a runtime token comes from SecureStore, the temporary clip is posted to AudD, and the recognized title is queried directly at LRCLIB. A coordinator hook owns recorder exclusivity, cleanup, and safe UI states.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, expo-audio, expo-file-system, expo-secure-store, native fetch/FormData, Jest Expo, React Native Testing Library.

**Spec:** docs/superpowers/specs/2026-09-05-musicage-personal-direct-lyrics-design.md

## Global Constraints

- Target Expo SDK 54 so App Store Expo Go works on the owner’s iPhone; do not require a Mac, Xcode, paid Apple Developer membership, custom native build, Worker, or hosting account.
- Keep portrait-only, visual-first behavior. The app never plays audio and never gets player controls.
- Normal microphone listening is local-only. An audio clip may leave the iPhone only after the owner taps 曲を読み取る, and its hard maximum is 12 seconds.
- The owner supplies an AudD token on the same iPhone. Never put a token in Git, source, app.json, .env, EXPO_PUBLIC_ variables, test fixtures, logs, or screenshots.
- SecureStore is adequate only for this private owner-operated app. This design must not be used for public distribution without a new secret-boundary design.
- LRCLIB is called directly, sequentially, with header Lrclib-Client: MUSICAGE/0.1 (personal-use Expo client). Never auto-retry a recognition upload; honor LRCLIB 429.
- Do not use Musixmatch, Genius, scraping, Cloudflare, a proxy base URL, track history, telemetry, audio/lyric caching, or generated substitute lyrics.
- Delete every meter and recognition temporary file on success, failure, cancellation, interruption, background, and unmount.
- Preserve Ambient, Jazz, Pop, Dance, and Rock. Meter-derived low/mid/high are visual envelopes, not factual frequency bands.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| src/audio/meterFeatureProcessor.ts | Convert recorder dB readings into bounded, smoothed AudioFeatures. |
| src/audio/deleteTemporaryRecording.ts | Idempotently delete one recorder URI through expo-file-system. |
| src/audio/useMicrophoneAnalysis.ts | Own local meter recorder lifecycle and exclusive pause/resume. |
| src/audio/types.ts | AudioFeatures and MeterFeatureProcessor interfaces. |
| src/recognition/types.ts | Track, lyric result, and UI-state contracts. |
| src/recognition/tokenStore.ts | The only SecureStore access for the owner’s AudD token. |
| src/recognition/auddClient.ts | One direct multipart AudD recognition call and safe metadata parse. |
| src/recognition/lrclibClient.ts | One direct LRCLIB lookup and 404/429 handling. |
| src/recognition/lrc.ts | Parse LRC, parse AudD timecode, and select the active line. |
| src/recognition/resolveLyrics.ts | Convert provider-safe objects into a LyricResult. |
| src/recognition/captureRecognitionClip.ts | Bounded recorder capture primitive. |
| src/recognition/useSongRecognition.ts | Coordinate meter handoff, capture, HTTP, abort, and cleanup. |
| src/components/AudDTokenSheet.tsx | Setup/replacement/removal UI without rendering a stored token. |
| src/components/RecognitionControls.tsx | Compact read/setup/retry controls and honest state copy. |
| src/components/LyricTypography.tsx | Render only actual synchronized/plain lyric text or truthful status. |
| src/app/MusicageApp.tsx | Compose scene, meter, recognition, settings, and controls. |
| app.json | Correct microphone disclosure. |
| README.md | Token setup, privacy, and physical-device runbook. |

## Task 1: Add recorder-meter feature processing

**Files:**
- Create: src/audio/meterFeatureProcessor.ts
- Create: src/audio/__tests__/meterFeatureProcessor.test.ts
- Modify: src/audio/types.ts

**Interfaces:**
- Consumes: clamp01 from src/utils/clamp.ts and existing AudioFeatures.
- Produces: MeterFeatureProcessor with process(meterDb, timestampMs) and reset().
- Keeps: existing PCM FeatureProcessor temporarily, so the current hook still compiles until Task 2.

- [ ] **Step 1: Write the failing pure-processor tests**

Create src/audio/__tests__/meterFeatureProcessor.test.ts:

~~~ts
import { createMeterFeatureProcessor } from '../meterFeatureProcessor';

it('maps missing and floor-level dB readings to silence', () => {
  const processor = createMeterFeatureProcessor();

  expect(processor.process(undefined, 0)).toMatchObject({
    energy: 0, low: 0, mid: 0, high: 0, transient: 0, silence: true,
  });
  expect(processor.process(-160, 100)).toMatchObject({ energy: 0, silence: true });
});

it('raises energy and a transient after a quiet-to-loud change', () => {
  const processor = createMeterFeatureProcessor();
  processor.process(-55, 0);
  const result = processor.process(-8, 100);

  expect(result.energy).toBeGreaterThan(0.2);
  expect(result.transient).toBeGreaterThan(0.4);
  expect(result.high).toBeGreaterThan(result.mid * 0.25);
  expect(result.timestampMs).toBe(100);
});

it('clears smoothing state on reset', () => {
  const processor = createMeterFeatureProcessor();
  processor.process(-6, 0);
  processor.reset();

  expect(processor.process(-160, 100)).toMatchObject({
    energy: 0, transient: 0, silence: true,
  });
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm test -- --runInBand src/audio/__tests__/meterFeatureProcessor.test.ts

Expected: FAIL because meterFeatureProcessor does not exist.

- [ ] **Step 3: Implement the minimal processor and type**

Append this interface to src/audio/types.ts without removing the old interface yet:

~~~ts
export interface MeterFeatureProcessor {
  process(meterDb: number | undefined, timestampMs: number): AudioFeatures;
  reset(): void;
}
~~~

Implement src/audio/meterFeatureProcessor.ts. Map non-finite values and values at or below -60 dBFS to zero. Smooth energy with an exponential moving average. Derive transient only from positive energy delta. Derive display envelopes rather than claiming FFT bands:

~~~ts
const dbToEnergy = (meterDb: number | undefined): number => {
  if (!Number.isFinite(meterDb) || (meterDb ?? -160) <= -60) return 0;
  return clamp01(((meterDb ?? -60) + 60) / 60);
};

const low = energy;
const mid = clamp01(energy * 0.72 + transient * 0.28);
const high = clamp01(energy * 0.35 + transient * 0.65);
~~~

Use a named silence threshold and reset every previous value in reset().

- [ ] **Step 4: Run focused and regression tests**

Run:

~~~powershell
npm test -- --runInBand src/audio/__tests__/meterFeatureProcessor.test.ts
npm test -- --runInBand src/style/__tests__/styleEngine.test.ts
~~~

Expected: PASS. The new processor is isolated, so scene-selection tests remain unchanged.

- [ ] **Step 5: Commit**

~~~powershell
git add src/audio/types.ts src/audio/meterFeatureProcessor.ts src/audio/__tests__/meterFeatureProcessor.test.ts
git commit -m "feat: derive visual features from recorder metering"
~~~

## Task 2: Replace PCM streaming with recorder metering and cleanup

**Files:**
- Create: src/audio/deleteTemporaryRecording.ts
- Create: src/audio/__tests__/deleteTemporaryRecording.test.ts
- Modify: src/audio/useMicrophoneAnalysis.ts
- Modify: src/audio/types.ts
- Modify: src/audio/__tests__/useMicrophoneAnalysis.test.tsx
- Delete: src/audio/featureProcessor.ts
- Delete: src/audio/__tests__/featureProcessor.test.ts

**Interfaces:**
- Consumes: MeterFeatureProcessor from Task 1 and Expo Audio recorder APIs.
- Produces: the current MicrophoneAnalysis contract plus pauseForRecognition(): Promise<boolean> and resumeAfterRecognition(shouldResume: boolean): Promise<void>.
- Produces: deleteTemporaryRecording(uri, fileFactory?), a safe no-op for null/missing files.
- Removes: useAudioStream, AudioStreamBuffer, fft.js, and old PCM FeatureProcessor imports.

- [ ] **Step 1: Write failing deletion and recorder-hook tests**

Create src/audio/__tests__/deleteTemporaryRecording.test.ts:

~~~ts
import { deleteTemporaryRecording } from '../deleteTemporaryRecording';

it('does nothing for a null URI', () => {
  const factory = jest.fn();
  deleteTemporaryRecording(null, factory);
  expect(factory).not.toHaveBeenCalled();
});

it('deletes an existing temporary file once', () => {
  const remove = jest.fn();
  const factory = jest.fn(() => ({ exists: true, delete: remove }));

  deleteTemporaryRecording('file:///cache/meter.m4a', factory);

  expect(factory).toHaveBeenCalledWith('file:///cache/meter.m4a');
  expect(remove).toHaveBeenCalledTimes(1);
});

it('does not throw when the stopped recorder file is already absent', () => {
  expect(() => deleteTemporaryRecording('file:///cache/missing.m4a', () => ({
    exists: false,
    delete: jest.fn(),
  }))).not.toThrow();
});
~~~

Replace the stream mocks in src/audio/__tests__/useMicrophoneAnalysis.test.tsx with mocks for useAudioRecorder, useAudioRecorderState, AudioModule, and setAudioModeAsync. Add tests for:
- prepareToRecordAsync() then record(), with state metering -8 turning features non-silent;
- explicit stop, AppState background, and unmount each deleting recorder.uri;
- pauseForRecognition() returning true after listening, stopping/deleting the meter, and resumeAfterRecognition(true) recording again;
- a false pause result not restarting a user-stopped meter.

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

~~~powershell
npm test -- --runInBand src/audio/__tests__/deleteTemporaryRecording.test.ts src/audio/__tests__/useMicrophoneAnalysis.test.tsx
~~~

Expected: FAIL because cleanup module and recorder behavior do not exist.

- [ ] **Step 3: Add the deletion dependency, then implement cleanup and recorder lifecycle**

Before importing File, install the SDK 57-compatible filesystem package for this intermediate refactor and remove the no-longer-used FFT package:

~~~powershell
npx expo install expo-file-system
npm uninstall fft.js
~~~

Implement the deletion seam:

~~~ts
import { File } from 'expo-file-system';

export function deleteTemporaryRecording(
  uri: string | null,
  fileFactory = (candidateUri: string) => new File(candidateUri),
): void {
  if (!uri) return;
  const file = fileFactory(uri);
  if (file.exists) file.delete();
}
~~~

Refactor useMicrophoneAnalysis to use AudioModule, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, and RecordingPresets from expo-audio. Use state polling at 120 ms and pass meterState.metering to the Task 1 processor:

~~~ts
const meterRecorder = useAudioRecorder(METER_RECORDING_OPTIONS);
const meterState = useAudioRecorderState(meterRecorder, 120);

useEffect(() => {
  setFeatures(processor.process(meterState.metering, Date.now()));
}, [meterState.metering, processor]);
~~~

Set allowsRecording: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers', and allowsBackgroundRecording: false. Enable iOS metering on low-quality recorder options. Start with prepareToRecordAsync() followed by record().

Rotate the local meter segment every 45 seconds in this order: stop, delete URI, prepare, record. On explicit stop, error, AppState background, interruption, and unmount: clear the timer, stop only if active, delete URI, reset features. pauseForRecognition() must preserve whether the user was listening; resumeAfterRecognition() restarts only when that result was true.

- [ ] **Step 4: Run audio and visual regression tests**

Run:

~~~powershell
npm test -- --runInBand src/audio/__tests__ src/style/__tests__ src/scenes/__tests__
npm run typecheck
rg -n "useAudioStream|AudioStreamBuffer|fft\.js|featureProcessor" src package.json
~~~

Expected: tests and typecheck PASS; the search returns no matches.

- [ ] **Step 5: Commit**

~~~powershell
git add src/audio package.json package-lock.json
git commit -m "feat: use recorder metering for visual response"
~~~

Do not stage backup-before-musicage-initial-merge-20260826/.

## Task 3: Align packages and app configuration to Expo SDK 54

**Files:**
- Modify: package.json
- Modify: package-lock.json
- Modify: app.json
- Modify: jest.config.js only if the SDK 54 Jest preset requires it
- Modify: README.md
- Modify: src/app/MusicageApp.test.tsx

**Interfaces:**
- Consumes: recorder-based audio from Task 2.
- Produces: App Store Expo Go SDK 54 compatibility and truthfully disclosed microphone use.

- [ ] **Step 1: Add a product-constraint regression test**

Add this to src/app/MusicageApp.test.tsx:

~~~ts
it('keeps the visual object free of playback controls after audio migration', async () => {
  (useMicrophoneAnalysis as jest.Mock).mockReturnValue(createAnalysis('listening'));
  const screen = await render(<MusicageApp reducedMotion />);

  expect(screen.queryByText('NOW PLAYING')).toBeNull();
  expect(screen.queryByRole('button', { name: /再生|pause|play/i })).toBeNull();
});
~~~

- [ ] **Step 2: Run the focused app test**

Run: npm test -- --runInBand src/app/MusicageApp.test.tsx

Expected: PASS before package changes.

- [ ] **Step 3: Perform dependency alignment and permission correction**

Confirm Node is v20.19.0 or newer:

~~~powershell
node --version
~~~

Then run:

~~~powershell
npm install expo@^54.0.0
npx expo install expo-audio expo-asset expo-status-bar react react-native react-native-safe-area-context react-native-svg expo-secure-store expo-file-system
npm install --save-dev jest-expo@^54.0.0
npx expo install --fix
~~~

Let Expo select SDK-compatible package versions. In app.json replace the false microphone text with:

~~~json
"microphonePermission": "周囲で流れている音楽に反応する映像を表示するためにマイクを使用します。『曲を読み取る』を押したときだけ、最大12秒の音をAudDへ送信して曲を識別します。音声は履歴として保存しません。"
~~~

Retain portrait orientation, dark UI, enableBackgroundRecording: false, and enableBackgroundPlayback: false. Update README prerequisites to name App Store Expo Go SDK 54 and explain that only explicit recognition can upload audio.

- [ ] **Step 4: Verify dependency and runtime compatibility**

Run:

~~~powershell
npx expo-doctor@latest
npm run typecheck
npm test -- --runInBand
npx expo start --clear
~~~

Expected: Doctor has no mismatched dependencies, tests/typecheck pass, and the server advertises an SDK 54 project URL. Stop the server normally after confirming its QR is shown.

- [ ] **Step 5: Commit**

~~~powershell
git add package.json package-lock.json app.json jest.config.js README.md src/app/MusicageApp.test.tsx
git commit -m "chore: target Expo Go SDK 54"
~~~

## Task 4: Add token storage and recognition contracts

**Files:**
- Create: src/recognition/types.ts
- Create: src/recognition/tokenStore.ts
- Create: src/recognition/__tests__/tokenStore.test.ts

**Interfaces:**
- Consumes: expo-secure-store only.
- Produces: getAudDToken(), saveAudDToken(token), clearAudDToken().
- Produces: Track, LyricLine, LyricResult, RecognitionPhase, and RecognitionViewState.

- [ ] **Step 1: Write failing SecureStore tests**

Create src/recognition/__tests__/tokenStore.test.ts:

~~~ts
import * as SecureStore from 'expo-secure-store';
import { clearAudDToken, getAudDToken, saveAudDToken } from '../tokenStore';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

it('trims before storing the owner token', async () => {
  await saveAudDToken('  owner-token  ');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('musicage.auddToken', 'owner-token');
});

it('rejects blank input without writing storage', async () => {
  await expect(saveAudDToken('  ')).rejects.toThrow('AudD token is required');
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

it('reads null and clears the same private key', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  await expect(getAudDToken()).resolves.toBeNull();
  await clearAudDToken();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('musicage.auddToken');
});
~~~

- [ ] **Step 2: Run the test to verify failure**

Run: npm test -- --runInBand src/recognition/__tests__/tokenStore.test.ts

Expected: FAIL because the recognition module does not exist.

- [ ] **Step 3: Implement storage and provider-independent types**

Use only this private key:

~~~ts
const AUDD_TOKEN_KEY = 'musicage.auddToken';

export async function saveAudDToken(rawToken: string): Promise<void> {
  const token = rawToken.trim();
  if (!token) throw new Error('AudD token is required');
  await SecureStore.setItemAsync(AUDD_TOKEN_KEY, token);
}
~~~

Define types:

~~~ts
export interface Track {
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  timecodeSeconds: number | null;
}

export interface LyricLine {
  startMs: number;
  text: string;
}

export type LyricResult =
  | { kind: 'synced'; track: Track; lines: LyricLine[]; positionAtCaptureMs: number; captureStartedMonotonicMs: number }
  | { kind: 'plain'; track: Track; text: string }
  | { kind: 'instrumental'; track: Track }
  | { kind: 'lyrics_unavailable'; track: Track }
  | { kind: 'not_recognized' };
~~~

Define phases exactly: idle, setup_required, capturing, identifying, resolving_lyrics, error. RecognitionViewState contains phase, result, message, and retryable. No provider payload type belongs in UI components.

- [ ] **Step 4: Verify token safety**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/tokenStore.test.ts
npm run typecheck
rg -n "auddToken|AUDD_API_TOKEN|EXPO_PUBLIC" src app.json package.json
~~~

Expected: PASS. The search finds only the storage-key name, never a token value or public environment key.

- [ ] **Step 5: Commit**

~~~powershell
git add src/recognition/types.ts src/recognition/tokenStore.ts src/recognition/__tests__/tokenStore.test.ts
git commit -m "feat: store personal AudD token securely"
~~~

## Task 5: Implement direct AudD/LRCLIB clients and lyric resolution

**Files:**
- Create: src/recognition/auddClient.ts
- Create: src/recognition/lrclibClient.ts
- Create: src/recognition/lrc.ts
- Create: src/recognition/resolveLyrics.ts
- Create: src/recognition/__tests__/auddClient.test.ts
- Create: src/recognition/__tests__/lrclibClient.test.ts
- Create: src/recognition/__tests__/lrc.test.ts
- Create: src/recognition/__tests__/resolveLyrics.test.ts

**Interfaces:**
- Consumes: Task 4 types, a local File, and injected fetch in tests.
- Produces: recognizeAudD, lookupLrclib, parseLrc, parseAudDTimecode, activeLyricIndex, resolveLyrics.
- Guarantees: one direct AudD upload, no automatic retry, no raw response or secret exposed beyond this folder.

- [ ] **Step 1: Write failing direct-client tests**

Use mocked fetch only:

~~~ts
it('posts a runtime token and one file directly to AudD with return=timecode', async () => {
  const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
    status: 'success',
    result: {
      artist: 'Test Artist',
      title: 'Test Track',
      album: 'Test Album',
      timecode: '01:12',
    },
  }));

  const result = await recognizeAudD({
    token: 'owner-token',
    file: fakeClipFile,
    fetchImpl: fetchMock,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.audd.io/',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(result).toMatchObject({ title: 'Test Track', timecodeSeconds: 72 });
});

it('maps an AudD success with result:null to no match and safe-fails HTTP errors', async () => {
  // result:null => null; error must not include raw body/token in message.
});

it('uses direct LRCLIB signature parameters and the required client header', async () => {
  await lookupLrclib(testTrack, fetchMock);
  expect(String(fetchMock.mock.calls[0][0])).toContain('track_name=Test+Track');
  expect(fetchMock.mock.calls[0][1]).toMatchObject({
    headers: { 'Lrclib-Client': 'MUSICAGE/0.1 (personal-use Expo client)' },
  });
});

it('maps LRCLIB 404 to no record and 429 to a non-retried rate-limit error', async () => {
  // Parse Retry-After only when it is a positive number.
});

it('parses LRC timestamps and selects active lines', () => {
  const lines = parseLrc('[00:03.50]first\n[01:02.00]second');
  expect(lines).toEqual([{ startMs: 3500, text: 'first' }, { startMs: 62000, text: 'second' }]);
  expect(activeLyricIndex(lines, 62001)).toBe(1);
});

it('does not label LRC as synchronized without AudD timecode', () => {
  expect(resolveLyrics(trackWithoutTimecode, lrcRecord, 0)).toMatchObject({ kind: 'plain' });
});
~~~

- [ ] **Step 2: Run focused tests to verify failure**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/auddClient.test.ts src/recognition/__tests__/lrclibClient.test.ts src/recognition/__tests__/lrc.test.ts src/recognition/__tests__/resolveLyrics.test.ts
~~~

Expected: FAIL because clients and parser do not exist.

- [ ] **Step 3: Implement documented direct requests and safe resolver**

Implement exactly one AudD POST:

~~~ts
export async function recognizeAudD({ token, file, fetchImpl = fetch, signal }: AudDRequest): Promise<Track | null> {
  const form = new FormData();
  form.append('api_token', token);
  form.append('return', 'timecode');
  form.append('file', file);

  const response = await fetchImpl('https://api.audd.io/', {
    method: 'POST',
    body: form,
    signal,
  });
  // Parse only status/result/title/artist/album/duration/timecode.
}
~~~

Use an expo-file-system File from the temporary URI, never base64. Parse mm:ss, m:ss.xxx, and hh:mm:ss defensively. Result null is a normal no-match. Non-OK/malformed/abort must become a typed safe error that contains no raw body or token.

Build LRCLIB URL with URLSearchParams. Always pass track_name and artist_name; add album_name/duration only when available. A 404 is null. A 429 returns a typed error with valid Retry-After seconds and no automatic retry. Do not use /search or make a second request.

Implement LRC parsing for mm:ss, mm:ss.d, mm:ss.dd, and mm:ss.ddd. Ignore metadata tags; retain repeated timestamps; stable-sort by time. Resolver rules:

~~~ts
if (!record) return { kind: 'lyrics_unavailable', track };
if (record.instrumental) return { kind: 'instrumental', track };

const lines = parseLrc(record.syncedLyrics ?? '');
if (track.timecodeSeconds !== null && lines.length > 0) {
  return {
    kind: 'synced',
    track,
    lines,
    positionAtCaptureMs: Math.round(track.timecodeSeconds * 1000),
    captureStartedMonotonicMs,
  };
}

const plain = record.plainLyrics ?? lines.map((line) => line.text).join('\n');
return plain.trim()
  ? { kind: 'plain', track, text: plain.trim() }
  : { kind: 'lyrics_unavailable', track };
~~~

Do not parse AudD optional lyric extras in v1 because their payload shape is not a stable documented client contract. Real lyric body comes from LRCLIB’s documented fields; a later bounded task may add an AudD lyric adapter only after physical validation without logging lyric body.

- [ ] **Step 4: Verify direct-only topology**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/auddClient.test.ts src/recognition/__tests__/lrclibClient.test.ts src/recognition/__tests__/lrc.test.ts src/recognition/__tests__/resolveLyrics.test.ts
npm run typecheck
rg -n "Cloudflare|Worker|Musixmatch|MUSICAGE_API_BASE_URL|api/recognize" src
~~~

Expected: tests/typecheck PASS and the final search has no matches.

- [ ] **Step 5: Commit**

~~~powershell
git add src/recognition
git commit -m "feat: resolve direct AudD and LRCLIB lyrics"
~~~

## Task 6: Add exclusive 12-second capture and recognition orchestration

**Files:**
- Create: src/recognition/captureRecognitionClip.ts
- Create: src/recognition/useSongRecognition.ts
- Create: src/recognition/__tests__/captureRecognitionClip.test.ts
- Create: src/recognition/__tests__/useSongRecognition.test.tsx

**Interfaces:**
- Consumes: meter pause/resume from Task 2, Task 4 token store, Task 5 clients, and a second Expo Audio recorder.
- Produces: SongRecognition with state, hasToken, recognize(), retry(), refreshTokenPresence().
- Guarantees: one in-flight request, 12-second cap, cleanup on every result, and manual-only retries.

- [ ] **Step 1: Write failing capture/orchestration tests**

~~~ts
it('records exactly the bounded duration and returns recorder URI plus capture time', async () => {
  const recorder = fakeRecorder('file:///cache/recognition.m4a');
  const wait = jest.fn().mockResolvedValue(undefined);

  const clip = await captureRecognitionClip(recorder, { wait, now: () => 1234 });

  expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
  expect(recorder.record).toHaveBeenCalledWith({ forDuration: 12 });
  expect(wait).toHaveBeenCalledWith(12000);
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(clip).toEqual({ uri: 'file:///cache/recognition.m4a', captureStartedMonotonicMs: 1234 });
});

it('goes to setup_required without token and never records or fetches', async () => {
  // getAudDToken => null; assert no pause, recorder, or provider invocation.
});

it('pauses meter, resumes after capture, calls each provider once, and deletes clip on success', async () => {
  // Assert pause -> capture -> resume -> AudD -> LRCLIB -> delete.
});

it('deletes clip and resumes meter after service failure and hook unmount', async () => {
  // Both paths assert no temporary file remains.
});

it('ignores a second recognition press while capture is in flight', async () => {
  // Hold wait pending; call recognize twice; expect one recorder/provider path.
});
~~~

- [ ] **Step 2: Run to verify failure**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/captureRecognitionClip.test.ts src/recognition/__tests__/useSongRecognition.test.tsx
~~~

Expected: FAIL because capture primitive and hook do not exist.

- [ ] **Step 3: Implement capture and lifecycle**

Use a named hard maximum:

~~~ts
export const MAX_RECOGNITION_SECONDS = 12;

export async function captureRecognitionClip(
  recorder: RecognitionRecorder,
  deps: CaptureDeps,
): Promise<CapturedClip> {
  await recorder.prepareToRecordAsync();
  const captureStartedMonotonicMs = deps.now();
  recorder.record({ forDuration: MAX_RECOGNITION_SECONDS });
  await deps.wait(MAX_RECOGNITION_SECONDS * 1000);
  await recorder.stop();
  if (!recorder.uri) throw new Error('Recognition recorder did not produce a file');
  return { uri: recorder.uri, captureStartedMonotonicMs };
}
~~~

useSongRecognition owns a second useAudioRecorder(RecordingPresets.LOW_QUALITY). Read the token fresh at every explicit recognize call. Do not prepare the recognition recorder until the meter is paused. Build new File(clip.uri) only after capture. Resume meter immediately after capture, before network work. Delete the clip in a finally block after direct AudD/LRCLIB work:

~~~ts
const shouldResume = await meter.pauseForRecognition();
let clip: CapturedClip | null = null;
try {
  setState(capturingState);
  clip = await captureRecognitionClip(recorder, deps);
} finally {
  await meter.resumeAfterRecognition(shouldResume);
}

try {
  setState(identifyingState);
  const track = await recognizeAudD(/* runtime token, File, signal */);
  setState(resolvingLyricsState);
  const record = track ? await lookupLrclib(track, fetchImpl, signal) : null;
  setState(resultToViewState(track
    ? resolveLyrics(track, record, clip.captureStartedMonotonicMs)
    : { kind: 'not_recognized' }));
} finally {
  deleteTemporaryRecording(clip?.uri ?? null);
}
~~~

Create one AbortController per recognition. On unmount/app background: abort, stop if recording, delete URI, clear in-flight state, and retain the last successful LyricResult. Never auto-retry AudD because an interrupted upload might still be billed.

- [ ] **Step 4: Run regression tests**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/captureRecognitionClip.test.ts src/recognition/__tests__/useSongRecognition.test.tsx src/audio/__tests__
npm run typecheck
~~~

Expected: PASS. Every success, error, cancellation, background, and unmount test asserts cleanup.

- [ ] **Step 5: Commit**

~~~powershell
git add src/recognition/captureRecognitionClip.ts src/recognition/useSongRecognition.ts src/recognition/__tests__/captureRecognitionClip.test.ts src/recognition/__tests__/useSongRecognition.test.tsx
git commit -m "feat: capture and recognize songs directly"
~~~

## Task 7: Replace sample copy with real lyric UI and token setup

**Files:**
- Create: src/components/AudDTokenSheet.tsx
- Create: src/components/RecognitionControls.tsx
- Create: src/components/__tests__/AudDTokenSheet.test.tsx
- Create: src/components/__tests__/RecognitionControls.test.tsx
- Modify: src/components/LyricTypography.tsx
- Modify: src/components/__tests__/ListeningControls.test.tsx
- Modify: src/scenes/__tests__/SceneRenderer.test.tsx
- Modify: src/app/MusicageApp.tsx
- Modify: src/app/MusicageApp.test.tsx
- Delete: src/app/sampleCopy.ts

**Interfaces:**
- Consumes: SongRecognition state and LyricResult from Tasks 4–6.
- Produces: compact setup/read/retry UI and typography that never uses local lyric-like samples.
- Keeps: ListeningControls responsible only for microphone start/stop/retry.

- [ ] **Step 1: Write failing UI tests**

~~~ts
it('saves typed token without rendering a stored token', async () => {
  const screen = await render(
    <AudDTokenSheet visible hasToken onSave={save} onClear={clear} onClose={close} />,
  );
  fireEvent.changeText(screen.getByLabelText('AudD APIトークン'), 'owner-private-token');
  fireEvent.press(screen.getByRole('button', { name: '保存する' }));

  expect(save).toHaveBeenCalledWith('owner-private-token');
  expect(screen.queryByText('owner-private-token')).toBeNull();
});

it('opens setup instead of capture when no token exists', async () => {
  const screen = await render(
    <RecognitionControls state={setupRequiredState} onRecognize={recognize} onRetry={retry} onOpenSettings={openSettings} />,
  );
  fireEvent.press(screen.getByRole('button', { name: 'AudDキーを設定' }));
  expect(openSettings).toHaveBeenCalledTimes(1);
  expect(recognize).not.toHaveBeenCalled();
});

it('renders a synchronized current line but no visual sample copy', async () => {
  const screen = await render(
    <LyricTypography visual={ambient} lyricResult={syncedResult} reducedMotion />,
  );
  expect(screen.getByText('同期歌詞')).toBeTruthy();
  expect(screen.getByText('test current line')).toBeTruthy();
  expect(screen.queryByText('VISUAL COPY')).toBeNull();
  expect(screen.queryByText('THE ROOM MOVES')).toBeNull();
});

it('renders plain and unavailable lyric states honestly', async () => {
  // Plain text has no 同期歌詞 label.
  // Unavailable has この曲の歌詞は見つかりませんでした.
});
~~~

Update scene typography tests to assert idle text is status-only, not VISUAL COPY or NOT A LYRIC.

- [ ] **Step 2: Run UI tests to verify failure**

Run:

~~~powershell
npm test -- --runInBand src/components/__tests__/AudDTokenSheet.test.tsx src/components/__tests__/RecognitionControls.test.tsx src/app/MusicageApp.test.tsx src/scenes/__tests__/SceneRenderer.test.tsx
~~~

Expected: FAIL because setup/controls do not exist and current typography imports sampleCopy.

- [ ] **Step 3: Implement components and compose the app**

AudDTokenSheet uses Modal and an empty secure TextInput. It never loads a stored token into the input. Its props are:

~~~ts
interface AudDTokenSheetProps {
  visible: boolean;
  hasToken: boolean;
  onSave(token: string): Promise<void>;
  onClear(): Promise<void>;
  onClose(): void;
}
~~~

Show only a fixed save failure message: トークンを保存できませんでした。. Provide Save, Remove, and Close.

RecognitionControls has:
- 曲を読み取る in idle/listening;
- disabled progress labels while capturing, identifying, or resolving_lyrics;
- AudDキーを設定 for setup_required;
- もう一度読み取る for retryable error/no-match only;
- no playback controls or generated lyric suggestion.

LyricTypography accepts lyricResult: LyricResult | null. For synced result, update time every 250 ms and calculate current position as positionAtCaptureMs plus performance.now() minus captureStartedMonotonicMs. Render previous/current/next real line with label 同期歌詞. For plain result, split only the returned text by line breaks and display at most three contiguous nonempty phrases, with no sync label. For instrumental/unavailable/no-match/idle, use only exact status copy from the spec. Maintain each visual world’s movement/scale/color without modifying lyric text.

Compose hooks in MusicageApp:

~~~tsx
const microphone = useMicrophoneAnalysis();
const recognition = useSongRecognition({
  pauseForRecognition: microphone.pauseForRecognition,
  resumeAfterRecognition: microphone.resumeAfterRecognition,
});

<LyricTypography
  visual={visual}
  lyricResult={recognition.state.result}
  reducedMotion={reducedMotion}
/>
<RecognitionControls
  state={recognition.state}
  onRecognize={recognition.recognize}
  onRetry={recognition.retry}
  onOpenSettings={() => setTokenSheetVisible(true)}
/>
~~~

Continue auto-starting local metering on mount. Never auto-start recognition. Delete src/app/sampleCopy.ts and all imports/usages.

- [ ] **Step 4: Run UI and full regression checks**

Run:

~~~powershell
npm test -- --runInBand src/components/__tests__ src/app/MusicageApp.test.tsx src/scenes/__tests__
npm test -- --runInBand
npm run typecheck
rg -n "SAMPLE_VISUAL_COPY|VISUAL COPY|NOT A LYRIC|NOW PLAYING" src
~~~

Expected: tests/typecheck PASS and the final search returns no product-source matches.

- [ ] **Step 5: Commit**

~~~powershell
git add src/components src/app/MusicageApp.tsx src/app/MusicageApp.test.tsx src/scenes/__tests__/SceneRenderer.test.tsx
git add -u src/app/sampleCopy.ts
git commit -m "feat: display recognized lyrics in musicage"
~~~

## Task 8: Document setup and verify safely on the actual iPhone

**Files:**
- Modify: README.md
- Modify: docs/superpowers/specs/2026-09-05-musicage-personal-direct-lyrics-design.md only if physical validation exposes a factual SDK/API mismatch.

**Interfaces:**
- Consumes: the completed SDK 54 direct client.
- Produces: reproducible owner instructions and evidence-based validation. It adds no product capability.

- [ ] **Step 1: Update README verification instructions**

Replace the old statement that MUSICAGE never records/uploads/identifies audio with:

~~~md
## Real lyrics setup

1. Create an AudD account yourself and obtain an API token. Do not add it to this repository or send it in chat.
2. Start npm run start:tunnel, scan the QR with App Store Expo Go, then open AudDキーを設定 and enter the token on the iPhone.
3. Normal listening remains local. 曲を読み取る sends one maximum-12-second clip directly to AudD; LRCLIB receives only recognized track metadata.
4. Remove the token in settings to disable recognition again.
~~~

Add that LRCLIB availability is not guaranteed and MUSICAGE reports missing lyrics truthfully.

- [ ] **Step 2: Run static verification before a token is entered**

Run:

~~~powershell
npm test -- --runInBand
npm run typecheck
npx expo-doctor@latest
git status --short
~~~

Expected: all checks pass. The only pre-existing untracked entry allowed is backup-before-musicage-initial-merge-20260826/. No credential, audio file, provider body, build output, or .env is allowed.

- [ ] **Step 3: Perform owner-operated physical validation**

Run npm run start:tunnel on Windows, scan QR in App Store Expo Go, and validate in this order:

1. Portrait UI opens with no Expo SDK mismatch.
2. Denying mic shows recovery; allowing mic animates local scenes.
3. Before 曲を読み取る, no recognition request occurs.
4. Owner enters their own token; the token never echoes visually.
5. One audible track produces exactly one capture, truthful track metadata, and supported plain/synchronized real lyrics.
6. One quiet/no-match case and one identified/no-lyrics case show the correct truthful state.
7. Background during capture, return, and confirm a fresh listening session with no stale capture state.
8. Remove token, restart Expo Go, and confirm the app requires setup instead of making a network request.

Never paste token, raw response, or lyric text into output, source, Git, or chat.

- [ ] **Step 4: Run final repository verification**

Run:

~~~powershell
npm test -- --runInBand
npm run typecheck
npx expo-doctor@latest
git diff --check
git status --short
~~~

Expected: tests/typecheck/Doctor pass, diff check has no whitespace errors, and status has no secret or recording artifact.

- [ ] **Step 5: Commit documentation only if it changed**

~~~powershell
git add README.md docs/superpowers/specs/2026-09-05-musicage-personal-direct-lyrics-design.md
git commit -m "docs: explain personal direct lyrics setup"
~~~

Do not commit audio clips, screenshots exposing a token, raw provider responses, or the user-owned backup directory.

## Plan Self-Review

| Spec requirement | Plan task(s) |
| --- | --- |
| Expo SDK 54 and Windows/iPhone Expo Go path | 2, 3, 8 |
| Local visual response and five worlds | 1, 2, 3, 7, 8 |
| Explicit 12-second direct capture | 5, 6, 8 |
| No Worker/server/Musixmatch/Genius | 5, 8 |
| Owner-entered SecureStore token | 4, 6, 7, 8 |
| Direct respectful LRCLIB lookup | 5, 8 |
| Synced/plain/unavailable truthful lyric states | 5, 7, 8 |
| No fake local lyric copy | 7 |
| File cleanup on all paths | 2, 6, 8 |
| Privacy copy and owner documentation | 3, 8 |
| Automated and physical verification | every task, especially 8 |

The plan has concrete file paths, defined interfaces, failing tests, execution commands, expected outcomes, and commit boundaries. It intentionally relies on LRCLIB’s documented lyric fields rather than treating AudD’s optional lyric extras as a stable client schema.
