import { NATIVE_EVENTS, NATIVE_FUNCTIONS, NATIVE_MODULE_NAME } from '../types';

// The app's tsconfig has no Node types, hence the typed require (same as fonts.test.ts).
const { readFileSync } = require('fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const MODULE_ROOT = `${(process as unknown as { cwd(): string }).cwd()}/modules/expo-musicage-ear`;
const ios = (f: string) => readFileSync(`${MODULE_ROOT}/ios/${f}`, 'utf8');

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
test('a failed FFT setup is reported as audio_setup_failed, never a process abort', () => {
  const analyzer = ios('EarAnalyzer.swift');
  const module = ios('ExpoMusicageEarModule.swift');
  expect(analyzer).not.toContain('fatalError(');
  expect(analyzer).toMatch(/init\?\(sampleRate: Double = 48_000\)/);
  expect(module).toMatch(/guard let analyzer = EarAnalyzer\(sampleRate: 48_000\) else \{\s*throw EarSetupError\.\w+/);
  expect(module).toContain('"code": "audio_setup_failed"');
});
test('the audio session is released on every stop, including a setup that failed after activating it', () => {
  const src = ios('ExpoMusicageEarModule.swift');
  // Activation and release go through one pair of helpers guarded by a flag...
  expect(src).toContain('private func activateAudioSession() throws');
  expect(src).toContain('private func deactivateAudioSession()');
  expect(src.match(/setActive\(true\)/g)).toHaveLength(1);
  expect(src).toMatch(/setActive\(true\)\n\s*sessionActive = true/);
  // ...and stopListening releases the session unconditionally, not only when an engine was kept.
  const stop = src.slice(src.indexOf('private func stopListening()'), src.indexOf('// MARK: - Audio session'));
  expect(stop).toContain('deactivateAudioSession()');
  expect(stop).not.toMatch(/guard let engine = engine else \{ return \}/);
});
test('the module config targets apple only and names the module class', () => {
  const config = JSON.parse(readFileSync(`${MODULE_ROOT}/expo-module.config.json`, 'utf8'));
  expect(config).toEqual({ platforms: ['apple'], apple: { modules: ['ExpoMusicageEarModule'] } });
});
