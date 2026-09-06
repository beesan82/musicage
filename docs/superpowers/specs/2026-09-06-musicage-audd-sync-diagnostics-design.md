# MUSICAGE AudD Sync Diagnostics Design

## Status

Approved direction in chat on 2026-09-06. This specification supersedes the AudD capture-start and capture-midpoint lyric-clock assumptions in `2026-09-05-musicage-personal-direct-lyrics-design.md`. It is intentionally limited to deciding whether AudD Standard can be used as MUSICAGE's lyric clock.

## Product decision

MUSICAGE must not present a guessed lyric clock as `同期歌詞`.

AudD Standard provides a recognized track and a `timecode` in the reference song, but it does not provide the position inside MUSICAGE's submitted recording clip to which that timecode corresponds. A 12-second clip therefore contains an unobserved anchor offset. The existing midpoint calculation, `(captureStart + captureEnd) / 2`, is a guess and is removed.

Before an experimentally validated calibration exists, timestamped lyrics are shown as real but static lyric excerpts. The UI must not advance them with an unverified clock or expose manual `+/-` timing controls.

## Scope

This work introduces a local, opt-in synchronization diagnostic mode for the existing direct AudD + LRCLIB Expo Go app.

It will:

- remove the midpoint anchor from normal lyric presentation;
- preserve recognized, timestamped LRCLIB lyrics while displaying them statically until timing is verified;
- capture safe diagnostic records for controlled AudD trials with 3, 5, 7, or 12 second clips;
- let the owner enter a separately observed ground-truth song position at recording start for a trial;
- calculate and display AudD anchor-offset distributions, grouped by clip duration;
- make an explicit `continue with calibrated AudD` or `reject AudD as a lyric clock` decision from the recorded trials.

It will not:

- store raw audio, provider tokens, full lyric text, or raw provider responses;
- automatically call AudD in the background or repeatedly consume recognition credits;
- implement ShazamKit, native speech recognition, Android support, a backend, or an external relay;
- claim word-level karaoke synchronization.

## Constraints

- The current owner workflow remains Windows development plus iPhone testing in Expo Go SDK 57.
- Recognition remains deliberate: one owner tap creates one direct AudD request.
- No MUSICAGE-operated server, database, analytics system, or cloud log sink is introduced.
- Diagnostic records stay on the iPhone until the owner explicitly clears them. They are not automatically exported or uploaded.
- `performance.now()` remains the local monotonic clock. Timers may refresh the UI but must never accumulate song time.
- The final normal listening experience contains no manual timing nudge buttons.

## Why a diagnostic gate is necessary

The current formula has one missing input:

```text
song position now = AudD timecode + (local now - local time at matching point in clip)
```

AudD Standard supplies the first term but not `local time at matching point in clip`. The existing midpoint code substitutes an unobserved six-second value for a 12-second clip. A fixed bias, PLL, or Kalman filter cannot derive that missing absolute offset without measurements.

The diagnostic gate separates three independent errors:

```text
total lyric error = recognition-anchor error + lyric-version error + capture-path error + render latency
```

- A stable global offset suggests a usable AudD calibration.
- A variable offset across otherwise controlled trials rejects AudD Standard as a clock.
- A lyric offset that grows or changes shape through a song indicates an LRCLIB recording-version mismatch, not a local-clock defect.
- The 250 ms typography refresh cadence is a bounded presentation delay, not a multi-second clock source.

## Normal lyric behavior before calibration

### Timing states

The normalized lyric result gains a timing status independent of whether timestamped lyrics exist:

| Timing status | Required data | UI behavior |
| --- | --- | --- |
| `unverified` | real timestamped lines and recognized track | Show a calm `歌詞` label, track caption, and a static real lyric excerpt. Do not call it `同期歌詞` and do not choose an active line from a clock. |
| `calibrated` | real lines, AudD timecode, an approved calibration for the selected clip duration | Show `同期歌詞` and advance active lines from one monotonic anchor. |
| `plain` | real plain lyric text | Existing static plain-lyric presentation. |

### Static excerpt rule

For `unverified` timestamped lyrics, render the first nonempty lyric line as the primary text and up to two following nonempty lines as context. The content is real LRCLIB text; its ordering is not represented as the current playback position.

The app must reset to `unverified` when:

- the selected clip duration has no approved calibration;
- a new track is recognized;
- calibration data is cleared;
- a diagnostic decision rejects AudD as a clock.

## Diagnostic data model

All timestamps are monotonic milliseconds on the iPhone. No wall-clock time is used for math.

```ts
type ClipDurationMs = 3_000 | 5_000 | 7_000 | 12_000;

type GroundTruth = {
  songPositionAtCaptureStartMs: number;
  method: 'video-timed-controlled-playback';
  observedPrecisionMs: number;
};

type SyncDiagnosticSample = {
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
};
```

`timecodeRaw` is retained because a standard `MM:SS` result has an unknown rounding convention. The diagnostic evaluator must not silently treat `00:34` as an exact `34.000` second observation.

### Derived values

For a valid sample with a timecode and ground truth:

```ts
observedAnchorOffsetMs =
  audd.timecodeMs - groundTruth.songPositionAtCaptureStartMs;

residualMs =
  observedAnchorOffsetMs - medianOffsetForClipDurationMs;
```

The observed anchor offset deliberately includes real room, microphone, and recorder-path latency. That is desirable: calibration must model the physical setup in which MUSICAGE listens.

## Controlled trial protocol

Diagnostics are a test mode, not a normal listening flow.

1. On Windows, play a known recording through the same speaker arrangement used with MUSICAGE. The player must show elapsed song time and permit seeking.
2. Use a camera or high-frame-rate recording that captures both the player timecode and an iPhone diagnostic capture flash in one frame. The flash appears when the app records `capture.startedMonotonicMs`.
3. Choose a track position, wait for stable playback, start one diagnostic capture, and read the song position at the flash from the recording.
4. Enter that ground-truth position, the observed measurement precision, and save the sample locally.
5. Repeat with three different tracks, three positions per track, and all four clip durations: 3, 5, 7, and 12 seconds. This creates 36 valid samples.

Manual typing without a recorded shared cue can be retained as an exploratory sample but is excluded from an acceptance decision. A human tap alone cannot establish a ±0.5 second result.

## Decision rule

Each clip duration is evaluated separately. A duration is eligible only with at least nine valid, video-timed samples spanning at least three tracks and three song positions.

For an eligible duration:

1. Calculate the median `observedAnchorOffsetMs`.
2. Calculate the absolute residual for every sample from that median.
3. Treat each integer-second AudD timecode as having at least ±500 ms uncertainty unless experiments establish a more precise documented behavior.
4. For each sample, set `acceptableResidualMs` to `500 + groundTruth.observedPrecisionMs`. Accept the duration only when at least 90% of residuals are within that sample's `acceptableResidualMs`, and no residual exceeds `1_000 + groundTruth.observedPrecisionMs`.

The preferred duration is the shortest accepted duration, because a shorter submitted clip reduces the range of the unobserved capture-relative offset and typically uses fewer recognition resources.

If no duration passes, the app records the decision `rejected` and leaves timestamped lyrics static. It must not add another heuristic correction. ShazamKit becomes the next, separate architectural project.

If a duration passes, persist only its robust median offset and a calibration metadata record:

```ts
type AudDCalibration = {
  schemaVersion: 1;
  clipDurationMs: ClipDurationMs;
  anchorOffsetMs: number;
  acceptedSampleCount: number;
};
```

Then, and only then, the lyric clock is:

```text
local anchor = capture started monotonic time + calibration anchor offset
song position now = AudD timecode + (performance.now() - local anchor)
```

## Diagnostic UI and privacy

The existing settings sheet receives an owner-only `同期診断` entry. It has four clip-duration choices, a start button, a capture flash, an input for video-observed ground truth, and a local summary of valid samples and residuals.

The summary shows, for each duration, sample count, median offset, 90th-percentile absolute residual, largest absolute residual, and provisional status: `不足`, `不合格`, or `合格`.

The owner can clear all diagnostic samples and calibrations in one explicit action. The confirmation copy states that this deletes only local measurements, not provider-side data.

Diagnostic persistence contains identifiers and derived timing values only. It excludes:

- AudD token;
- audio URI, bytes, signatures, or waveform data;
- full lyric text;
- complete AudD and LRCLIB responses;
- personal identifiers, analytics identifiers, or location.

## Component boundaries

| Unit | Responsibility |
| --- | --- |
| `captureRecognitionClip` | Capture a selected bounded duration and return precise local start/end timestamps; never infer a match offset. |
| `auddClient` | Preserve safe raw/parsed timecode fields required for diagnostics while never exposing the token. |
| `lrclibClient` | Return the record ID and timing metadata needed for diagnosis without persisting lyric text in diagnostics. |
| `syncDiagnostics` domain module | Validate samples, calculate distributions, classify duration results, and create an approved calibration. Pure and unit-testable. |
| local diagnostic store | Read, append, and clear versioned local samples/calibrations. |
| lyric timing resolver | Chooses `unverified` static lyrics or a calibrated monotonic lyric clock. It never chooses a midpoint. |
| diagnostic settings UI | Runs owner-directed trials and displays only safe local diagnostic fields. |

## Error handling

- No AudD match, no timecode, missing synced lyrics, or missing ground truth: retain a diagnostic record only when it helps explain the failure, mark it invalid for calibration, and show a concise reason.
- Interrupted/backgrounded capture: delete the temporary audio file and do not create a valid sample.
- Local storage failure: show that the trial could not be saved; never fall back to logging secrets or raw responses.
- Fewer than nine eligible samples for a duration: status remains `不足`.
- A duration fails: preserve its samples for review, but do not use its median as a playback anchor.
- A calibration is cleared: immediately return all timestamped lyrics to static `unverified` presentation.

## Verification strategy

### Automated tests

- A recording reports actual start/end times but no inferred midpoint anchor.
- `unverified` timestamped lyrics render only static real excerpts and no `同期歌詞` label or timing buttons.
- Diagnostic samples reject invalid clip durations, absent timecodes, absent ground truth, impossible timestamps, and nonfinite values.
- The evaluator groups samples by clip duration, calculates hand-checked medians/residuals, and enforces the 90% / ±500 ms / ±1,000 ms decision rule.
- Diagnostic serialization excludes audio URIs, tokens, full lyric text, and raw provider payloads.
- Clearing diagnostics removes samples and calibration and returns typography to `unverified`.
- A valid calibration produces the exact monotonic anchor equation above; an unapproved duration cannot produce a synchronized result.

### Physical checks

- Run the 36-sample controlled protocol without changing speaker placement or iPhone placement within a test set.
- Confirm the capture flash and player timecode are readable in the shared recording before accepting a sample.
- Run the chosen calibration against a fresh track and inspect line starts at intro, verse, and chorus. Classify a constant residual as anchor-related and a changing residual as lyric-version-related.
- If AudD fails the decision rule, verify timestamped lyrics remain static and begin the separate ShazamKit design rather than adding a new correction factor.

## Deferred ShazamKit project

If AudD is rejected, a separate specification will define an iPhone Development Build with a local Expo Module that owns microphone input and emits both visual meter features and ShazamKit match anchors.

ShazamKit's `matchOffset` represents the reference-recording time that matches the start of the query, and `predictedCurrentMatchOffset` represents the query's current playback position. The native module must timestamp these at the audio-buffer boundary, not when JavaScript receives a callback. ShazamKit cannot run in Expo Go and requires App ID service configuration; Android credentials and token handling are expressly outside this iPhone-first project.

LRCLIB recording-version mismatch remains a separate risk even when ShazamKit supplies an accurate audio position.

## Source checkpoints

- AudD standard timecode fields: <https://audd.io/resources/reference/result-fields>
- AudD Enterprise capture offsets (not in this scope): <https://audd.io/resources/reference/enterprise-match-fields>
- ShazamKit match timecodes: <https://developer.apple.com/documentation/shazamkit/shmatchedmediaitem/matchoffset> and <https://developer.apple.com/documentation/shazamkit/shmatchedmediaitem/predictedcurrentmatchoffset>
- ShazamKit microphone streaming: <https://developer.apple.com/documentation/shazamkit/matching-audio-using-the-built-in-microphone>
- Expo custom native code and Development Builds: <https://docs.expo.dev/workflow/customizing/>
