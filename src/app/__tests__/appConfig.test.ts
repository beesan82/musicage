import appJson from '../../../app.json';
import easJson from '../../../eas.json';
import packageJson from '../../../package.json';

const PERMISSION_COPY = '周囲で流れている音楽を聴き取り、曲を認識して歌詞を表示するためにマイクを使用します。音声は端末の外に送らず、保存もしません（曲の照合には ShazamKit のフィンガープリントだけを使います）。';

test('the iOS app is com.musicage.app with a ShazamKit-era microphone copy', () => {
  expect(appJson.expo.ios.bundleIdentifier).toBe('com.musicage.app');
  expect(appJson.expo.ios.infoPlist.NSMicrophoneUsageDescription).toBe(PERMISSION_COPY);
  const audioPlugin = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-audio') as [string, { microphonePermission: string }];
  expect(audioPlugin[1].microphonePermission).toBe(PERMISSION_COPY);
  expect(JSON.stringify(appJson)).not.toMatch(/AudD/);
  expect(appJson.expo.extra.eas.projectId).toMatch(/^[0-9a-f-]{36}$/);
  expect(appJson.expo.owner).toBe('beesan');
  expect(appJson.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
});

test('eas.json has a development client profile with internal distribution', () => {
  expect(easJson.build.development).toEqual({ developmentClient: true, distribution: 'internal' });
  expect(easJson.build.preview).toEqual({ distribution: 'internal' });
  expect(easJson.build.production).toEqual({});
  expect(easJson.cli.appVersionSource).toBe('remote');
});

test('expo-dev-client is a dependency and Expo Go keeps a start script', () => {
  expect(packageJson.dependencies['expo-dev-client']).toMatch(/^~57\./);
  expect(packageJson.scripts['start:go']).toBe('expo start --go');
});
