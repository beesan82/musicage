# MUSICAGE Visual MVP Design

## Status

Approved design direction for the first zero-cost prototype. This document covers only the Windows + Expo Go validation phase; it does not authorize implementation of commercial lyrics acquisition or native iOS music recognition.

## Product intent

MUSICAGE is a portrait-oriented iPhone display app meant to sit beside a record player. It listens to music already playing in the room and turns the sound into a distinctive visual environment with prominent lyrical typography. It is not a music player.

The experience should feel more like a small visual object or a changing album-art world than a utility dashboard.

## Constraints

- Development takes place on Windows.
- The first prototype has zero required cost.
- The app is tested through Expo Go on the owner's iPhone.
- No Mac, Xcode, Apple Developer Program membership, TestFlight, or App Store delivery is required for this phase.
- The app does not play music.
- The app is portrait-only.
- The first prototype must remain usable when no song can be identified.

## Scope of the first prototype

### Included

- Request microphone permission through Expo Go.
- React to live room audio with animation that remains graceful at low volume and during silence.
- Extract a small, stable set of audio features available in the Expo-compatible implementation: current loudness, smoothed loudness, recent change amount, and approximate low/mid/high energy when available.
- Infer one of five visual personalities from those features, with gentle transitions rather than abrupt genre claims.
- Render large, stylized text that demonstrates the lyric layout and animation system.
- Include an obvious listening / microphone-off state and a way to recover after permission is denied.

### Explicitly deferred

- Identifying a playing song from its microphone audio.
- Fetching or displaying third-party copyrighted lyrics.
- Syncing lyrics to a track.
- Native iOS modules such as ShazamKit.
- Android support, cloud services, user accounts, analytics, and app-store distribution.

Actual lyrics remain a core product requirement for a later phase. The prototype uses clearly labeled local sample copy only to develop the typography and animation language; it must not present that copy as recognized song lyrics.

## Primary user flow

1. The owner places the phone vertically beside a record player and opens MUSICAGE in Expo Go.
2. The app asks for microphone access once and then enters a listening state.
3. A calm base scene appears immediately, even before meaningful sound arrives.
4. As music fills the room, the visual engine smooths the input and selects or blends a visual personality.
5. Large lines of local sample text move with the scene, demonstrating how real lyrics will eventually occupy the composition.
6. If the room goes quiet or access is unavailable, the scene softens into a deliberate idle state rather than showing an error-heavy interface.

## Visual personalities

The app calls these visual personalities, not music genres. The input is deliberately approximate, so it should evoke a mood instead of claiming to know the actual genre.

### 1. Ambient — forward landscape

- The viewer appears to travel slowly through a distant landscape.
- Layered horizons, mist, stars, distant lights, and soft gradients drift toward or past the viewer.
- Low, sustained energy expands the depth of the landscape; quiet passages slow its forward movement.
- Text appears spaciously, as if suspended within the weather rather than pinned to a HUD.

### 2. Jazz — performing band

- An abstract night-stage band plays behind and around the words.
- A bass form responds to low frequencies, percussion marks respond to transients, and piano / horn-like lines answer mids and highs.
- No literal copyrighted imagery or named musicians is required; the scene is made from expressive silhouettes, spotlights, and gestural marks.
- Text reads like a projected club sign or an intimate stage subtitle.

### 3. Pop — kinetic poster

- Bright typographic blocks, stickers, and color cards bounce with steady rhythm.
- Text is central, playful, and legible.

### 4. Dance — light architecture

- Pulsing geometric fields, radial light, and layered grids react to dense rhythmic energy.
- Text becomes part of the beat without losing readability.

### 5. Rock — signal and grain

- High-contrast lettering, grain, ink-like fragments, and visual distortion react to strong changes and loudness.
- The effect should feel deliberate and tactile, never like a broken screen.

## Style-selection behavior

- Audio is analyzed continuously but the visual personality is not allowed to flicker from moment to moment.
- The engine smooths features over several seconds and uses confidence thresholds before changing a primary scene.
- Values within a scene remain continuously responsive: intensity, color brightness, motion speed, and text treatment all scale with the live audio.
- During uncertain audio, use the current scene at reduced intensity instead of guessing aggressively.
- The user does not select a style in the first prototype. Manual style selection can be added only if automatic behavior proves too opaque during testing.

## Screen composition

- Portrait screen, designed to be viewed at a slight distance.
- The background is the full-screen visual scene, not a boxed visualizer.
- Typography is the foreground anchor: large, high-contrast, with a small amount of contextual status information.
- Interface controls are quiet and remain near the lower edge so the phone can read as an object when left alone.
- Avoid a conventional audio-player layout: no play/pause, progress bar, album queue, or fake waveform dashboard.

## Technical boundaries

| Unit | Responsibility | Input | Output |
| --- | --- | --- | --- |
| Microphone capture | Requests permission and exposes raw compatible audio measurements. | Device microphone | Live measurement frames or an unavailable state |
| Audio feature processor | Smooths measurements and derives stable visual-control values. | Measurement frames | `AudioFeatures` |
| Style engine | Chooses a personality and continuous presentation parameters. | `AudioFeatures`, previous state | `VisualState` |
| Scene renderer | Draws one of five worlds without knowing microphone details. | `VisualState` | Animated background |
| Typography renderer | Lays out and animates local sample text while preserving accessibility and legibility. | `VisualState`, local copy | Foreground text |
| Listening controls | Displays permission, active, inactive, and recovery states. | Capture state | User actions and status |

`AudioFeatures` and `VisualState` must be platform-neutral TypeScript types. This keeps later ShazamKit and lyric integrations outside the visual engine.

## Error and edge-state behavior

- Permission not granted: show a calm explanation with a single retry / settings affordance; continue showing a static idle scene.
- No detectable sound: retain the last personality at low movement or show the Ambient idle scene.
- Audio interruption: pause the reactive layer and return to listening when the operating system restores access.
- Unsupported runtime behavior: present a development-only message identifying that the feature needs a physical device, never crash.
- Fast or noisy measurement changes: bound values and smooth them before rendering to prevent seizure-like flashing or unreadable text.

## Acceptance criteria for the first prototype

- A Windows developer can install dependencies, start Expo, scan the QR code, and open the app on an iPhone without paid accounts.
- The app requests microphone access and visibly responds to spoken voice or music played nearby.
- The screen is portrait-only and has no music-player controls.
- Ambient and Jazz are visually unmistakable from each other at a glance.
- The other three personalities are present as intentional, distinct defaults.
- A scene change is stable and takes place over time; it does not randomly flash among styles.
- Sample text is prominent and readable across every personality.
- Denying microphone permission produces a recoverable, intentional screen.
- The app stays useful as an idle visual object when no music is detected.

## Later phase: recognized lyrics

When the visual MVP is validated, add a separate native iOS integration phase:

1. Use ShazamKit (requiring a custom native Expo development build and relevant Apple configuration) to identify room audio.
2. Obtain a licensed lyrics source under terms appropriate to personal or commercial use.
3. Feed recognized track metadata and legally sourced lyric segments into the existing typography renderer.
4. Decide whether true timing data is available; without it, show whole-line transitions instead of claiming karaoke-grade synchronization.

This later phase must be designed and approved separately because its platform, operational, and licensing constraints differ from the zero-cost Windows prototype.
