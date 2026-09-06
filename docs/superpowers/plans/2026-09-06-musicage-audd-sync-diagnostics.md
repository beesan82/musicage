# MUSICAGE AudD Sync Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Stop presenting an inferred AudD Standard timecode as lyric synchronization. Add an owner-only, iPhone-local diagnostic workflow that can prove or reject a capture-relative AudD calibration, while keeping real LRCLIB LRC lyrics static until the owner explicitly approves a passing calibration.

**Architecture:** Split synchronization into three layers. A pure diagnostic domain validates safe trial records and evaluates a per-clip-duration robust median. A local file store persists only safe derived trial data and an explicit owner decision. The existing recognition hook captures a selectable bounded clip, exposes sanitized diagnostic evidence, and never guesses a midpoint. Typography derives its timing status from the current approved calibration on every render: static real excerpts when unverified, or one performance.now()-based clock only when the recording duration and calibration match.

**Tech Stack:** Expo SDK 57 / Expo Go, React Native, TypeScript, expo-audio, expo-file-system modern File API, expo-crypto for a SHA-256 lyric fingerprint, expo-secure-store, Jest Expo, React Native Testing Library.

**Spec:** docs/superpowers/specs/2026-09-06-musicage-audd-sync-diagnostics-design.md

## Guardrails and working agreement

- Work only in C:\Users\Owner\OneDrive\musicageageapp\.worktrees\personal-direct-lyrics on branch codex/personal-direct-lyrics. Preserve the existing visualizer and all unrelated dirty changes.
- Never stage or commit expo-go-qr.png, a recording, an AudD token, a provider response, a lyric body, a screenshot with secrets, or the backup worktree.
- Remove every use of the capture midpoint. No fixed bias, moving average, PLL, Kalman filter, or repeated automatic AudD request may substitute for a measured calibration.
- Normal recognition remains one explicit owner action. It uses the approved calibration duration when one exists, otherwise a named 12,000 ms fallback for recognition reliability; it is not a synchronization claim in the fallback case.
- All diagnostic math uses monotonic milliseconds. Date.now(), interval accumulation, and render timers must not become a song clock.
- A diagnostic flash is a visual/video cue only. Its timeout may turn the flash off, but it must not contribute to timing math.
- Diagnostics persist only on the iPhone in the document directory. They have no upload, export, analytics, background recognition, server, or cloud-sync path.
- An exploratory manual observation can be saved for local troubleshooting, but it never counts toward calibration acceptance. Only video-timed controlled-playback samples are valid.

## File map

| Path | Responsibility |
| --- | --- |
| src/recognition/syncDiagnostics/types.ts | Versioned safe trial, calibration, summary, decision, and duration contracts. |
| src/recognition/syncDiagnostics/evaluateCalibration.ts | Pure validation, grouping, robust median/residual calculation, and pass/fail recommendation. |
| src/recognition/syncDiagnostics/createDiagnosticSample.ts | Convert runtime recognition evidence to a persistable safe trial without audio, secrets, full lyrics, or raw payloads. |
| src/recognition/syncDiagnostics/lyricsFingerprint.ts | SHA-256 only the in-memory synced lyric string before it enters diagnostic metadata. |
| src/recognition/syncDiagnostics/diagnosticStore.ts | Versioned device-local JSON read, append, decision write, and explicit clear adapter. |
| src/recognition/syncDiagnostics/useSyncDiagnostics.ts | React controller for storage, summaries, owner decisions, and a short capture-flash state. |
| src/recognition/captureRecognitionClip.ts | Bounded selected-duration capture with actual local start/end timestamps, never an inferred match point. |
| src/recognition/auddClient.ts | Parse safe raw/parsed AudD timecode fields and no other raw provider payload. |
| src/recognition/lrclibClient.ts | Preserve LRCLIB record ID plus lyric fields already required for rendering. |
| src/recognition/lyricTiming.ts | Derive unverified/calibrated timing and calculate the sole monotonic lyric position equation. |
| src/recognition/resolveLyrics.ts | Preserve timestamped LRC as timestamped content even when its clock is unverified. |
| src/recognition/useSongRecognition.ts | Coordinate meter handoff, selected capture, providers, cleanup, and sanitized diagnostic evidence. |
| src/components/SyncDiagnosticsSheet.tsx | Owner-only capture, video-observation entry, safe summaries, approval/rejection, and clear UI. |
| src/components/AudDTokenSheet.tsx | Settings entry point for the diagnostics sheet. |
| src/components/LyricTypography.tsx | Static truthful LRC excerpts before approval and monotonic active-line rendering after approval. |
| src/app/MusicageApp.tsx | Compose normal recognition, diagnostics, typography, and modal routing. |
| README.md | Local diagnostic protocol, interpretation, privacy boundary, and physical validation instructions. |

## Task 1: Establish diagnostic contracts and the pure acceptance gate

**Files:**
- Create: src/recognition/syncDiagnostics/types.ts
- Create: src/recognition/syncDiagnostics/evaluateCalibration.ts
- Create: src/recognition/syncDiagnostics/__tests__/evaluateCalibration.test.ts

**Interfaces:**

~~~ts
export const CLIP_DURATIONS_MS = [3_000, 5_000, 7_000, 12_000] as const;
export type ClipDurationMs = (typeof CLIP_DURATIONS_MS)[number];

export type GroundTruth =
  | {
      songPositionAtCaptureStartMs: number;
      method: 'video-timed-controlled-playback';
      observedPrecisionMs: number;
    }
  | {
      songPositionAtCaptureStartMs: number;
      method: 'manual-estimate';
      observedPrecisionMs: number;
    };

export interface SyncDiagnosticSample {
  schemaVersion: 1;
  id: string;
  capture: {
    requestedDurationMs: ClipDurationMs;
    startedMonotonicMs: number;
    endedMonotonicMs: number;
  };
  audd: {
    timecodeRaw: string | null;
    timecodeMs: number | null;
    responseMonotonicMs: number | null;
    title: string | null;
    artist: string | null;
  };
  lrclib: {
    recordId: number | null;
    syncedLineCount: number;
    syncedLyricsHash: string | null;
  };
  groundTruth: GroundTruth | null;
}

export interface AudDCalibration {
  schemaVersion: 1;
  clipDurationMs: ClipDurationMs;
  anchorOffsetMs: number;
  acceptedSampleCount: number;
}
~~~

The video-timed GroundTruth arm is the approved-spec shape. The manual-estimate arm only preserves an exploratory observation and is always excluded from the evaluator; it must never silently claim video proof.

- [ ] **Step 1: Write failing domain tests**

Create deterministic sample factories in evaluateCalibration.test.ts. Cover all of the following without importing React, Expo, a provider client, or storage:

~~~ts
it('uses a median anchor offset and the defined p90 index for an eligible duration', () => {
  const summary = evaluateDuration(samplesAtDuration(3_000, [
    4_000, 4_100, 3_900, 4_000, 4_050, 3_950, 4_000, 4_000, 4_000,
  ]));

  expect(summary).toMatchObject({
    clipDurationMs: 3_000,
    status: 'passed',
    validSampleCount: 9,
    medianAnchorOffsetMs: 4_000,
  });
  expect(summary.p90AbsoluteResidualMs).toBe(100);
});

it('requires a video observation, safe track key, timecode, synced LRC, and sane monotonic capture', () => {
  expect(validateDiagnosticSample(sample({
    audd: { timecodeMs: null },
  }))).toContain('missing_timecode');
  expect(validateDiagnosticSample(sample({
    groundTruth: { method: 'manual-estimate', songPositionAtCaptureStartMs: 10_000, observedPrecisionMs: 100 },
  }))).toContain('ground_truth_not_video_timed');
  expect(validateDiagnosticSample(sample({
    capture: { requestedDurationMs: 3_000, startedMonotonicMs: 100, endedMonotonicMs: 99 },
  }))).toContain('invalid_capture_range');
});

it('accepts at least 90 percent within each sample tolerance but rejects any hard-limit residual', () => {
  // Nine samples: one residual may be within 500 + precision.
  // A second set includes a residual greater than 1,000 + precision and must fail.
});

it('leaves a duration insufficient until it has nine valid samples over three tracks and three positions', () => {
  // Build 9 otherwise-valid samples, first with two unique track keys then with three.
  // Position keys are rounded to whole observed seconds before uniqueness is counted.
});

it('chooses the shortest passing duration and recommends rejection only after all four eligible durations fail', () => {
  expect(selectPreferredCalibration(summaries)).toMatchObject({ clipDurationMs: 5_000 });
  expect(deriveDecision(allEligibleFailures)).toEqual({ kind: 'rejected' });
});
~~~

Include non-finite values, unsupported duration values cast from malformed persisted JSON, negative ground-truth positions, missing title/artist, zero synced lines, and missing ground truth in validation tests. A retained invalid sample must not enter residual math.

- [ ] **Step 2: Run the focused test to prove it is red**

Run:

~~~powershell
npm test -- --runInBand src/recognition/syncDiagnostics/__tests__/evaluateCalibration.test.ts
~~~

Expected: FAIL because the diagnostic contracts and evaluator do not yet exist.

- [ ] **Step 3: Implement the smallest pure model and evaluator**

Implement these named pure exports:

~~~ts
export function isClipDurationMs(value: unknown): value is ClipDurationMs;
export function validateDiagnosticSample(sample: SyncDiagnosticSample): DiagnosticInvalidReason[];
export function evaluateDuration(samples: readonly SyncDiagnosticSample[], clipDurationMs: ClipDurationMs): DurationEvaluation;
export function evaluateAllDurations(samples: readonly SyncDiagnosticSample[]): DurationEvaluation[];
export function selectPreferredCalibration(evaluations: readonly DurationEvaluation[]): AudDCalibration | null;
export function deriveDecision(evaluations: readonly DurationEvaluation[]): SyncDiagnosticDecision;
~~~

Use the following exact rules:

1. A valid acceptance sample has a video-timed GroundTruth, finite non-negative song position/precision/timecode, start <= end, title and artist after trimming, and at least one synced LRC line with a non-empty fingerprint.
2. Its observed offset is audd.timecodeMs minus groundTruth.songPositionAtCaptureStartMs.
3. For an even sample count, median is the mean of the two middle sorted offsets. The p90 absolute residual uses sorted index Math.ceil(0.90 * count) - 1.
4. A position key is Math.round(songPositionAtCaptureStartMs / 1_000). A track key is lowercased trimmed title plus a NUL separator plus lowercased trimmed artist. A duration is eligible only with nine valid samples, three unique track keys, and three unique position keys.
5. A residual is within tolerance when it is <= 500 + observedPrecisionMs. It violates the hard limit when it is > 1_000 + observedPrecisionMs.
6. An eligible duration passes only when passingResidualCount / validSampleCount >= 0.90 and no residual violates its hard limit. Otherwise it fails. Ineligible durations remain insufficient, never failed.
7. Select the least clipDurationMs among passing summaries. Its calibration contains only the duration, robust median anchor offset, and accepted sample count.
8. Derive rejected only when every one of the four duration summaries is eligible and failed. Otherwise derive undecided unless an approved calibration exists in the store.

Do not import Date, performance, device APIs, React, fetch, or provider types. Treat a value parsed from storage as untrusted and validate it before calculating.

- [ ] **Step 4: Run domain and existing recognition tests**

Run:

~~~powershell
npm test -- --runInBand src/recognition/syncDiagnostics/__tests__/evaluateCalibration.test.ts src/recognition/__tests__/resolveLyrics.test.ts
npm run typecheck
~~~

Expected: PASS. Existing lyric behavior still compiles because integration has not changed yet.

- [ ] **Step 5: Commit only the isolated domain**

~~~powershell
git add src/recognition/syncDiagnostics/types.ts src/recognition/syncDiagnostics/evaluateCalibration.ts src/recognition/syncDiagnostics/__tests__/evaluateCalibration.test.ts
git commit -m "feat: evaluate AudD sync diagnostics locally"
~~~

## Task 2: Replace midpoint capture data and preserve safe provider evidence

**Files:**
- Modify: src/recognition/types.ts
- Modify: src/recognition/captureRecognitionClip.ts
- Modify: src/recognition/auddClient.ts
- Modify: src/recognition/lrclibClient.ts
- Modify: src/recognition/__tests__/captureRecognitionClip.test.ts
- Modify or create: src/recognition/__tests__/auddClient.test.ts
- Modify or create: src/recognition/__tests__/lrclibClient.test.ts
- Modify: src/recognition/resolveLyrics.ts
- Modify: src/recognition/useSongRecognition.ts
- Modify: src/recognition/__tests__/resolveLyrics.test.ts
- Modify: src/recognition/__tests__/useSongRecognition.test.tsx
- Modify: src/components/LyricTypography.tsx
- Modify: src/components/__tests__/LyricTypography.test.tsx

**Interfaces:**

~~~ts
export interface CapturedRecognitionClip {
  uri: string;
  requestedDurationMs: ClipDurationMs;
  startedMonotonicMs: number;
  endedMonotonicMs: number;
}

export interface Track {
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  timecodeRaw: string | null;
  timecodeMs: number | null;
}

export interface LrclibLyricsRecord {
  recordId: number | null;
  instrumental: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
}
~~~

- [ ] **Step 1: Write capture and parser regression tests before editing implementation**

Replace midpoint expectations with the exact start/end contract:

~~~ts
it('records the selected duration and reports local bounds without a midpoint anchor', async () => {
  const now = jest.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(4_024);
  const onCaptureStarted = jest.fn();

  const clip = await captureRecognitionClip(recorder, {
    durationMs: 3_000,
    now,
    wait,
    onCaptureStarted,
  });

  expect(recorder.record).toHaveBeenCalledWith({ forDuration: 3 });
  expect(wait).toHaveBeenCalledWith(3_000);
  expect(onCaptureStarted).toHaveBeenCalledWith(1_000);
  expect(clip).toEqual({
    uri: 'file:///cache/recognition.m4a',
    requestedDurationMs: 3_000,
    startedMonotonicMs: 1_000,
    endedMonotonicMs: 4_024,
  });
  expect(clip).not.toHaveProperty('timecodeAnchorMonotonicMs');
});
~~~

Add parameterized capture cases for 5,000, 7,000, and 12,000 ms and invalid caller values. Keep abort/interruption cleanup tests and assert an interrupted capture produces no clip.

Update AudD tests to assert:

~~~ts
expect(track).toMatchObject({
  title: 'Test Track',
  timecodeRaw: '01:23',
  timecodeMs: 83_000,
});
~~~

Test malformed/missing timecode returns both fields as null, while a normal no-match remains null. Do not assert a raw response object is returned. Update LRCLIB tests so numeric id becomes recordId and absent/non-numeric id becomes null.

- [ ] **Step 2: Run the focused tests to verify expected failures**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/captureRecognitionClip.test.ts src/recognition/__tests__/auddClient.test.ts src/recognition/__tests__/lrclibClient.test.ts
~~~

Expected: FAIL on midpoint expectations and missing safe metadata fields.

- [ ] **Step 3: Implement selected capture bounds, no inferred anchor**

Change captureRecognitionClip to accept a validated ClipDurationMs. It must:

1. prepare the recorder;
2. read performance.now() through the injected now seam immediately before recorder.record;
3. call onCaptureStarted with that exact recorded value, then begin the recorder;
4. call recorder.record with durationMs / 1_000;
5. await exactly durationMs through the injected wait seam;
6. stop, then read performance.now() again;
7. require a URI and return the four safe capture fields.

There must be no arithmetic averaging of start/end, no positionAtCapture field, and no timer-based song progression.

Update Track and all provider fixtures to replace timecodeSeconds with timecodeRaw and timecodeMs. Keep parseAudDTimecode as the single parser, but return integer milliseconds for MM:SS and retain the original string verbatim only in Track.timecodeRaw. The AudD client still sends exactly one direct multipart request and still exposes neither token nor raw response.

Update LRCLIB parsing to retain only recordId, instrumental, syncedLyrics, and plainLyrics. Do not add a search fallback or extra request.

The old midpoint-bearing LyricResult, hook, and typography call sites must compile after this boundary change without retaining a guessed local anchor. Hoist the minimal unverified data/presentation migration needed for that: timestamped LRC becomes a timestamped result with capture start, selected duration, and nullable AudD timecode evidence; Typography immediately renders its real static excerpt under 歌詞 and runs no active-line timer in that state. It must not calculate a current song position, label UI as synchronized, add calibration selection, create lyricTiming.ts, or add storage/controller behavior. Task 4 owns the calibrated timing resolver and the calibrated presentation branch.

- [ ] **Step 4: Prove no midpoint field survives**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/captureRecognitionClip.test.ts src/recognition/__tests__/auddClient.test.ts src/recognition/__tests__/lrclibClient.test.ts src/recognition/__tests__/resolveLyrics.test.ts src/recognition/__tests__/useSongRecognition.test.tsx
npm test -- --runInBand src/components/__tests__/LyricTypography.test.tsx
npm run typecheck
rg -n "timecodeAnchorMonotonicMs|captureStartedMonotonicMs \+ captureEndedMonotonicMs|/ 2" src/recognition
~~~

Expected: tests/typecheck PASS and the search has no inferred capture-midpoint match-anchor expression. Legitimate mathematical halves in unrelated code are not a failure.

- [ ] **Step 5: Commit the capture/provider boundary**

~~~powershell
git add src/recognition/types.ts src/recognition/captureRecognitionClip.ts src/recognition/auddClient.ts src/recognition/lrclibClient.ts src/recognition/resolveLyrics.ts src/recognition/useSongRecognition.ts src/recognition/__tests__/captureRecognitionClip.test.ts src/recognition/__tests__/auddClient.test.ts src/recognition/__tests__/lrclibClient.test.ts src/recognition/__tests__/resolveLyrics.test.ts src/recognition/__tests__/useSongRecognition.test.tsx src/components/LyricTypography.tsx src/components/__tests__/LyricTypography.test.tsx
git commit -m "refactor: capture AudD diagnostic evidence without midpoint"
~~~

## Task 3: Create a safe sample builder and device-local diagnostic store

**Files:**
- Create: src/recognition/syncDiagnostics/lyricsFingerprint.ts
- Create: src/recognition/syncDiagnostics/createDiagnosticSample.ts
- Create: src/recognition/syncDiagnostics/diagnosticStore.ts
- Create: src/recognition/syncDiagnostics/__tests__/createDiagnosticSample.test.ts
- Create: src/recognition/syncDiagnostics/__tests__/diagnosticStore.test.ts
- Modify: package.json
- Modify: package-lock.json

**Interfaces:**

~~~ts
export interface SyncDiagnosticsSnapshot {
  schemaVersion: 1;
  samples: SyncDiagnosticSample[];
  calibrations: AudDCalibration[];
  decision: { kind: 'undecided' } | { kind: 'approved'; clipDurationMs: ClipDurationMs } | { kind: 'rejected' };
}

export interface SyncDiagnosticStore {
  load(): Promise<StoreLoadResult>;
  appendSample(sample: SyncDiagnosticSample): Promise<StoreWriteResult>;
  saveDecision(snapshot: SyncDiagnosticsSnapshot): Promise<StoreWriteResult>;
  clear(): Promise<StoreWriteResult>;
}
~~~

- [ ] **Step 1: Add failing safe-serialization and storage tests**

Install the SDK-compatible cryptography package only after the tests are in place:

~~~powershell
npx expo install expo-crypto
~~~

Use a test-injected digest function, random-id function, and in-memory File-like adapter. Write these cases:

~~~ts
it('builds a diagnostic sample with a fingerprint but never with audio, token, lyric text, or provider payload', async () => {
  const sample = await createDiagnosticSample(runtimeEvidence, {
    createId: () => 'trial-1',
    digestLyrics: async () => 'sha256:abc',
  });

  const serialized = JSON.stringify(sample);
  expect(sample.lrclib).toEqual({
    recordId: 42,
    syncedLineCount: 17,
    syncedLyricsHash: 'sha256:abc',
  });
  expect(serialized).not.toContain('file:///cache/recognition.m4a');
  expect(serialized).not.toContain('owner-private-token');
  expect(serialized).not.toContain('full lyric line');
  expect(serialized).not.toContain('rawProviderPayload');
});

it('loads an absent file as an empty versioned snapshot and appends only a validated safe record', async () => {
  // Assert document filename, create/write behavior, and round-trip snapshot.
});

it('does not overwrite a corrupt store on append and reports a safe local read error', async () => {
  // Clear is the only explicit operation permitted to replace a corrupt snapshot.
});

it('clears samples, calibrations, and decision without contacting any network service', async () => {
  // Assert only File adapter methods; no fetch mock receives a call.
});
~~~

Test sample creation for no AudD match and missing LRCLIB. It should produce null-safe provider fields and no unsafe runtime field, so the owner can retain an invalid diagnostic result if helpful.

- [ ] **Step 2: Run the focused tests to confirm they fail**

Run:

~~~powershell
npm test -- --runInBand src/recognition/syncDiagnostics/__tests__/createDiagnosticSample.test.ts src/recognition/syncDiagnostics/__tests__/diagnosticStore.test.ts
~~~

Expected: FAIL because the fingerprint, builder, and local store do not exist.

- [ ] **Step 3: Implement privacy-preserving evidence conversion**

Use expo-crypto only inside lyricsFingerprint.ts. Verify its SDK 57 type declarations before selecting the exact function name; production must produce the literal prefix sha256: followed by a SHA-256 digest of the in-memory synced LRC string. The raw string must not cross the createDiagnosticSample return boundary.

createDiagnosticSample accepts only explicitly named runtime evidence:

~~~ts
{
  capture: CapturedRecognitionClip;
  track: Track | null;
  auddResponseMonotonicMs: number | null;
  lrclib: LrclibLyricsRecord | null;
}
~~~

It returns the exact SyncDiagnosticSample schema with groundTruth: null. It derives line count by parsing/rendering-ready LRC lines in memory and calls the digest only when syncedLyrics is non-empty. It must not accept a File, URI, token, HTTP response, or arbitrary object parameter.

Use an injected factory for tests. Production IDs use an Expo-compatible UUID source after its local declaration is confirmed; the ID is an identifier only and has no timing meaning.

- [ ] **Step 4: Implement the versioned File adapter**

diagnosticStore.ts is the only diagnostic module that imports expo-file-system. Its production factory creates one file below Paths.document named musicage-sync-diagnostics-v1.json through the modern File API. Before coding it, inspect the installed SDK declarations and use the documented File create, exists, text, write, and delete operations; do not import the legacy API.

Implement:

1. read absent file -> an empty in-memory schema-version-1 snapshot;
2. parse persisted JSON through a schema validator that rejects extra malformed shapes and returns a safe read error instead of throwing;
3. append only a structurally valid, sanitized SyncDiagnosticSample; calibration eligibility is deliberately not required because no-match and missing-timecode trials are useful invalid evidence;
4. persist an explicit approved/rejected/undecided decision and only the selected calibration;
5. refuse append/save when the existing file is corrupt, preserving it until the owner chooses clear;
6. clear through one explicit file delete or replacement with a new empty snapshot, then report success;
7. never log file contents, read errors, lyric hashes, or provider identifiers to the console.

The store must never perform fetch, SecureStore access, analytics, or background writes.

- [ ] **Step 5: Run storage/privacy verification**

Run:

~~~powershell
npm test -- --runInBand src/recognition/syncDiagnostics/__tests__/createDiagnosticSample.test.ts src/recognition/syncDiagnostics/__tests__/diagnosticStore.test.ts src/recognition/syncDiagnostics/__tests__/evaluateCalibration.test.ts
npm run typecheck
rg -n "audioUri|\.uri|api_token|token|syncedLyrics[^H]|plainLyrics|rawProvider|fetch\(" src/recognition/syncDiagnostics
~~~

Expected: all tests/typecheck PASS. The final search may find deliberately named test fixtures and runtime-only input type names, but no persisted SyncDiagnosticSample field, JSON write value, or log may contain an audio URI, token, lyric body, raw provider response, or fetch call.

- [ ] **Step 6: Commit local-only persistence**

~~~powershell
git add package.json package-lock.json src/recognition/syncDiagnostics/lyricsFingerprint.ts src/recognition/syncDiagnostics/createDiagnosticSample.ts src/recognition/syncDiagnostics/diagnosticStore.ts src/recognition/syncDiagnostics/__tests__/createDiagnosticSample.test.ts src/recognition/syncDiagnostics/__tests__/diagnosticStore.test.ts
git commit -m "feat: persist safe local AudD diagnostic trials"
~~~

## Task 4: Make lyric timing explicitly unverified until calibration

**Files:**
- Create: src/recognition/lyricTiming.ts
- Create: src/recognition/__tests__/lyricTiming.test.ts
- Modify: src/recognition/types.ts
- Modify: src/recognition/resolveLyrics.ts
- Modify: src/recognition/__tests__/resolveLyrics.test.ts
- Modify: src/components/LyricTypography.tsx
- Modify: src/components/__tests__/LyricTypography.test.tsx

**Interfaces:**

~~~ts
export type LyricTimingStatus =
  | { kind: 'unverified' }
  | {
      kind: 'calibrated';
      localAnchorMonotonicMs: number;
      auddTimecodeMs: number;
    };

export function resolveLyricTiming(
  result: TimestampedLyricResult,
  calibration: AudDCalibration | null,
): LyricTimingStatus;

export function currentCalibratedSongPositionMs(
  timing: Extract<LyricTimingStatus, { kind: 'calibrated' }>,
  nowMonotonicMs: number,
): number;
~~~

TimestampedLyricResult carries content and non-secret evidence. Task 2 may have already introduced this non-visual contract solely to eliminate the former midpoint plumbing; Task 4 must reuse it rather than create a parallel result shape:

~~~ts
{
  kind: 'timestamped';
  track: Track;
  lines: LyricLine[];
  timingEvidence: {
    clipDurationMs: ClipDurationMs;
    captureStartedMonotonicMs: number;
    auddTimecodeMs: number | null;
  };
}
~~~

- [ ] **Step 1: Write timing and typography tests first**

Add pure timing cases:

~~~ts
it('returns unverified when no calibration, no timecode, or mismatched capture duration exists', () => {
  expect(resolveLyricTiming(timestampedResult, null)).toEqual({ kind: 'unverified' });
  expect(resolveLyricTiming(timestampedResult, calibrationFor7Seconds)).toEqual({ kind: 'unverified' });
});

it('uses only the approved capture-start plus measured offset anchor equation', () => {
  const timing = resolveLyricTiming(resultCapturedAt(10_000, 12_000, 83_000), {
    schemaVersion: 1,
    clipDurationMs: 12_000,
    anchorOffsetMs: 4_050,
    acceptedSampleCount: 9,
  });

  expect(timing).toEqual({
    kind: 'calibrated',
    localAnchorMonotonicMs: 14_050,
    auddTimecodeMs: 83_000,
  });
  expect(currentCalibratedSongPositionMs(timing, 16_550)).toBe(85_500);
});
~~~

Task 2 may already have installed the static unverified branch as a compatibility demotion. Retain and strengthen it here, then add the calibrated branch. Assert all four visible truths:

~~~ts
it('shows real LRC as a static excerpt while timing is unverified', async () => {
  const screen = await render(
    <LyricTypography lyricResult={timestampedResult} calibration={null} visual={ambient} reducedMotion />,
  );

  expect(screen.getByText('歌詞')).toBeTruthy();
  expect(screen.getByText('first real line')).toBeTruthy();
  expect(screen.getByText('second real line')).toBeTruthy();
  expect(screen.queryByText('同期歌詞')).toBeNull();
  expect(screen.queryByRole('button', { name: /[+-]1秒/ })).toBeNull();
});
~~~

Use fake timers to prove the unverified branch does not select a new active line as time passes. Add a calibrated test that advances an injected performance.now() and checks active line changes from the exact formula. Add a regression that clearing the calibration prop immediately returns the same timestamped result to static 歌詞.

- [ ] **Step 2: Run the affected tests and observe the old behavior fail**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/lyricTiming.test.ts src/recognition/__tests__/resolveLyrics.test.ts src/components/__tests__/LyricTypography.test.tsx
~~~

Expected: FAIL because the code still calls midpoint-derived fields and labels timestamped LRC as synchronized.

- [ ] **Step 3: Implement a single timing resolver**

resolveLyrics must keep valid parsed LRC as kind: 'timestamped' even if AudD returned no timecode. This preserves actual lyric content but cannot synchronize it. It supplies capture duration, start time, and nullable timecode in timingEvidence.

resolveLyricTiming returns calibrated only if all of these are true:

1. the current calibration exists;
2. calibration.clipDurationMs equals timingEvidence.clipDurationMs;
3. timingEvidence.auddTimecodeMs is finite and non-negative;
4. capture start and calibration offset are finite.

The local anchor is captureStartedMonotonicMs + calibration.anchorOffsetMs. The only position formula is:

~~~ts
return timing.auddTimecodeMs + (nowMonotonicMs - timing.localAnchorMonotonicMs);
~~~

Do not read a midpoint field, response receipt time, recorder duration polling, or an accumulated interval counter.

In LyricTypography, retain the 250 ms interval only in the calibrated branch as a React rerender trigger. It must call performance.now() to recompute the formula, never add 250 to state. In unverified mode, select the first non-empty LRC line plus up to two following non-empty lines, label it 歌詞, and do not run an active-line clock. Existing plain, instrumental, unavailable, no-match, and idle copy remains truthful.

- [ ] **Step 4: Run typography/regression checks**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/lyricTiming.test.ts src/recognition/__tests__/resolveLyrics.test.ts src/components/__tests__/LyricTypography.test.tsx src/app/MusicageApp.test.tsx
npm run typecheck
rg -n "timecodeAnchorMonotonicMs|songPositionAtAnchorMs|manual.*[+-]|setCurrent.*\+" src
~~~

Expected: PASS. The search finds no old midpoint timing fields and no timing nudge controls.

- [ ] **Step 5: Commit the truthful timing state**

~~~powershell
git add src/recognition/types.ts src/recognition/lyricTiming.ts src/recognition/resolveLyrics.ts src/recognition/__tests__/lyricTiming.test.ts src/recognition/__tests__/resolveLyrics.test.ts src/components/LyricTypography.tsx src/components/__tests__/LyricTypography.test.tsx
git commit -m "feat: keep lyrics static until AudD calibration"
~~~

## Task 5: Refactor recognition into normal and diagnostic trial flows

**Files:**
- Modify: src/recognition/useSongRecognition.ts
- Modify: src/recognition/types.ts
- Modify: src/recognition/__tests__/useSongRecognition.test.tsx
- Modify: src/recognition/__tests__/captureRecognitionClip.test.ts only if the hook test seam needs it

**Interfaces:**

~~~ts
export interface RecognitionRequest {
  mode: 'normal' | 'diagnostic';
  clipDurationMs: ClipDurationMs;
  onCaptureStarted?: (startedMonotonicMs: number) => void;
}

export interface PendingDiagnosticTrial {
  sample: SyncDiagnosticSample;
  invalidReasons: readonly DiagnosticInvalidReason[];
}
~~~

The hook may hold full LRCLIB text only in a local runtime variable while it calls createDiagnosticSample. It immediately exposes PendingDiagnosticTrial instead: a safe sample with groundTruth: null plus calculated invalid reasons. No component receives a File, URI, token, lyric body, or raw provider response.

- [ ] **Step 1: Write orchestration tests that describe the new lifecycle**

Extend useSongRecognition tests:

~~~ts
it('captures a diagnostic duration, flashes at the recorded start, resumes visual metering before network work, and emits a safe pending sample', async () => {
  await result.current.recognize({
    mode: 'diagnostic',
    clipDurationMs: 5_000,
    onCaptureStarted,
  });

  expect(onCaptureStarted).toHaveBeenCalledWith(10_000);
  expect(resumeAfterRecognition.mock.invocationCallOrder[0])
    .toBeLessThan(recognizeAudD.mock.invocationCallOrder[0]);
  expect(result.current.pendingDiagnosticTrial).toMatchObject({
    sample: {
      capture: { requestedDurationMs: 5_000, startedMonotonicMs: 10_000, endedMonotonicMs: 15_020 },
      audd: { responseMonotonicMs: 15_800 },
      groundTruth: null,
    },
  });
  expect(JSON.stringify(result.current.pendingDiagnosticTrial)).not.toContain('file:///');
});

it('uses one normal owner tap, does not create a trial, and never starts another automatic AudD request', async () => {
  // Call normal recognize twice while first is in flight and assert one capture/provider call.
});

it('retains no pending diagnostic sample after capture interruption but still resumes meter and removes temporary audio', async () => {
  // Assert pendingDiagnosticTrial is null and no provider runs.
});
~~~

Assert that the hook calls createDiagnosticSample with the local runtime provider values and publishes only the sample it returns. The published object must not contain a full Track response, File, token, request body, raw response, syncedLyrics, or plainLyrics.

- [ ] **Step 2: Run the tests and confirm incompatibility with current hook contract**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/useSongRecognition.test.tsx
~~~

Expected: FAIL because recognize has no request, current code has midpoint assumptions, and no diagnostic evidence output.

- [ ] **Step 3: Implement one shared deliberate recognition pipeline**

Refactor recognize to require RecognitionRequest. Keep the public convenience retry only by storing the last explicit request; retry must never synthesize a diagnostic request or start automatically.

For every request:

1. read the SecureStore token only at owner action time;
2. pause meter, capture selected duration with the request flash callback, and resume meter in the capture finally block;
3. call AudD once, record performance.now() immediately after its Promise resolves, and call LRCLIB once only when a track exists;
4. resolve the visual LyricResult with the actual capture bounds and nullable parsed timecode;
5. delete the temporary audio URI in the outer finally block.

For mode diagnostic only, call createDiagnosticSample immediately after both provider steps while the full LRCLIB text still exists only in hook-local runtime scope. Publish the returned safe sample as pendingDiagnosticTrial with groundTruth: null and invalid reasons from validateDiagnosticSample. A no-match or missing lyric result may still produce this safe pending sample so the owner can save it as invalid evidence. A failed/interrupted capture produces no pending sample.

Do not calculate a current song position in this hook. Do not perform periodic AudD re-recognition. Do not call an API from a useEffect, timer, background callback, or diagnostics summary refresh.

- [ ] **Step 4: Run lifecycle, cleanup, and type regressions**

Run:

~~~powershell
npm test -- --runInBand src/recognition/__tests__/useSongRecognition.test.tsx src/recognition/__tests__/captureRecognitionClip.test.ts src/audio/__tests__
npm run typecheck
~~~

Expected: PASS. Success, no-match, provider failure, cancellation, background/unmount, and interrupted capture paths all preserve meter cleanup and delete the temporary recording.

- [ ] **Step 5: Commit the shared recognition flow**

~~~powershell
git add src/recognition/useSongRecognition.ts src/recognition/types.ts src/recognition/__tests__/useSongRecognition.test.tsx src/recognition/__tests__/captureRecognitionClip.test.ts
git commit -m "feat: run explicit AudD synchronization trials"
~~~

## Task 6: Add the local diagnostics controller and explicit owner decision

**Files:**
- Create: src/recognition/syncDiagnostics/useSyncDiagnostics.ts
- Create: src/recognition/syncDiagnostics/__tests__/useSyncDiagnostics.test.tsx
- Modify: src/recognition/syncDiagnostics/diagnosticStore.ts
- Modify: src/recognition/syncDiagnostics/__tests__/diagnosticStore.test.ts

**Interfaces:**

~~~ts
export interface SyncDiagnosticsController {
  ready: boolean;
  storageError: string | null;
  samples: readonly SyncDiagnosticSample[];
  evaluations: readonly DurationEvaluation[];
  approvedCalibration: AudDCalibration | null;
  decision: SyncDiagnosticDecision;
  captureFlashVisible: boolean;
  notifyCaptureStarted(startedMonotonicMs: number): void;
  saveTrial(sample: SyncDiagnosticSample, groundTruth: GroundTruth | null): Promise<void>;
  approveRecommendedCalibration(): Promise<void>;
  rejectAudDAsClock(): Promise<void>;
  clearDiagnostics(): Promise<void>;
}
~~~

- [ ] **Step 1: Write controller tests before implementation**

Use a fake store and fake setTimeout/clearTimeout. Add:

~~~ts
it('loads local samples, evaluates all durations, and exposes no calibration until the owner approves a passing recommendation', async () => {
  // Store has 9 valid 5-second samples. Expect a recommended summary but approvedCalibration null.
});

it('saves a safe pending sample with video ground truth, recomputes summaries, and resets an old approval to unverified evidence', async () => {
  // Adding measurements invalidates prior approval until the owner explicitly approves again.
});

it('saves a manual estimate as exploratory but excludes it from accepted counts', async () => {
  // verify validateDiagnosticSample reports ground_truth_not_video_timed.
});

it('creates a short visual flash without using the timeout as a clock', () => {
  controller.notifyCaptureStarted(55_000);
  expect(result.current.captureFlashVisible).toBe(true);
  jest.advanceTimersByTime(250);
  expect(result.current.captureFlashVisible).toBe(false);
});

it('persists an explicit rejection only when every duration is eligible and failed, and clear returns to undecided', async () => {
  // rejectAudDAsClock must reject a premature request rather than storing a false conclusion.
});
~~~

- [ ] **Step 2: Run the controller test to verify it fails**

Run:

~~~powershell
npm test -- --runInBand src/recognition/syncDiagnostics/__tests__/useSyncDiagnostics.test.tsx
~~~

Expected: FAIL because no controller connects evaluation, persistence, and owner decisions.

- [ ] **Step 3: Implement strict decision handling**

On initial load, derive summaries from the stored safe snapshot. A pass is only a recommendation, never an automatic calibration. approveRecommendedCalibration must select the shortest current passing duration, persist exactly one calibration in calibrations, and set decision to approved. It must safely fail if no current recommendation exists.

rejectAudDAsClock is enabled only if every duration is eligible and failed. It persists no calibration and decision rejected. Any newly saved trial resets decision to undecided and clears an existing approved calibration, so changed evidence cannot silently keep an old lyric clock.

saveTrial must:

1. accept only the safe pending sample from the recognition hook;
2. attach the optional GroundTruth;
3. append structurally safe records through the local store even when calibration-invalid;
4. reload/re-evaluate from the returned snapshot;
5. surface only a concise local save/read error.

notifyCaptureStarted makes the flash visible, clears the old flash timer, and schedules only a 250 ms visual reset. It stores no wall-clock value and returns no timing result.

- [ ] **Step 4: Run diagnostics-only regression suite**

Run:

~~~powershell
npm test -- --runInBand src/recognition/syncDiagnostics/__tests__
npm run typecheck
~~~

Expected: PASS. Tests prove calibration requires an explicit owner approval and rejected/cleared states expose approvedCalibration as null.

- [ ] **Step 5: Commit the controller**

~~~powershell
git add src/recognition/syncDiagnostics/useSyncDiagnostics.ts src/recognition/syncDiagnostics/__tests__/useSyncDiagnostics.test.tsx src/recognition/syncDiagnostics/diagnosticStore.ts src/recognition/syncDiagnostics/__tests__/diagnosticStore.test.ts
git commit -m "feat: require explicit AudD sync calibration decision"
~~~

## Task 7: Build the owner-only diagnostics sheet and app composition

**Files:**
- Create: src/components/SyncDiagnosticsSheet.tsx
- Create: src/components/__tests__/SyncDiagnosticsSheet.test.tsx
- Modify: src/components/AudDTokenSheet.tsx
- Modify: src/components/__tests__/AudDTokenSheet.test.tsx
- Modify: src/app/MusicageApp.tsx
- Modify: src/app/MusicageApp.test.tsx
- Modify: src/components/RecognitionControls.tsx
- Modify: src/components/__tests__/RecognitionControls.test.tsx

**UI flow:**

1. Settings contains a secondary owner-only action named 同期診断.
2. Opening it closes the token sheet first, so Modals never stack.
3. The sheet describes the shared-cue video protocol, then lets the owner choose 3 / 5 / 7 / 12 秒 and tap 診断用に読み取る.
4. The capture callback causes a high-contrast full-screen flash overlay for 250 ms.
5. After the explicit trial completes, the sheet shows safe outcome metadata only: title/artist when recognized, AudD raw timecode when present, requested duration, and an invalid-reason label when applicable.
6. The owner enters MM:SS.mmm ground truth, precision in milliseconds, and selects 動画で確認済み or 手動メモ（合否外） before 保存.
7. Per-duration summary lists valid/required count, track/position coverage, median offset, p90 absolute residual, max absolute residual, and 不足 / 不合格 / 合格.
8. A passing recommendation exposes この条件で同期を有効化. All-four-failed data exposes AudDを同期時計に使わない. Both are explicit owner actions.
9. Clear local diagnostics displays a confirmation that only iPhone-local measurements/calibration are removed, then calls clearDiagnostics.

- [ ] **Step 1: Write the UI tests before creating the sheet**

Write focused sheet tests with a mock SyncDiagnosticsController:

~~~ts
it('starts only the selected explicit diagnostic capture and shows a flash from the callback', async () => {
  fireEvent.press(screen.getByRole('button', { name: '5秒' }));
  fireEvent.press(screen.getByRole('button', { name: '診断用に読み取る' }));
  expect(onRunTrial).toHaveBeenCalledWith(expect.objectContaining({
    mode: 'diagnostic',
    clipDurationMs: 5_000,
  }));
});

it('saves a video-timed observation and labels a manual entry as excluded from acceptance', async () => {
  fireEvent.changeText(screen.getByLabelText('再生位置'), '01:23.450');
  fireEvent.changeText(screen.getByLabelText('観測精度（ms）'), '80');
  fireEvent.press(screen.getByRole('button', { name: '動画で確認済み' }));
  fireEvent.press(screen.getByRole('button', { name: 'この測定を保存' }));
  expect(saveTrial).toHaveBeenCalledWith(pendingSample, {
    method: 'video-timed-controlled-playback',
    songPositionAtCaptureStartMs: 83_450,
    observedPrecisionMs: 80,
  });
});

it('never renders lyric text, token text, audio URI, or a raw provider response in diagnostics', () => {
  expect(screen.queryByText('full lyric line')).toBeNull();
  expect(screen.queryByText('owner-private-token')).toBeNull();
  expect(screen.queryByText('file:///cache/recognition.m4a')).toBeNull();
});
~~~

Add app tests asserting:

- normal 曲を読み取る uses diagnostics.approvedCalibration.clipDurationMs when present and 12,000 otherwise;
- normal output passes the current approved calibration into LyricTypography;
- clearing diagnostics immediately makes the last timestamped lyric static;
- no component invokes recognition without a button press;
- settings entry remains available without rendering a stored token.

- [ ] **Step 2: Run the UI tests to prove they fail**

Run:

~~~powershell
npm test -- --runInBand src/components/__tests__/SyncDiagnosticsSheet.test.tsx src/components/__tests__/AudDTokenSheet.test.tsx src/components/__tests__/RecognitionControls.test.tsx src/app/MusicageApp.test.tsx
~~~

Expected: FAIL because the sheet, new props, and composition path do not exist.

- [ ] **Step 3: Implement the sheet and modal routing**

Make SyncDiagnosticsSheet controlled through props; it must not import SecureStore, fetch, expo-file-system, or either provider client. Parse MM:SS.mmm strictly: minutes are non-negative integers, seconds are 00-59, milliseconds are optional 1-3 digits right-padded to three, and the final value is finite non-negative milliseconds. Reject invalid input locally with concise Japanese copy.

The flash is a fixed overlay with testID diagnostic-capture-flash and no use of its duration in any model calculation. Ensure it is accessible only as a visual cue, not a playback/control feature.

In MusicageApp:

~~~tsx
const diagnostics = useSyncDiagnostics();
const normalDuration = diagnostics.approvedCalibration?.clipDurationMs ?? 12_000;

const readNormally = () => recognition.recognize({
  mode: 'normal',
  clipDurationMs: normalDuration,
});

const runDiagnosticTrial = (request: RecognitionRequest) => recognition.recognize(request);

<LyricTypography
  lyricResult={recognition.state.result}
  calibration={diagnostics.approvedCalibration}
  visual={visual}
  reducedMotion={reducedMotion}
/>
~~~

When a diagnostic trial ends, pass only recognition.pendingDiagnosticTrial?.sample to the sheet. Saving calls diagnostics.saveTrial. Do not save automatically. On an approved/rejected/clear state change, the derived typography timing status must change without revising lyric text.

Keep RecognitionControls visually compact and no-playback. Its normal read button continues to be disabled during capture/identification/lyrics resolution. It must not expose diagnostic controls outside settings.

- [ ] **Step 4: Run full UI and app regression**

Run:

~~~powershell
npm test -- --runInBand src/components/__tests__/SyncDiagnosticsSheet.test.tsx src/components/__tests__ src/app/MusicageApp.test.tsx src/scenes/__tests__
npm run typecheck
~~~

Expected: PASS. The five visual worlds and existing reactive meter remain unaffected.

- [ ] **Step 5: Commit the user-facing diagnostics workflow**

~~~powershell
git add src/components/SyncDiagnosticsSheet.tsx src/components/__tests__/SyncDiagnosticsSheet.test.tsx src/components/AudDTokenSheet.tsx src/components/__tests__/AudDTokenSheet.test.tsx src/components/RecognitionControls.tsx src/components/__tests__/RecognitionControls.test.tsx src/app/MusicageApp.tsx src/app/MusicageApp.test.tsx
git commit -m "feat: add local AudD sync diagnostics"
~~~

## Task 8: Document the controlled experiment and verify the implementation

**Files:**
- Modify: README.md
- Modify: docs/superpowers/specs/2026-09-06-musicage-audd-sync-diagnostics-design.md only if a tested interface clarification is required (for example, the manual-estimate diagnostic arm); do not change product direction.

- [ ] **Step 1: Update the owner runbook**

Add a concise Japanese section that says:

1. Before calibration, real timestamped lyrics intentionally stay static under 歌詞. This is not a bug and must not be presented as 同期歌詞.
2. The 36-sample protocol is 3 tracks x 3 stable positions x 4 durations, using the same speaker and iPhone placement for a test set.
3. A camera/high-frame-rate video must show both the player elapsed time and the app capture flash. The entered value is the player time at the flash; precision reflects how accurately the recording can be read.
4. Manual estimates are saved only as excluded exploratory notes.
5. Interpret a constant residual as an anchor/capture-path issue and a residual that changes through a song as likely LRCLIB recording-version mismatch.
6. Only the shortest passing duration can be explicitly enabled. If all four eligible durations fail, leave lyrics static and start the separate ShazamKit Development Build design; do not add a correction coefficient.
7. The local JSON contains safe identifiers/derived times only and can be cleared from settings. It never contains audio, the AudD key, lyric text, or raw API responses.

Document the normal read duration rule and that diagnostics never perform background/periodic AudD calls.

- [ ] **Step 2: Run automated verification**

Run:

~~~powershell
npm test -- --runInBand
npm run typecheck
npx expo-doctor@latest
git diff --check
rg -n "timecodeAnchorMonotonicMs|captureStartedMonotonicMs \+ captureEndedMonotonicMs|manual.*[+-]1秒|setInterval.*current.*time" src
git status --short
~~~

Expected: all tests, typecheck, Expo Doctor, and diff check pass. The searches must find no old midpoint/default manual-sync implementation. Status must not show a credential, raw audio clip, raw response, or generated build artifact. Preserve expo-go-qr.png as unrelated unless the user explicitly asks to remove it.

- [ ] **Step 3: Build and inspect the Expo Go bundle**

On the Windows machine, start the existing compatible project:

~~~powershell
npx expo start --lan --clear
~~~

Expected: Metro prints an Expo Go SDK 57 QR URL and an iOS bundle succeeds when the owner opens it. Do not claim physical recognition/calibration passed until the owner performs the controlled protocol.

In Expo Go, verify:

1. normal visualizer/mic meter still reacts to room sound;
2. Settings > 同期診断 opens without asking for a new native build;
3. each duration runs only on one owner tap;
4. the flash is visible in a phone/camera recording;
5. a no-match/missing-timecode run is marked invalid and cannot contribute to a calibration;
6. a video-timed successful run can be saved locally and appears only as safe metadata;
7. a cleared/undecided state leaves timestamped lyrics static;
8. an explicit approved calibration changes the label to 同期歌詞 only for matching-duration new recognition.

- [ ] **Step 4: Commit documentation and verification-safe changes**

~~~powershell
git add README.md docs/superpowers/specs/2026-09-06-musicage-audd-sync-diagnostics-design.md
git commit -m "docs: explain AudD sync diagnostic protocol"
~~~

Skip this commit if neither file changed. Do not force a documentation/spec edit merely to create a commit.

## Plan self-review

| Approved requirement | Plan task(s) |
| --- | --- |
| Remove midpoint and do not pretend AudD Standard has capture-relative offsets | 2, 4, 5, 8 |
| Show real timestamped lyrics statically before a validated calibration | 4, 7, 8 |
| Four controlled clip durations and video-timed ground truth | 1, 2, 6, 7, 8 |
| 3 tracks, 3 positions, 9 valid samples, robust median, p90, 90 percent, and hard-limit rule | 1, 6, 7 |
| Shortest passing duration and explicit approve/reject decision | 1, 6, 7 |
| performance.now() anchor equation, timer only as UI trigger | 4, 5, 6 |
| No raw audio/token/full lyrics/raw payload or server/analytics/export | 3, 5, 7, 8 |
| Safe local clear and immediate fallback to unverified | 3, 4, 6, 7 |
| Preserve direct deliberate AudD/LRCLIB topology and meter cleanup | 2, 5, 7 |
| Expo Go SDK 57 and no ShazamKit implementation in this scope | 3, 7, 8 |
| Automated tests plus owner-run physical validation protocol | every task, especially 1, 4, 6, 7, 8 |

The plan contains concrete paths, contracts, red-green test loops, verification commands, and selective commit boundaries. It deliberately makes no claim that a passing AudD calibration will occur; the controlled measurements determine that outcome.
