# MUSICAGE Visual MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-cost, portrait-only Expo Go prototype that turns live iPhone microphone audio into five stable, stylized visual worlds with large local sample typography.

**Architecture:** The app captures PCM microphone buffers with `expo-audio`, derives smoothed spectral features in pure TypeScript, and turns those features into a stable `VisualState` through a pure style engine. A scene renderer and typography layer consume `VisualState` only, keeping future ShazamKit and licensed-lyrics work isolated from the visual system.

**Tech Stack:** Expo (current SDK installed by `expo install`), React Native, TypeScript, `expo-audio`, `react-native-svg`, `react-native-safe-area-context`, `fft.js`, Jest via `jest-expo`, React Native Testing Library v14.

**Spec:** `docs/superpowers/specs/2026-08-23-musicage-visual-mvp-design.md`

## Global Constraints

- Development takes place on Windows.
- The first prototype has zero required cost.
- The app is tested through Expo Go on the owner's iPhone.
- No Mac, Xcode, Apple Developer Program membership, TestFlight, or App Store delivery is required for this phase.
- The app does not play music.
- The app is portrait-only.
- The first prototype must remain usable when no song can be identified.
- Do not retain, upload, save, or display microphone recordings.
- Do not identify tracks, fetch third-party lyrics, or label local sample copy as recognized lyrics.
- Use standard React Native `Animated`; do not introduce native-only animation packages for this Expo Go phase.

---

## Target file structure

```text
App.tsx                                  # Expo entry point; renders the application shell
app.json                                 # Portrait orientation and microphone permission copy
package.json                             # Expo, test, and quality scripts
tsconfig.json                            # Expo TypeScript settings
jest.config.js                           # Jest Expo configuration
src/
  app/
    MusicageApp.tsx                      # Composes microphone hook, visual state, scene, and controls
    sampleCopy.ts                        # Clearly marked local visual-copy lines
  audio/
    types.ts                             # AudioFeatures and PCM buffer types
    featureProcessor.ts                  # Pure PCM → smoothed audio features
    useMicrophoneAnalysis.ts             # Expo Audio lifecycle and permission boundary
    __tests__/featureProcessor.test.ts
  style/
    types.ts                             # VisualStyle and VisualState
    styleEngine.ts                       # Pure feature → stable visual state selection
    __tests__/styleEngine.test.ts
  scenes/
    SceneRenderer.tsx                    # Selects a scene component from VisualStyle
    SceneProps.ts                        # Shared scene component contract
    AmbientScene.tsx                     # Forward-moving layered landscape
    JazzScene.tsx                        # Abstract live-band stage
    PopScene.tsx                         # Kinetic poster world
    DanceScene.tsx                       # Light architecture world
    RockScene.tsx                        # Signal-and-grain world
    __tests__/SceneRenderer.test.tsx
  components/
    LyricTypography.tsx                  # Sample-copy foreground typography
    ListeningControls.tsx                # Permission, listening, and mute/retry state
    __tests__/ListeningControls.test.tsx
  utils/
    clamp.ts                             # Shared numeric bounds helper
    color.ts                             # Shared color interpolation helper
```

## Task 1: Create an Expo Go–compatible foundation

The isolated worktree intentionally starts from the approved documentation commit and excludes the earlier untracked visual sketch. Create the application foundation afresh here; keep the approved spec and this plan untouched.

**Files:**

- Create: `package.json`
- Create: `app.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `App.tsx`
- Create: `src/app/MusicageApp.tsx`
- Test: `src/app/MusicageApp.test.tsx`

**Interfaces:**

- Produces: `MusicageApp(): React.JSX.Element`, the sole root application component.
- Produces: scripts `start`, `start:tunnel`, `test`, and `typecheck`.
- Consumes later: `MusicageApp` will initially render an explicit placeholder while audio and scenes are added in subsequent tasks.

- [ ] **Step 1: Install Expo-compatible dependencies and test tooling.**

Run from the repository root. Upgrade the preliminary SDK 53 sketch to SDK 57 first: Expo Go on physical iPhones only supports the current SDK, and `useAudioStream` is required for real-time PCM input.

```powershell
npm init -y
npm pkg set name="musicage" version="0.1.0" private=true main="node_modules/expo/AppEntry.js"
npm install expo@^57.0.0
npx expo install --fix
npx expo install expo-audio expo-status-bar react-native-svg
npx expo install react-native-safe-area-context
npm uninstall expo-av @expo/vector-icons
npm install fft.js
npx expo install jest-expo -- --save-dev
npm install --save-dev @testing-library/react-native @types/jest typescript
npx expo-doctor
```

Update `package.json` scripts to:

```json
{
  "scripts": {
    "start": "expo start",
    "start:tunnel": "expo start --tunnel",
    "test": "jest --runInBand",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit"
  }
}
```

`expo install` chooses versions compatible with the installed Expo SDK. Do not manually pin a version copied from a blog post.

- [ ] **Step 2: Add the minimal TypeScript and Jest configuration.**

Create `tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["jest"]
  },
  "include": ["App.tsx", "src/**/*.ts", "src/**/*.tsx"]
}
```

Create `jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
};
```

- [ ] **Step 3: Write the failing root-render test.**

Create `src/app/MusicageApp.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { MusicageApp } from './MusicageApp';

it('renders the portrait visual-object shell', async () => {
  const screen = await render(<MusicageApp />);
  expect(screen.getByTestId('musicage-root')).toBeTruthy();
  expect(screen.getByText('MUSICAGE')).toBeTruthy();
});
```

- [ ] **Step 4: Run the test to verify it fails.**

Run:

```powershell
npm test -- src/app/MusicageApp.test.tsx
```

Expected: FAIL because `MusicageApp` does not exist.

- [ ] **Step 5: Implement the minimal root shell.**

Create `src/app/MusicageApp.tsx` and keep the initial implementation deliberately small:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function MusicageApp() {
  return (
    <SafeAreaView style={styles.root} testID="musicage-root">
      <View style={styles.wordmarkRow}>
        <Text style={styles.wordmark}>MUSICAGE</Text>
        <Text style={styles.status}>IDLE</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101112' },
  wordmarkRow: { paddingHorizontal: 24, paddingTop: 20, flexDirection: 'row', justifyContent: 'space-between' },
  wordmark: { color: '#F4F0E6', fontSize: 13, fontWeight: '700', letterSpacing: 4 },
  status: { color: '#A9AAA4', fontSize: 10, letterSpacing: 2 },
});
```

Replace `App.tsx` with:

```tsx
import { StatusBar } from 'expo-status-bar';
import { MusicageApp } from './src/app/MusicageApp';

export default function App() {
  return <><StatusBar style="light" /><MusicageApp /></>;
}
```

Set `app.json` to use `orientation: "portrait"` and add the `expo-audio` plugin with this exact Japanese permission copy:

```json
[
  "expo-audio",
  {
    "microphonePermission": "周囲で流れている音楽に反応する映像を表示するため、マイクを使用します。音声を保存・送信することはありません。",
    "enableBackgroundRecording": false,
    "enableBackgroundPlayback": false
  }
]
```

- [ ] **Step 6: Run static checks and the root test.**

Run:

```powershell
npm run typecheck
npm test -- src/app/MusicageApp.test.tsx
npx expo-doctor
```

Expected: all commands exit successfully; `expo-doctor` reports no dependency incompatibility.

- [ ] **Step 7: Commit the foundation.**

```powershell
git add App.tsx app.json package.json tsconfig.json jest.config.js src/app
git commit -m "chore: establish expo go visual MVP foundation"
```

## Task 2: Build deterministic PCM feature extraction

**Files:**

- Create: `src/utils/clamp.ts`
- Create: `src/audio/types.ts`
- Create: `src/audio/featureProcessor.ts`
- Test: `src/audio/__tests__/featureProcessor.test.ts`

**Interfaces:**

- Produces:

```ts
export interface AudioFeatures {
  timestampMs: number;
  energy: number;
  low: number;
  mid: number;
  high: number;
  transient: number;
  silence: boolean;
}

export interface FeatureProcessor {
  process(samples: Float32Array, sampleRate: number, timestampMs: number): AudioFeatures;
  reset(): void;
}

export function createFeatureProcessor(): FeatureProcessor;
```

- Consumed by: `useMicrophoneAnalysis` in Task 4 and `selectVisualState` in Task 3.

- [ ] **Step 1: Write failing tests for silence, stable low tone, high tone, and sudden energy change.**

Create `src/audio/__tests__/featureProcessor.test.ts`:

```ts
import { createFeatureProcessor } from '../featureProcessor';

function sine(hz: number, sampleRate = 48_000, frames = 2_048, amplitude = 0.7) {
  return Float32Array.from({ length: frames }, (_, index) => amplitude * Math.sin((2 * Math.PI * hz * index) / sampleRate));
}

it('marks a zero PCM buffer as silence', () => {
  const result = createFeatureProcessor().process(new Float32Array(2_048), 48_000, 0);
  expect(result.silence).toBe(true);
  expect(result.energy).toBe(0);
});

it('gives a 100 Hz signal more low energy than high energy', () => {
  const result = createFeatureProcessor().process(sine(100), 48_000, 0);
  expect(result.low).toBeGreaterThan(result.high);
});

it('gives a 5 kHz signal more high energy than low energy', () => {
  const result = createFeatureProcessor().process(sine(5_000), 48_000, 0);
  expect(result.high).toBeGreaterThan(result.low);
});

it('reports a stronger transient after a quiet buffer becomes loud', () => {
  const processor = createFeatureProcessor();
  processor.process(sine(220, 48_000, 2_048, 0.02), 48_000, 0);
  const result = processor.process(sine(220, 48_000, 2_048, 0.9), 48_000, 100);
  expect(result.transient).toBeGreaterThan(0.4);
});

it('clears smoothed energy and transient history when reset', () => {
  const processor = createFeatureProcessor();
  processor.process(sine(220, 48_000, 2_048, 0.9), 48_000, 0);
  processor.reset();
  const result = processor.process(new Float32Array(2_048), 48_000, 100);
  expect(result.energy).toBe(0);
  expect(result.transient).toBe(0);
  expect(result.silence).toBe(true);
});
```

- [ ] **Step 2: Run the feature tests to verify they fail.**

Run:

```powershell
npm test -- src/audio/__tests__/featureProcessor.test.ts
```

Expected: FAIL because `createFeatureProcessor` is missing.

- [ ] **Step 3: Implement the pure feature processor.**

Create `src/utils/clamp.ts`:

```ts
export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
```

In `src/audio/featureProcessor.ts`, implement these exact rules:

```ts
// Per buffer:
// 1. Apply a Hann window to the first 2048 samples (zero-pad shorter frames).
// 2. Run a 2048-point FFT using fft.js.
// 3. Average squared magnitude in 20–250 Hz, 250–2,000 Hz, and 2,000–8,000 Hz.
// 4. Normalize each band by total magnitude, then clamp to [0, 1].
// 5. Set raw energy to RMS(samples), clamped to [0, 1].
// 6. Smooth energy and bands using EMA(previous, raw, 0.18).
// 7. Set transient to clamp01((rawEnergy - previousRawEnergy) / 0.35).
// 8. Set silence when smoothed energy < 0.018.
```

Do not expose raw samples outside this module. `reset()` must clear all historical values and return the next silent frame to a fresh state.

- [ ] **Step 4: Run tests and typechecking.**

Run:

```powershell
npm test -- src/audio/__tests__/featureProcessor.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the audio-domain boundary.**

```powershell
git add src/utils/clamp.ts src/audio
git commit -m "feat: derive stable visual features from microphone PCM"
```

## Task 3: Implement stable visual-style inference

**Files:**

- Create: `src/style/types.ts`
- Create: `src/style/styleEngine.ts`
- Test: `src/style/__tests__/styleEngine.test.ts`

**Interfaces:**

- Consumes: `AudioFeatures` from `src/audio/types.ts`.
- Produces:

```ts
export type VisualStyle = 'ambient' | 'jazz' | 'pop' | 'dance' | 'rock';

export interface VisualState {
  style: VisualStyle;
  intensity: number;
  motion: number;
  textScale: number;
  accent: number;
  changedAtMs: number;
}

export function createInitialVisualState(nowMs?: number): VisualState;
export function selectVisualState(features: AudioFeatures, previous: VisualState, nowMs: number): VisualState;
```

- Consumed by: every scene renderer and `MusicageApp`.

- [ ] **Step 1: Write the failing style-selection and anti-flicker tests.**

Create `src/style/__tests__/styleEngine.test.ts`:

```ts
import { AudioFeatures } from '../../audio/types';
import { createInitialVisualState, selectVisualState } from '../styleEngine';

const feature = (overrides: Partial<AudioFeatures> = {}): AudioFeatures => ({
  timestampMs: 0, energy: 0.35, low: 0.34, mid: 0.34, high: 0.32, transient: 0.1, silence: false, ...overrides,
});

it('uses Ambient for silence and slow low-energy input', () => {
  const state = selectVisualState(feature({ energy: 0.01, silence: true }), createInitialVisualState(0), 1_000);
  expect(state.style).toBe('ambient');
});

it('uses Jazz for balanced low and mid energy with gentle changes', () => {
  const state = selectVisualState(feature({ energy: 0.70, low: 0.40, mid: 0.50, high: 0.10, transient: 0.05 }), createInitialVisualState(0), 8_000);
  expect(state.style).toBe('jazz');
});

it('uses Pop for mid-and-high energy with a stable pulse', () => {
  const state = selectVisualState(feature({ energy: 0.80, low: 0.08, mid: 0.50, high: 0.42, transient: 0.12 }), createInitialVisualState(0), 8_000);
  expect(state.style).toBe('pop');
});

it('uses Dance for energetic, bass-heavy, transient-rich input', () => {
  const state = selectVisualState(feature({ energy: 0.82, low: 0.65, mid: 0.22, high: 0.13, transient: 0.8 }), createInitialVisualState(0), 8_000);
  expect(state.style).toBe('dance');
});

it('uses Rock for loud high-frequency, transient-rich input', () => {
  const state = selectVisualState(feature({ energy: 0.86, low: 0.18, mid: 0.28, high: 0.54, transient: 0.72 }), createInitialVisualState(0), 8_000);
  expect(state.style).toBe('rock');
});

it('does not switch personality before the minimum dwell time', () => {
  const jazz = { ...createInitialVisualState(0), style: 'jazz' as const, changedAtMs: 9_000 };
  const result = selectVisualState(feature({ energy: 0.9, low: 0.65, transient: 0.9 }), jazz, 10_000);
  expect(result.style).toBe('jazz');
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run:

```powershell
npm test -- src/style/__tests__/styleEngine.test.ts
```

Expected: FAIL because the style module is missing.

- [ ] **Step 3: Implement scoring, smoothing, and hysteresis.**

Use these explicit score rules in `styleEngine.ts`:

```ts
ambient = (1 - energy) * 0.60 + low * 0.20 + (1 - transient) * 0.20;
jazz    = mid * 0.45 + low * 0.25 + (1 - transient) * 0.20 + (1 - Math.abs(low - mid)) * 0.10;
pop     = mid * 0.40 + high * 0.25 + energy * 0.20 + (1 - transient) * 0.15;
dance   = low * 0.35 + energy * 0.35 + transient * 0.30;
rock    = high * 0.35 + energy * 0.35 + transient * 0.30;
```

Choose the highest score only when all conditions are true:

```ts
const minimumDwellMs = 6_000;
const scoreMargin = 0.12;
const canSwitch = nowMs - previous.changedAtMs >= minimumDwellMs;
const candidateWinsClearly = candidateScore >= currentScore + scoreMargin;
```

Otherwise retain `previous.style`. Define continuous controls as:

```ts
intensity = clamp01(features.energy * 0.7 + features.transient * 0.3);
motion = clamp01(features.energy * 0.45 + features.transient * 0.4 + features.high * 0.15);
textScale = 0.92 + intensity * 0.18;
accent = clamp01(features.high * 0.55 + features.transient * 0.45);
```

For `silence === true`, return Ambient with `intensity <= 0.12` and `motion <= 0.08`.

- [ ] **Step 4: Run style and audio unit tests.**

Run:

```powershell
npm test -- src/audio/__tests__/featureProcessor.test.ts src/style/__tests__/styleEngine.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the visual-state engine.**

```powershell
git add src/style
git commit -m "feat: infer stable musicage visual personalities"
```

## Task 4: Connect Expo Go microphone streaming without persisting audio

**Files:**

- Create: `src/audio/useMicrophoneAnalysis.ts`
- Modify: `src/app/MusicageApp.tsx`
- Test: `src/audio/__tests__/useMicrophoneAnalysis.test.tsx`

**Interfaces:**

- Consumes: `createFeatureProcessor()`.
- Produces:

```ts
export type ListeningStatus = 'idle' | 'requesting' | 'listening' | 'denied' | 'error';

export interface MicrophoneAnalysis {
  status: ListeningStatus;
  features: AudioFeatures;
  errorMessage: string | null;
  start(): Promise<void>;
  stop(): void;
  retry(): Promise<void>;
}

export function useMicrophoneAnalysis(): MicrophoneAnalysis;
```

- Consumed by: `MusicageApp` and `ListeningControls` in Task 6.

- [ ] **Step 1: Write the failing lifecycle test using a mocked Expo Audio module.**

Create `src/audio/__tests__/useMicrophoneAnalysis.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native';
import { AudioModule, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { useMicrophoneAnalysis } from '../useMicrophoneAnalysis';

jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
  setAudioModeAsync: jest.fn(),
  useAudioStream: jest.fn(),
}));

it('starts a PCM stream after microphone permission is granted', async () => {
  const start = jest.fn().mockResolvedValue(undefined);
  (AudioModule.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
  (useAudioStream as jest.Mock).mockReturnValue({ stream: { start, stop: jest.fn() }, isStreaming: false });
  const { result } = await renderHook(() => useMicrophoneAnalysis());

  await act(async () => { await result.current.start(); });

  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: true, playsInSilentMode: true }));
  expect(start).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('listening');
});
```

- [ ] **Step 2: Run the hook test to verify it fails.**

Run:

```powershell
npm test -- src/audio/__tests__/useMicrophoneAnalysis.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the microphone boundary.**

Use `useAudioStream` exactly once inside the hook with this configuration:

```tsx
const { stream } = useAudioStream({
  sampleRate: 48_000,
  channels: 1,
  encoding: 'float32',
  onBuffer: (buffer) => {
    const samples = new Float32Array(buffer.data);
    setFeatures(processorRef.current.process(samples, buffer.sampleRate, Math.round(buffer.timestamp * 1000)));
  },
});
```

`start()` must request permission with `AudioModule.requestRecordingPermissionsAsync()`. When granted, call:

```ts
await setAudioModeAsync({
  allowsRecording: true,
  playsInSilentMode: true,
  interruptionMode: 'mixWithOthers',
});
await stream.start();
```

`stop()` must call `stream.stop()` and reset features. On denied access, set `status` to `denied`, expose no raw error object, and retain an Ambient-compatible silent feature object. On an exception, set `status` to `error` and expose the fixed copy `"マイクを開始できませんでした。もう一度試してください。"`.

Attach an `AppState` listener: stop streaming while not active and call `start()` when returning to active only if the previous state was `listening`. Remove the listener and stop the stream in cleanup. Do not create an `AudioRecorder`, recording URI, cache file, or file-system write.

- [ ] **Step 4: Integrate the hook into the root app as a diagnostic status only.**

In `MusicageApp`, call `useMicrophoneAnalysis()`, call `start()` once on mount, and show `LISTENING`, `MIC OFF`, or `MIC ERROR` in the wordmark row. Do not render raw dB values or a traditional waveform dashboard.

- [ ] **Step 5: Run tests and device smoke test.**

Run:

```powershell
npm test -- src/audio/__tests__/useMicrophoneAnalysis.test.tsx src/audio/__tests__/featureProcessor.test.ts
npm run typecheck
npx expo start --tunnel
```

Manual expectation on the iPhone in Expo Go: the operating system asks for microphone access; accepting changes the label to `LISTENING`; denying it changes the label to `MIC OFF`; the application does not write a recording file.

- [ ] **Step 6: Commit the microphone integration.**

```powershell
git add src/audio src/app/MusicageApp.tsx
git commit -m "feat: stream microphone features in expo go"
```

## Task 5: Build Ambient and Jazz as distinct visual worlds

**Files:**

- Create: `src/scenes/SceneProps.ts`
- Create: `src/scenes/AmbientScene.tsx`
- Create: `src/scenes/JazzScene.tsx`
- Create: `src/components/LyricTypography.tsx`
- Create: `src/app/sampleCopy.ts`
- Test: `src/scenes/__tests__/SceneRenderer.test.tsx`

**Interfaces:**

- Consumes: `VisualState`.
- Produces:

```ts
export interface SceneProps {
  visual: VisualState;
  reducedMotion?: boolean;
}

export function AmbientScene(props: SceneProps): React.JSX.Element;
export function JazzScene(props: SceneProps): React.JSX.Element;
export function LyricTypography({ visual }: { visual: VisualState }): React.JSX.Element;
```

- Consumed by: `SceneRenderer` in Task 6.

- [ ] **Step 1: Write failing render tests proving the two scenes are distinct.**

Create `src/scenes/__tests__/SceneRenderer.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { AmbientScene } from '../AmbientScene';
import { JazzScene } from '../JazzScene';

const ambient = { style: 'ambient' as const, intensity: 0.2, motion: 0.1, textScale: 0.95, accent: 0.1, changedAtMs: 0 };
const jazz = { style: 'jazz' as const, intensity: 0.55, motion: 0.4, textScale: 1, accent: 0.3, changedAtMs: 0 };

it('renders the forward landscape markers for Ambient', async () => {
  const screen = await render(<AmbientScene visual={ambient} reducedMotion />);
  expect(screen.getByTestId('scene-ambient')).toBeTruthy();
  expect(screen.getByTestId('ambient-horizon-near')).toBeTruthy();
});

it('renders individual band-response markers for Jazz', async () => {
  const screen = await render(<JazzScene visual={jazz} reducedMotion />);
  expect(screen.getByTestId('scene-jazz')).toBeTruthy();
  expect(screen.getByTestId('jazz-bass')).toBeTruthy();
  expect(screen.getByTestId('jazz-percussion')).toBeTruthy();
  expect(screen.getByTestId('jazz-horn')).toBeTruthy();
});
```

- [ ] **Step 2: Run the scene tests to verify they fail.**

Run:

```powershell
npm test -- src/scenes/__tests__/SceneRenderer.test.tsx
```

Expected: FAIL because the scene components are missing.

- [ ] **Step 3: Implement Ambient.**

Use `View`, `Animated.View`, and `react-native-svg` only. `AmbientScene` must include at least three depth layers:

```tsx
// Far layer: gradient sky / stars, opacity depends on (1 - visual.intensity).
// Mid layer: mist and distant landforms, horizontal drift depends on visual.motion.
// Near layer: a curved horizon that translates upward slowly to imply forward travel.
```

Use `useNativeDriver: true` for transforms and opacity. When `reducedMotion` is true, render static values without starting `Animated.loop`. Set test IDs `scene-ambient`, `ambient-horizon-far`, `ambient-horizon-mid`, and `ambient-horizon-near`.

- [ ] **Step 4: Implement Jazz.**

Build an abstract stage, not realistic musicians or third-party artwork. Use three independently animated groups:

```tsx
// bass: a low, rounded silhouette that scales from visual.intensity.
// percussion: short vertical marks that bounce from visual.motion.
// horn: an angled line / light cone whose width responds to visual.accent.
```

Set test IDs `scene-jazz`, `jazz-bass`, `jazz-percussion`, and `jazz-horn`. Use a warm near-black palette with controlled amber, cream, and muted blue light.

- [ ] **Step 5: Implement unambiguous local visual copy.**

Create `src/app/sampleCopy.ts`:

```ts
export const SAMPLE_VISUAL_COPY = [
  'THE ROOM MOVES',
  'WITH THE SOUND',
  'NOT A LYRIC',
] as const;
```

`LyricTypography` must show a small `VISUAL COPY` label above the current line. Animate opacity, letter spacing, and scale from `visual`, while keeping the primary line at least 32 logical pixels. It must never show timestamps, track titles, a fake artist, or the label `LYRICS`.

- [ ] **Step 6: Run tests and inspect on a real device.**

Run:

```powershell
npm test -- src/scenes/__tests__/SceneRenderer.test.tsx
npm run typecheck
npx expo start --tunnel
```

Manual expectation: Ambient clearly feels like traveling through a landscape and Jazz clearly feels like a stage ensemble, even with the same audio input level.

- [ ] **Step 7: Commit the two signature scenes.**

```powershell
git add src/scenes/AmbientScene.tsx src/scenes/JazzScene.tsx src/scenes/SceneProps.ts src/components/LyricTypography.tsx src/app/sampleCopy.ts src/scenes/__tests__/SceneRenderer.test.tsx
git commit -m "feat: add ambient landscape and jazz band scenes"
```

## Task 6: Add Pop, Dance, Rock, scene routing, and listening controls

**Files:**

- Create: `src/scenes/PopScene.tsx`
- Create: `src/scenes/DanceScene.tsx`
- Create: `src/scenes/RockScene.tsx`
- Create: `src/scenes/SceneRenderer.tsx`
- Create: `src/components/ListeningControls.tsx`
- Modify: `src/scenes/__tests__/SceneRenderer.test.tsx`
- Create: `src/components/__tests__/ListeningControls.test.tsx`

**Interfaces:**

- Consumes: `SceneProps`, `VisualState`, and microphone `ListeningStatus`.
- Produces:

```ts
export function SceneRenderer({ visual, reducedMotion }: SceneProps): React.JSX.Element;

export function ListeningControls(props: {
  status: ListeningStatus;
  errorMessage: string | null;
  onRetry(): void;
  onStop(): void;
  onStart(): void;
}): React.JSX.Element;
```

- Consumed by: `MusicageApp` in Task 7.

- [ ] **Step 1: Extend the failing scene-router tests.**

Append to `src/scenes/__tests__/SceneRenderer.test.tsx`:

```tsx
import { SceneRenderer } from '../SceneRenderer';

it.each(['ambient', 'jazz', 'pop', 'dance', 'rock'] as const)('routes %s to one scene root', async (style) => {
  const screen = await render(<SceneRenderer visual={{ style, intensity: 0.5, motion: 0.5, textScale: 1, accent: 0.5, changedAtMs: 0 }} reducedMotion />);
  expect(screen.getByTestId(`scene-${style}`)).toBeTruthy();
});
```

Create `src/components/__tests__/ListeningControls.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';
import { ListeningControls } from '../ListeningControls';

it('offers retry when access is denied', async () => {
  const onRetry = jest.fn();
  const screen = await render(<ListeningControls status="denied" errorMessage={null} onRetry={onRetry} onStart={jest.fn()} onStop={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: 'マイクをもう一度試す' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('offers a stop control while listening', async () => {
  const onStop = jest.fn();
  const screen = await render(<ListeningControls status="listening" errorMessage={null} onRetry={jest.fn()} onStart={jest.fn()} onStop={onStop} />);
  fireEvent.press(screen.getByRole('button', { name: 'マイクを止める' }));
  expect(onStop).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run:

```powershell
npm test -- src/scenes/__tests__/SceneRenderer.test.tsx src/components/__tests__/ListeningControls.test.tsx
```

Expected: FAIL because the scene router and controls do not exist.

- [ ] **Step 3: Implement the three remaining visual worlds.**

Use `SceneProps` in all three components and include the following required root IDs and visual rules:

```text
PopScene   → testID="scene-pop"; 3–6 color cards and typographic blocks, upward bounce from motion.
DanceScene → testID="scene-dance"; concentric rings / grid, scale and opacity pulse from intensity and transient-derived motion.
RockScene  → testID="scene-rock"; high-contrast text fragments and deterministic pseudo-random grain, distortion is bounded to 8 px.
```

All colors and transforms must be interpolated from `VisualState`; no scene may start a network request, use an image URL, or access microphone data directly.

- [ ] **Step 4: Implement SceneRenderer.**

Use an exhaustive map so a missing style is a TypeScript error:

```tsx
const sceneByStyle: Record<VisualStyle, React.ComponentType<SceneProps>> = {
  ambient: AmbientScene,
  jazz: JazzScene,
  pop: PopScene,
  dance: DanceScene,
  rock: RockScene,
};

export function SceneRenderer(props: SceneProps) {
  const Scene = sceneByStyle[props.visual.style];
  return <Scene {...props} />;
}
```

- [ ] **Step 5: Implement ListeningControls.**

Render a quiet bottom overlay with these exact accessible button labels:

```text
idle/error → 「マイクを開始する」
listening  → 「マイクを止める」
denied     → 「マイクをもう一度試す」
```

For `denied`, show `マイクを許可すると、音に反応する映像が動きます。`. For `error`, render `errorMessage` and the start action. Keep controls below the typography and make the touch targets at least 44 × 44 logical pixels.

- [ ] **Step 6: Run the scene and control tests.**

Run:

```powershell
npm test -- src/scenes/__tests__/SceneRenderer.test.tsx src/components/__tests__/ListeningControls.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the complete scene collection.**

```powershell
git add src/scenes src/components/ListeningControls.tsx src/components/__tests__/ListeningControls.test.tsx
git commit -m "feat: complete musicage visual worlds and controls"
```

## Task 7: Compose the final MVP and validate on iPhone through Expo Go

**Files:**

- Modify: `src/app/MusicageApp.tsx`
- Modify: `src/app/MusicageApp.test.tsx`
- Create: `README.md`
- Test: all tests under `src/`

**Interfaces:**

- Consumes: `useMicrophoneAnalysis`, `selectVisualState`, `SceneRenderer`, `LyricTypography`, and `ListeningControls`.
- Produces: complete portrait MVP with no music-player UI and no recording persistence.

- [ ] **Step 1: Write the failing integration test.**

Replace `src/app/MusicageApp.test.tsx` with a mock of `useMicrophoneAnalysis` and this assertion:

```tsx
import { render } from '@testing-library/react-native';
import { MusicageApp } from './MusicageApp';

jest.mock('../audio/useMicrophoneAnalysis', () => ({
  useMicrophoneAnalysis: () => ({
    status: 'listening',
    features: { timestampMs: 0, energy: 0.7, low: 0.66, mid: 0.2, high: 0.14, transient: 0.8, silence: false },
    errorMessage: null,
    start: jest.fn(), stop: jest.fn(), retry: jest.fn(),
  }),
}));

it('composes a responsive visual scene without player controls', async () => {
  const screen = await render(<MusicageApp />);
  expect(screen.getByTestId('musicage-root')).toBeTruthy();
  expect(screen.getByTestId('scene-dance')).toBeTruthy();
  expect(screen.getByText('VISUAL COPY')).toBeTruthy();
  expect(screen.queryByText('NOW PLAYING')).toBeNull();
});
```

- [ ] **Step 2: Run the integration test to verify it fails.**

Run:

```powershell
npm test -- src/app/MusicageApp.test.tsx
```

Expected: FAIL until the application composes the scene, visual state, typography, and control layers.

- [ ] **Step 3: Integrate the app layers.**

In `MusicageApp.tsx`:

```tsx
const microphone = useMicrophoneAnalysis();
const visual = useMemo(
  () => selectVisualState(microphone.features, visualRef.current, Date.now()),
  [microphone.features],
);
visualRef.current = visual;
```

Use a full-screen stacking layout in this order:

```text
1. SceneRenderer       — absolute fill
2. subtle dark scrim   — absolute fill; opacity below 0.30
3. wordmark/status     — top safe-area region
4. LyricTypography     — central / lower-middle region
5. ListeningControls   — bottom safe-area region
```

Default to `createInitialVisualState()` before live features arrive. When `status` is `denied` or `error`, render Ambient at idle intensity while retaining the controls. Do not add album art, music controls, artificial track metadata, a progress bar, timestamps, or a standard bar visualizer.

- [ ] **Step 4: Document zero-cost Windows setup and test procedure.**

Create `README.md` with these exact sections:

```markdown
## Prerequisites
- Node.js LTS
- Expo Go on an iPhone
- Windows PC and the phone on the same network, or use the tunnel command

## Run
1. npm install
2. npm run start:tunnel
3. Scan the QR code with Expo Go
4. Allow microphone access

## What it does
- Uses live microphone PCM only to animate visuals.
- Does not record, store, upload, identify, or play audio.
- Shows local visual-copy text; it does not show recognized lyrics.

## Device validation
- Speak, clap, and play music nearby to verify motion response.
- Check Ambient and Jazz manually by temporarily injecting fixed VisualState values in development.
- Deny microphone access after reinstalling Expo Go to verify recovery copy.
```

- [ ] **Step 5: Run the complete automated verification.**

Run:

```powershell
npm test
npm run typecheck
npx expo-doctor
```

Expected: all commands exit successfully.

- [ ] **Step 6: Run the physical-device acceptance checklist.**

Run:

```powershell
npm run start:tunnel
```

On the iPhone in Expo Go, verify each item:

```text
[ ] Portrait orientation remains fixed.
[ ] The microphone request copy says audio is not saved or sent.
[ ] Speaking or nearby music changes scene intensity within one second.
[ ] Silence settles into a low-motion Ambient world.
[ ] Ambient looks like forward travel through a landscape.
[ ] Jazz shows bass, percussion, and horn-like forms.
[ ] Pop, Dance, and Rock can each be reached using temporary development fixtures.
[ ] A scene holds for at least six seconds before switching.
[ ] Large copy remains legible in every scene.
[ ] Denied permission shows a recoverable, non-crashing screen.
[ ] No music playback, track recognition, network call, or recording file occurs.
```

- [ ] **Step 7: Commit the integrated MVP.**

```powershell
git add App.tsx src/app README.md
git commit -m "feat: compose zero cost musicage visual MVP"
```

## Plan self-review

### Spec coverage

| Spec requirement | Plan coverage |
| --- | --- |
| Windows + zero cost + Expo Go | Task 1 foundation and Task 7 README/device validation |
| Portrait-only, no player | Task 1 app config and Task 7 integration test |
| Live microphone response without saving audio | Task 4 hook and Task 7 device checklist |
| Five styles with stable transitions | Tasks 3, 5, and 6 |
| Ambient forward landscape | Task 5 |
| Jazz band performance | Task 5 |
| Large local sample typography | Task 5 and Task 7 |
| Graceful permission / silence / interruption handling | Tasks 3, 4, and 6 |
| Deferred track recognition and lyrics | Global constraints and deliberately isolated interfaces |

### Placeholder scan

No `TBD`, `TODO`, or unbounded implementation directives are present. All commands, file paths, test names, interfaces, and style-score thresholds are specified.

### Type consistency

`AudioFeatures` is produced by `FeatureProcessor`, exposed by `useMicrophoneAnalysis`, consumed by `selectVisualState`, and transformed into `VisualState`, which all scenes and `LyricTypography` consume. `ListeningStatus` originates in `useMicrophoneAnalysis` and is consumed only by `ListeningControls` and the root application shell.
