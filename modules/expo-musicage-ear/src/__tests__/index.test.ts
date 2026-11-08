import { ExpoMusicageEar, createEarModule } from '../index';

function makeNative() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const native = { now: () => 0, startListening: jest.fn(), stopListening: jest.fn(), listenForMatch: jest.fn(), cancelMatch: jest.fn(),
    addListener: jest.fn((name: string, l: (e: unknown) => void) => { listeners[name] = l; return { remove: jest.fn() }; }) };
  const ear = createEarModule(native as never, { offsetMs: 100, toJsMs: (ms) => ms - 100 });
  return { listeners, native, ear };
}

test('ExpoMusicageEar is null when the native module is absent (Expo Go, jest)', () => {
  expect(ExpoMusicageEar).toBeNull();
});
test('createEarModule converts events and routes an invalid match to the error listener', () => {
  const { listeners, ear } = makeNative();
  const onFeatures = jest.fn(); const onRecognition = jest.fn(); const onError = jest.fn();
  ear.addFeaturesListener(onFeatures); ear.addRecognitionListener(onRecognition); ear.addErrorListener(onError);
  listeners.onFeatures!({ t: 300, rms: 0.5, low: 0.5, mid: 0.5, high: 0.5 });
  expect(onFeatures).toHaveBeenCalledWith({ timestampMs: 200, rms: 0.5, low: 0.5, mid: 0.5, high: 0.5 });
  listeners.onRecognition!({ trackId: '', title: '', artist: '', matchedAtNativeMs: 0, currentOffsetMs: 0 });
  expect(onRecognition).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith({ code: 'invalid_match' });
  listeners.onRecognition!({ trackId: 't', title: 'S', artist: 'A', matchedAtNativeMs: 1100, currentOffsetMs: 30000 });
  expect(onRecognition).toHaveBeenCalledWith({ trackId: 't', title: 'S', artist: 'A', matchedAtMonotonicMs: 1000, currentOffsetMs: 30000 });
});
test('commands pass straight through to the native module', async () => {
  const { native, ear } = makeNative();
  await ear.listenForMatch(20_000);
  expect(native.listenForMatch).toHaveBeenCalledWith(20_000);
  await ear.startListening(); await ear.stopListening(); await ear.cancelMatch();
  expect(native.startListening).toHaveBeenCalledTimes(1);
  expect(native.stopListening).toHaveBeenCalledTimes(1);
  expect(native.cancelMatch).toHaveBeenCalledTimes(1);
});
