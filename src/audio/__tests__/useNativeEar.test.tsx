import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import type { EarError, EarFeatures, EarModule } from '../../../modules/expo-musicage-ear/src';
import { NATIVE_EAR_ERROR_COPY, useNativeEar } from '../useNativeEar';

type FakeModule = {
  [K in keyof EarModule]: jest.Mock;
};

describe('useNativeEar', () => {
  let featureListeners: Array<(f: EarFeatures) => void>;
  let errorListeners: Array<(e: EarError) => void>;
  let removeFeatures: jest.Mock;
  let removeErrors: jest.Mock;
  let fakeModule: FakeModule;
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  let appStateDescriptor: PropertyDescriptor | undefined;

  const emitFeatures = (f: EarFeatures) => featureListeners.forEach((l) => l(f));
  const emitError = (e: EarError) => errorListeners.forEach((l) => l(e));

  beforeEach(() => {
    featureListeners = [];
    errorListeners = [];
    removeFeatures = jest.fn();
    removeErrors = jest.fn();
    fakeModule = {
      now: jest.fn(() => 0),
      startListening: jest.fn().mockResolvedValue(undefined),
      stopListening: jest.fn().mockResolvedValue(undefined),
      listenForMatch: jest.fn().mockResolvedValue(undefined),
      cancelMatch: jest.fn().mockResolvedValue(undefined),
      addFeaturesListener: jest.fn((l) => {
        featureListeners.push(l);
        return { remove: removeFeatures };
      }),
      addRecognitionListener: jest.fn(() => ({ remove: jest.fn() })),
      addErrorListener: jest.fn((l) => {
        errorListeners.push(l);
        return { remove: removeErrors };
      }),
    };
    appStateListener = undefined;
    appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as never;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (appStateDescriptor) {
      Object.defineProperty(AppState, 'currentState', appStateDescriptor);
    }
  });

  const render = () => renderHook(() => useNativeEar(fakeModule as unknown as EarModule));

  test('start requests native listening and enters listening', async () => {
    const { result } = await render();
    expect(result.current.kind).toBe('native');
    expect(result.current.recognizer).toBe(fakeModule);

    await act(() => result.current.start());

    expect(fakeModule.startListening).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('listening');
  });

  test('microphone_denied puts the ear in denied with no error copy', async () => {
    fakeModule.startListening.mockImplementation(async () => {
      emitError({ code: 'microphone_denied' });
      throw new Error('denied');
    });
    const { result } = await render();

    await act(() => result.current.start());

    expect(result.current.status).toBe('denied');
    expect(result.current.errorMessage).toBeNull();
  });

  test('audio_setup_failed and interrupted enter error with their copy', async () => {
    const { result } = await render();
    await act(() => result.current.start());

    await act(async () => emitError({ code: 'audio_setup_failed' }));
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(NATIVE_EAR_ERROR_COPY.audio_setup_failed);

    await act(() => result.current.retry());
    expect(result.current.status).toBe('listening');
    expect(result.current.errorMessage).toBeNull();

    await act(async () => emitError({ code: 'interrupted' }));
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(NATIVE_EAR_ERROR_COPY.interrupted);
  });

  test('a rejected startListening without a denial code enters error', async () => {
    fakeModule.startListening.mockRejectedValueOnce(new Error('boom'));
    const { result } = await render();

    await act(() => result.current.start());

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(NATIVE_EAR_ERROR_COPY.audio_setup_failed);
    // Whatever native kept of the half-started engine is released with the error.
    expect(fakeModule.stopListening).toHaveBeenCalledTimes(1);
  });

  test.each(['audio_setup_failed', 'interrupted'] as const)(
    '%s stops native listening so the error state matches the native state',
    async (code) => {
      const { result } = await render();
      await act(() => result.current.start());
      expect(fakeModule.stopListening).not.toHaveBeenCalled();

      await act(async () => emitError({ code }));

      expect(result.current.status).toBe('error');
      expect(fakeModule.stopListening).toHaveBeenCalledTimes(1);

      // The retry starts native listening afresh and does not stop it again.
      await act(() => result.current.retry());
      expect(fakeModule.startListening).toHaveBeenCalledTimes(2);
      expect(fakeModule.stopListening).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('listening');
    },
  );

  test('an error while not listening neither changes state nor stops native', async () => {
    const { result } = await render();

    await act(async () => emitError({ code: 'interrupted' }));

    expect(result.current.status).toBe('idle');
    expect(fakeModule.stopListening).not.toHaveBeenCalled();
  });

  test('forwards three native frames arriving in one tick as three stream frames', async () => {
    const { result } = await render();
    await act(() => result.current.start());
    const frames: EarFeatures[] = [];
    result.current.earStream.subscribe((f) => frames.push(f));

    await act(async () => {
      for (const t of [0, 20, 40]) {
        emitFeatures({ timestampMs: t, rms: 0.5, low: 0.5, mid: 0.5, high: 0.5 });
      }
    });

    expect(frames.map((f) => f.timestampMs)).toEqual([0, 20, 40]);
  });

  test('stop calls native stopListening and returns to idle', async () => {
    const { result } = await render();
    await act(() => result.current.start());

    await act(async () => result.current.stop());

    expect(fakeModule.stopListening).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  test('backgrounding stops listening and foregrounding restarts it', async () => {
    const { result } = await render();
    await act(() => result.current.start());

    await act(async () => appStateListener?.('background'));
    expect(fakeModule.stopListening).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');

    await act(async () => appStateListener?.('active'));
    expect(fakeModule.startListening).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('listening');
  });

  test('foregrounding does not restart a user-stopped ear', async () => {
    const { result } = await render();
    await act(() => result.current.start());
    await act(async () => result.current.stop());

    await act(async () => appStateListener?.('background'));
    await act(async () => appStateListener?.('active'));

    expect(fakeModule.startListening).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  test('unmount removes native subscriptions and stops listening', async () => {
    const { result, unmount } = await render();
    await act(() => result.current.start());

    await unmount();

    expect(removeFeatures).toHaveBeenCalled();
    expect(removeErrors).toHaveBeenCalled();
    expect(fakeModule.stopListening).toHaveBeenCalled();
  });
});
