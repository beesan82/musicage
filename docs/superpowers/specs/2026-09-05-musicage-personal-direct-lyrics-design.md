# MUSICAGE Personal Direct Lyrics Design

## Status

Approved direction in chat on 2026-09-05. SDK target revised from 54 to 57 on 2026-09-05 after the physical iPhone's App Store Expo Go reported that it supports SDK 57 only.

## Product intent

MUSICAGE is a portrait iPhone visual object placed beside a record player. It never plays music. It reacts locally to music audible in the room, using one of five visual worlds, and lets its owner explicitly identify a song and show real lyrics as typography.

The experience must be honest. A lyric-like placeholder must never be presented as a recognized lyric. If identification or lyric lookup fails, the app says so quietly and keeps the visual world alive.

## Scope and non-negotiable decisions

- Development is on Windows and testing is on an iPhone through the App Store version of Expo Go. The project targets Expo SDK 57, matching the physical device's installed Expo Go, so this works without USB re-signing, a Mac, or a paid Apple Developer membership during this phase.
- The app is iPhone-first and portrait-only. It is for the owner's personal use and is not distributed to other people or the App Store in this phase.
- MUSICAGE has no music playback, player controls, song history, accounts, analytics, or cloud storage.
- The existing five visual worlds remain: Ambient, Jazz, Pop, Dance, and Rock. They react to microphone loudness and motion; they do not claim to classify the actual genre.
- Music recognition is deliberate, never continuous: the owner taps `曲を読み取る`, and only then can a clip of at most 12 seconds leave the iPhone.
- There is no MUSICAGE-operated relay, Worker, hosting account, database, or backend. The iPhone calls the recognition and lyric services directly over HTTPS.
- The app uses AudD to identify a track and LRCLIB to look up lyrics. It does not use Musixmatch, Genius, LyricsGenius, or HTML scraping in this phase.

"No relay" does not mean offline recognition: an explicit recognition still needs internet access to reach AudD and, when needed, LRCLIB.

## Why this architecture

Three approaches were considered:

1. **Provider calls through a Worker:** best secret protection and suitable for release, but it adds a deployed service the owner does not want to run.
2. **Native ShazamKit:** removes a third-party recognition token, but requires a custom native iOS build and Apple Developer setup, making it a poor fit for the first Windows + Expo Go version.
3. **Direct, owner-entered provider token:** no relay or server operations, lowest cost, and works in Expo Go. The trade-off is that it is appropriate only for a private personal app.

The approved choice is option 3.

## Direct-service data flow

```text
iPhone / Expo Go (SDK 57)
  ├─ local microphone meter → AudioFeatures → style engine → five visual scenes
  └─ owner taps 「曲を読み取る」
        └─ separate 12-second temporary recording
              ├─ direct HTTPS multipart upload → AudD
              │     └─ title, artist, album, duration, optional timecode/lyrics
              └─ direct HTTPS request → LRCLIB /api/get
                    └─ synchronized LRC lyrics, plain lyrics, or no result
                         ↓
                  local lyric clock → typography over the current visual scene
```

No audio passes through a MUSICAGE server. Audio is sent only to AudD, directly from the iPhone, for an owner-triggered request. LRCLIB receives track metadata only, not the audio clip.

## Token and account boundary

The owner creates and controls their own AudD account. The owner enters the AudD API token in a MUSICAGE settings sheet on the same iPhone; they never paste it into source code, app configuration, Git, or chat.

- Store the token using `expo-secure-store`, which uses iOS Keychain-backed protected storage in this Expo Go phase.
- Do not put the token in `EXPO_PUBLIC_*`, `.env`, `app.json`, JavaScript constants, logs, screenshots, error messages, or test fixtures.
- The settings sheet provides an explicit **replace** and **remove token** action. Removing it disables only song recognition; the visualizer remains usable.
- The app serializes recognition requests so one tap cannot create parallel AudD calls. It displays the current request state and any provider error rather than automatically retrying.
- Secure storage reduces accidental exposure on the owner's phone; it is not equivalent to a server-side secret boundary. A direct provider token must never be used for a public or shared release. If distribution becomes a goal, this design must be revisited before release.

The direct integration must use the AudD token only at runtime after the owner has entered it. It is not bundled into the app.

## Microphone and recognition flow

### Local visual response

The visual MVP uses `expo-audio` recorder metering under Expo SDK 57. This keeps normal visualization local while avoiding raw-audio streaming and preserving compatibility with the App Store Expo Go path.

- A `MeterSession` owns one active low-impact recorder with metering enabled.
- Recorder-meter values are smoothed and converted into the existing platform-neutral `AudioFeatures` shape. Low/mid/high values are visual envelopes, not a factual spectrum analysis claim.
- The recorder writes only temporary local segments required by the platform. Segments are rotated at a bounded interval and deleted when stopped, interrupted, backgrounded, or unmounted.
- The meter session does not upload audio, does not add anything to the media library, and does not create a listening history.

### Explicit recognition

1. The owner taps `曲を読み取る` while a song is audible.
2. If an AudD token has not been configured, show the settings sheet and do not record or upload.
3. On first use, show a consent notice stating that up to 12 seconds of surrounding sound will be sent directly to AudD to identify the song.
4. Stop and clean up the normal meter session. Start a separate recognition recorder, with a hard maximum duration of 12 seconds.
5. Stop recording, send the resulting temporary file directly to AudD as multipart form data, and delete the file in a `finally` path regardless of success, cancellation, or failure.
6. Resume the meter session immediately after the capture is complete; the visual scene remains gently animated during network work.
7. If AudD identifies a track, resolve lyrics locally as described below. The next successful recognition replaces the current track and lyric display; no history is retained.

## Track and lyric resolution

### AudD recognition

The client calls AudD's standard recognition endpoint with the owner-entered token and asks for only the metadata needed by MUSICAGE: title, artist, album/duration when present, and `timecode`. It may request AudD's optional lyric metadata, but that data is treated as opportunistic: the app accepts it only when it is structurally usable and never promises it will exist.

### LRCLIB lyric lookup

When AudD does not yield usable timestamped or plain lyrics, the client calls LRCLIB's `/api/get` directly using normalized title, artist, album, and duration where available. It identifies itself politely through the documented `Lrclib-Client` header.

Priority is:

1. Valid timestamped lyrics returned by AudD, if available.
2. LRCLIB `syncedLyrics`, parsed as LRC lines.
3. Valid plain lyrics returned by AudD, if available.
4. LRCLIB `plainLyrics`.
5. An explicit `lyrics_unavailable` state.

This is a zero-cost lyric lookup, not a coverage or licensing guarantee. Some tracks will not have lyrics or synchronized timing in these sources. The app must never fill a gap with generated copy.

## Local response contract

Provider payloads remain inside focused client modules. Scene and typography code receives only the normalized result below.

| Result | Required data | UI behavior |
| --- | --- | --- |
| `synced` | title, artist, timestamped lyric lines, song position when known | Display the active line large, nearby lines softly, and advance with the lyric clock. |
| `plain` | title, artist, real plain lyric text | Show readable phrase groups with scene-driven transitions; never imply real-time synchronization. |
| `instrumental` | title, artist | Keep the scene and show a calm instrumental card. |
| `lyrics_unavailable` | title, artist | Display track metadata and `この曲の歌詞は見つかりませんでした`. |
| `not_recognized` | no track | Display `曲を特定できませんでした。音がはっきり聞こえる場所でもう一度。` |
| `setup_required` | no token | Explain that the owner must enter their own AudD token before recognition can start. |
| `network_error`, `service_error`, `rate_limited` | retryability and safe message | Keep the active scene and expose one explicit retry. |

## Lyric timing and typography

When timestamped lyrics are available, the app uses AudD's returned timecode plus a monotonic capture-start timestamp:

```text
current song position ≈ AudD timecode + elapsed time since recognition capture began
```

This is line-synchronous, not word-perfect karaoke. The physical microphone pickup, capture window, source timing, and network delay can cause a small offset. The interface may call the result `同期歌詞` only when timestamp data exists. A fresh `曲を読み取る` action is the initial resynchronization mechanism.

Typography follows the active visual world without changing lyric content:

- Ambient moves real lines through a landscape-like depth treatment.
- Jazz gives lines a restrained bandstand rhythm and warm hierarchy.
- Pop uses kinetic-poster entrances.
- Dance uses light architecture and ring-like motion.
- Rock uses dense signal, grain, and high-contrast impacts.

Before a real lyric result exists, foreground text is limited to setup, listening, recognition, error, or track-status messaging. It must not look like a lyric.

## Privacy and deletion guarantees

The existing microphone permission copy must be corrected because recognition introduces an owner-triggered external upload.

Required first-use notice:

> 「曲を読み取る」を押したときだけ、最大12秒の周囲の音をAudDへ直接送信して曲を識別します。MUSICAGEは送信後・失敗時・キャンセル時に端末内の一時ファイルを削除し、履歴として保存しません。AudDおよびLRCLIBでの処理には各サービスの利用条件が適用されます。

Within the app's control:

- Normal visual listening never uploads room audio.
- Recognition clips are not copied to Photos, Files, the media library, app documents, or a listening history.
- Temporary meter and recognition files are deleted on all normal, failure, cancellation, interruption, background, and unmount paths.
- Track metadata and lyrics are kept only in memory for the current screen state; they are not persisted to disk in this phase.
- No provider token, audio file, full lyric text, or raw provider response appears in application logs or diagnostics.

## Cost and operational boundary

- Expo Go testing, the direct client, LRCLIB lookup, and no relay/hosting have no required paid service in this phase.
- AudD currently provides the first 300 recognition requests free, then standard clip recognition is usage-priced at $5 per 1,000 requests. The app contains no payment workflow.
- An AudD account is the only external account required to test real song identification. No Musixmatch or Cloudflare account is needed.
- A paid Apple Developer membership and a Mac are not needed for the Expo Go phase. A future standalone or distributed iPhone app requires a separate release decision and Apple Developer setup.
- If the owner later requires commercially licensed, near-universal lyric coverage, that is a separate product/licensing decision. It is explicitly out of scope for this personal direct mode.

## Error and edge behavior

- **Microphone denied:** preserve an intentional idle scene and show a settings/retry action.
- **No AudD token:** do not capture audio; open the setup explanation.
- **Quiet/noisy room:** visual motion falls back gracefully; recognition can fail without breaking the visual object.
- **Recognition cancelled or interrupted:** delete the partial recording, resume metering, and retain any prior lyric result.
- **AudD has no match:** do not guess title, artist, or lyric text.
- **Track found but lyrics absent:** identify the track and show the explicit unavailable state.
- **Plain-only lyrics:** display them without a synchronization label.
- **Offline, timeout, provider limit, or malformed response:** retain the last valid visual/lyric state and provide one manual retry when reasonable.
- **App backgrounded:** stop recorder work, delete temporary files, and require a fresh listening session when returning.

## Verification strategy

### Unit tests

- Convert recorder-meter values into bounded, smoothed `AudioFeatures`.
- Ensure every temporary meter and recognition file is cleaned up for success, cancellation, network failure, interruption, and unmount.
- Verify that no request occurs without an explicit recognition action and configured token.
- Verify direct AudD request construction uses a runtime-only token and never reads an `EXPO_PUBLIC_*` secret.
- Normalize AudD and LRCLIB results into `synced`, `plain`, unavailable, no-match, and safe-error states.
- Parse timestamped lyric lines and derive the lyric clock from a deterministic monotonic clock.
- Confirm no fake lyric-like sample text appears in recognized, unavailable, or error states.

### Integration and iPhone checks

- Align all Expo dependencies to SDK 57, run Expo Doctor, and start from Windows with `npx expo start`.
- Scan the QR code with App Store Expo Go and verify the project opens without the SDK mismatch screen.
- Test microphone permission, portrait layout, all five visual worlds, and no-upload normal listening on the physical iPhone.
- With an owner-entered nonproduction AudD token, test one recognized track with timestamped lyrics, one plain-only result, and one lyrics-unavailable result.
- Confirm the only network destinations introduced by recognition are AudD and LRCLIB; no proxy base URL, Worker deployment, or server storage exists.
- Clear the token through settings, restart Expo Go, and confirm recognition remains disabled until the owner enters a token again.

## Acceptance criteria

- An iPhone opens the project in the App Store Expo Go without USB re-signing, Xcode, a Mac, or a paid Apple Developer membership.
- MUSICAGE stays portrait-only, visual-first, and playback-free.
- Room audio visibly affects all five scenes under SDK 57 recorder-meter limits.
- No room audio leaves the device unless the owner taps `曲を読み取る`; that upload is capped at 12 seconds and goes directly to AudD.
- An owner supplies their own AudD token locally; no token is bundled, committed, or logged.
- A supported recognized track can display real synchronized or plain lyrics. Missing data has a truthful state rather than invented text.
- LRCLIB requests are direct and polite; there is no Worker, server, backend, or hosted relay in the project.
- No local audio clip, history, lyric cache, or provider raw payload persists beyond the active screen state.

## Deferred work

- Automatic or background recognition.
- Public sharing, App Store release, TestFlight, or standalone iOS distribution.
- ShazamKit, native custom builds, or Mac/Xcode workflow.
- Commercial lyric licensing or guaranteed lyric coverage.
- Word-level karaoke timing, offset controls, history, favorites, caching, accounts, analytics, sharing, Android, and music playback.

## Source checkpoints

- Expo Go and SDK compatibility: <https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/>
- Expo SDK 57 recorder and metering: <https://docs.expo.dev/versions/v57.0.0/sdk/audio/>
- Expo SDK 57 secure local storage: <https://docs.expo.dev/versions/v57.0.0/sdk/securestore/>
- AudD pricing and standard recognition: <https://www.audd.io/> and <https://docs.audd.io/>
- LRCLIB API and identification header: <https://lrclib.net/docs>
