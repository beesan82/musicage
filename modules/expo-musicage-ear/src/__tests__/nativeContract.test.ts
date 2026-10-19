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
test('the module config targets apple only and names the module class', () => {
  const config = JSON.parse(readFileSync(`${MODULE_ROOT}/expo-module.config.json`, 'utf8'));
  expect(config).toEqual({ platforms: ['apple'], apple: { modules: ['ExpoMusicageEarModule'] } });
});
