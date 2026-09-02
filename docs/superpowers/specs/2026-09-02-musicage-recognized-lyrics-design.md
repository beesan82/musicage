# MUSICAGE Recognized Lyrics Design

## Status

Approved direction in chat on 2026-09-02; written for user review before implementation.

## Product intent

MUSICAGE is a portrait iPhone visual object placed beside a record player. It never plays music. It listens to sound already present in the room, turns that sound into one of five reactive visual worlds, and—when the owner explicitly requests it—identifies the current song and displays its real lyrics as typography.

The lyric experience must be honest. The app never presents local sample copy as if it were a recognized lyric. If a song or lyric cannot be found, it says so calmly rather than inventing text.

## Decisions

- Target the App Store version of Expo Go by migrating the project from Expo SDK 57 to SDK 54. This removes the free-Apple-ID seven-day re-signing workflow.
- Keep the app iPhone-first and portrait-only. There is no Android or App Store release work in this phase.
- Keep the five existing visual personalities: Ambient, Jazz, Pop, Dance, and Rock. They remain driven by live microphone energy and motion, not by a claimed genre classification.
- Add an explicit `曲を読み取る` action. The app records at most 12 seconds only for that action; it does not continuously upload room audio.
- Use AudD for audio fingerprinting, then Musixmatch as the primary lyric source. Use LRCLIB only as a fallback.
- Do not use Genius/LyricsGenius in the product path. Its lyric retrieval is HTML scraping after metadata search, which is too fragile for this app and does not provide timing.
- Keep all provider secrets in a server-side proxy. No AudD or Musixmatch secret is bundled in the Expo app.

## User flow

1. The owner opens MUSICAGE in Expo Go, grants microphone access, and places the iPhone vertically beside a record player.
2. The app enters a listening state. Its scene and typography respond to microphone metering; there are no player controls or audio playback.
3. The owner taps `曲を読み取る` when a song is audibly playing.
4. A privacy notice is shown the first time. It explains that a clip of up to 12 seconds will leave the device solely to identify the song.
5. The app pauses the normal meter session, records the short recognition clip, then immediately sends it to the proxy. The local recognition file is deleted in a `finally` path whether the request succeeds, fails, or is cancelled.
6. The proxy identifies the track with AudD and requests matching lyrics from Musixmatch. It returns synchronized lines when available, otherwise real plain lyrics, otherwise an explicit no-lyrics state.
7. The app restarts the normal meter session and overlays the title, artist, and real lyric typography on the continuing visual world.
8. The user may tap `曲を読み取る` again to replace the current result. The app does not keep a listening history.

## System architecture

```text
iPhone / Expo Go (SDK 54)
  ├─ microphone meter → AudioFeatures → style engine → five visual scenes
  └─ explicit 12-second capture
          │ HTTPS multipart upload
          ▼
Cloudflare Worker (no persistent audio storage)
  ├─ AudD standard recognition → title, artist, album, duration, timecode
  ├─ Musixmatch matcher.subtitle.get → timestamped lyrics, when available
  ├─ Musixmatch matcher.lyrics.get → plain real lyrics, when needed
  └─ LRCLIB /api/get → synchronized or plain fallback
          │ normalized result only
          ▼
iPhone lyric clock → lyric typography → existing scene renderer
```

### Expo client

The current visual MVP uses raw stream features available in Expo SDK 57. SDK 54 does not expose that same stream API in Expo Go, so the client will use recorder metering for visual response instead.

- A `MeterSession` owns the active recorder used for visual loudness and transient estimates.
- Recorder metering is converted to the existing platform-neutral `AudioFeatures` shape. Low/mid/high values become controlled visual envelopes rather than claims of true frequency-band analysis.
- SDK 54 creates a temporary local recording while metering. The client rotates the session at a bounded interval (45 seconds), deletes every stopped segment, and deletes the final segment on stop, interruption, background cleanup, and unmount.
- A recognition request temporarily takes exclusive ownership of the microphone: stop and delete the meter session, record a separate maximum-12-second clip, upload it, delete it, then resume metering.
- The visual scene keeps a gentle frozen/smoothed state during the short handoff. The recognition capture's meter continues to drive a subtle motion treatment while recording.
- No recorder file is added to the media library, app documents, or a user-visible history.

### Proxy worker

The worker is a small, stateless API whose only job is to protect secrets and normalize third-party responses.

`POST /v1/recognize`

- Accept one multipart audio field from the client; no end-user account is introduced in this phase.
- Reject audio over 10 MB, missing content type, and concurrent duplicate requests before forwarding. Apply a conservative per-IP rate limit so the public endpoint cannot be used as an unrestricted provider-key proxy.
- Hold the file in request memory only; never write it to KV, R2, a database, or logs.
- Forward it to AudD with the server-side `AUDD_API_TOKEN`.
- Resolve lyrics in this order:
  1. Musixmatch `matcher.subtitle.get`, if a nonrestricted timestamped subtitle is available.
  2. Musixmatch `matcher.lyrics.get`, if full plain lyrics are available and allowed for the returned region.
  3. LRCLIB `/api/get` using normalized title, artist, album, and duration. Prefer its synchronized LRC field, then its plain field.
  4. A structured `lyrics_unavailable` result.
- Return only a normalized track object and lyric object. Do not return provider tokens, provider tracking URLs, raw provider payloads, or uploaded audio.
- Use an explicit client identifier and respectful sequential requests for LRCLIB.

The Expo app only knows `EXPO_PUBLIC_MUSICAGE_API_BASE_URL`. It never knows a provider secret. The Worker stores `AUDD_API_TOKEN` and `MUSIXMATCH_API_KEY` as deployment secrets.

### Normalized response contract

The client receives one of these results:

| Result | Required data | Client behavior |
| --- | --- | --- |
| `synced` | title, artist, duration when known, AudD timecode, timestamped lyric lines | Advance line typography against the lyric clock. |
| `plain` | title, artist, full plain lyric text | Show real lyric passages with scene-driven transitions; never call it synchronized. |
| `instrumental` | title, artist | Show a calm instrumental card and retain the scene. |
| `lyrics_unavailable` | title, artist | Show the identified track with `この曲の歌詞は見つかりませんでした`. |
| `not_recognized` | no track | Show `曲を特定できませんでした。音がはっきり聞こえる場所でもう一度。` |
| `network_error`, `rate_limited`, `service_error` | retryability and safe message | Keep the current visual scene and offer a single retry. |

The contract intentionally hides provider-specific shapes so Musixmatch, LRCLIB, or a future licensed source can change without changing scene or typography code.

## Lyric synchronization

AudD returns a timecode for the point in the recognized song corresponding to the uploaded clip. The app records the capture-start monotonic timestamp. After the result comes back, its lyric clock computes:

```text
current song position ≈ AudD timecode + elapsed time since capture start
```

Timestamped Musixmatch or LRCLIB lines are selected from that position. This is line-synchronous, not word-perfect karaoke: microphone pickup, the 12-second capture window, network delay, and source timing can introduce a small offset. The UI must call it `同期歌詞` only when source timestamps exist; a manual retry provides a simple resync mechanism.

## Typography and scene behavior

- Replace the current lyric-like sample text once a lyric result exists. Do not blend sample copy with real lyrics.
- While no real lyric is available, foreground text is limited to status, track metadata, or a quiet no-lyrics message. It is never phrased as a lyric.
- Synchronized lyrics show the current line prominently, one nearby next/previous line softly, and retain enough contrast for viewing from a short distance.
- Plain lyrics are broken into readable phrase groups and animated from actual line breaks; they do not imply real-time sync.
- The visual personality controls color, movement, grain, hierarchy, and entry/exit treatment. It does not alter, generate, translate, or censor lyric text.
- The existing lower-edge controls remain subdued: listen/stop, `曲を読み取る`, retry, and a small source/privacy affordance.

## Privacy and data handling

The microphone permission copy and in-app notice must be updated. The current statement that audio is never stored or sent is no longer correct.

Required first-use notice:

> 「曲を読み取る」を押したときだけ、最大12秒の周囲の音を曲の識別サービスへ送信します。MUSICAGEは端末内の一時ファイルを送信後または失敗時に削除し、履歴として保存しません。外部サービスでの処理には各サービスの利用条件が適用されます。

Additional guarantees within the app's control:

- No upload occurs during ordinary visual-only listening.
- The app does not persist clips, track history, or lyrics to disk.
- It does not add files to Photos, Files, or the media library.
- Provider secrets never appear in source, app configuration, client logs, or error messages.
- The Worker does not retain audio. Operational logs contain only coarse error codes and request timing; no title, lyric body, or audio data is logged.

## Cost and account boundaries

- Expo Go / the SDK 54 client can be tested on the App Store Expo Go without a paid Apple Developer membership.
- Cloudflare Workers has a free plan suitable for the small proxy in personal testing, subject to its current limits.
- AudD currently offers 300 recognition requests without a card, then usage-based pricing. The app includes no payment workflow.
- Musixmatch requires an API key. Its current documentation demonstrates lyrics and subtitles but does not expose a dependable public free-tier price; access and price must be verified in the developer account before it becomes a zero-cost guarantee.
- LRCLIB is used only as a no-key fallback and may not have every song or synchronized timing.

The owner must create and control any AudD, Musixmatch, and Cloudflare accounts. Creating accounts, entering credentials, deploying the Worker, or buying a plan is not authorized by this design and requires a separate explicit user action.

## Error and edge-state behavior

- **Microphone denied:** retain an intentional idle scene and show a settings/retry action.
- **Quiet or noisy room:** preserve the current visual personality at lower intensity; recognition may fail but the visual object continues to work.
- **Recognition cancelled:** delete the partial file, resume meter listening, and leave any existing lyric result unchanged.
- **No track match:** do not offer a guessed title or sample lyrics.
- **Track found, no lyrics:** show the track title/artist and a concise unavailable state.
- **Plain-only lyrics:** label them as lyrics without a sync claim.
- **Provider regional restriction or quota:** show a clear unavailable state with retry only if retryable.
- **Offline / timeout:** do not block the visualizer; retain the last valid lyric result until a later successful recognition replaces it.
- **Audio interruption / app background:** stop the recorder, delete its temporary file, and require/restore a fresh listening session on return.

## Verification strategy

### Unit tests

- Convert recorder-meter values into bounded, smoothed `AudioFeatures`.
- Rotate and clean up every temporary meter and recognition file, including cancellation and thrown-network-error paths.
- Parse AudD `mm:ss` timecodes and derive the lyric clock from a deterministic monotonic clock.
- Parse LRC-like timestamped lyrics, select current/nearby lines, and handle duplicate or empty timestamps.
- Normalize Musixmatch, LRCLIB, no-match, rate-limit, and provider-error payloads into the response contract.
- Confirm no fake sample lyric text appears in recognized, unavailable, or error states.

### Worker tests

- Reject oversize/malformed uploads before calling a provider.
- Verify the AudD and Musixmatch secrets are read only from worker bindings.
- Verify source priority, region/restriction handling, and LRCLIB fallback.
- Verify no raw audio, lyric body, or secrets enter diagnostic logs.

### Integration and physical-device checks

- Run dependency alignment and Expo Doctor after migration to SDK 54.
- Start from Windows with `npx expo start`, scan the QR code with the App Store version of Expo Go, and verify the portrait UI opens without the SDK mismatch screen.
- Test microphone permission, visual response, recognition cancellation, and automatic temporary-file cleanup on the actual iPhone.
- With owner-provided nonproduction provider keys, test one known track with synchronized lyrics, one with plain-only lyrics, and one unavailable result.

## Acceptance criteria

- An iPhone can open the project through the App Store Expo Go without USB re-signing, Xcode, or an Apple Developer membership.
- MUSICAGE remains a portrait-only visual object and never plays audio.
- Room audio visibly affects all five scenes under SDK 54's metering limits.
- Tapping `曲を読み取る` sends no more than 12 seconds of audio and deletes its local temporary file on every outcome.
- A recognized, supported track displays real lyrics; timestamped data advances line-by-line using the recognized song position.
- No provider key is shipped to the Expo client.
- A missing song, missing lyric, unavailable sync, denied permission, rate limit, or network issue produces a truthful and recoverable UI state.
- No fake lyric-like copy is displayed as a substitute for an unavailable real lyric.

## Deferred work

- Continuous / automatic background recognition.
- Native ShazamKit or custom iOS development builds.
- Word-level karaoke timing or manual offset controls.
- Song history, favorites, lyrics caching, accounts, analytics, sharing, or playback controls.
- App Store or commercial release, including final provider licensing and privacy review.
- Android support.
