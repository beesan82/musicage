import { act, renderHook } from '@testing-library/react-native';

import { FIXTURE_DIRECTION } from '../fixtureSong';
import { fixturePositionMs, useFixturePlayback } from '../useFixturePlayback';

let nowMs = 1_000;

beforeEach(() => {
  nowMs = 1_000;
  jest.spyOn(performance, 'now').mockImplementation(() => nowMs);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('toggle activates with anchor offset 0 and deactivates back to null', async () => {
  const { result } = await renderHook(() => useFixturePlayback(true));
  expect(result.current.active).toBe(false);
  expect(result.current.anchor).toBeNull();

  await act(async () => result.current.toggle());
  expect(result.current.active).toBe(true);
  expect(result.current.anchor).toEqual({ offsetMs: 0, anchoredAtMonotonicMs: 1_000 });

  await act(async () => result.current.toggle());
  expect(result.current.active).toBe(false);
  expect(result.current.anchor).toBeNull();
});

test('playPause freezes the position and resumes from it', async () => {
  const { result } = await renderHook(() => useFixturePlayback(true));
  await act(async () => result.current.toggle());

  nowMs = 13_000;
  await act(async () => result.current.playPause());
  expect(result.current.paused).toBe(true);
  expect(result.current.anchor?.offsetMs).toBe(12_000);

  nowMs = 20_000;
  expect(fixturePositionMs(result.current, nowMs)).toBe(12_000);

  await act(async () => result.current.playPause());
  expect(result.current.paused).toBe(false);
  expect(result.current.anchor).toEqual({ offsetMs: 12_000, anchoredAtMonotonicMs: 20_000 });
  expect(fixturePositionMs(result.current, 22_000)).toBe(14_000);
});

test('seek moves the position by the delta, clamped at 0, playing or paused', async () => {
  const { result } = await renderHook(() => useFixturePlayback(true));
  await act(async () => result.current.toggle());

  nowMs = 11_000;
  await act(async () => result.current.seek(5_000));
  expect(fixturePositionMs(result.current, nowMs)).toBe(15_000);

  await act(async () => result.current.seek(-5_000));
  expect(fixturePositionMs(result.current, nowMs)).toBe(10_000);

  await act(async () => result.current.playPause());
  await act(async () => result.current.seek(-50_000));
  expect(result.current.anchor?.offsetMs).toBe(0);
  await act(async () => result.current.seek(5_000));
  expect(fixturePositionMs(result.current, nowMs + 9_000)).toBe(5_000);
});

test('reloadDirection re-validates and keeps the fixture direction', async () => {
  const { result } = await renderHook(() => useFixturePlayback(true));
  await act(async () => result.current.reloadDirection());
  expect(result.current.direction).toEqual(FIXTURE_DIRECTION);
});

test('is inert when disabled', async () => {
  const { result } = await renderHook(() => useFixturePlayback(false));
  await act(async () => result.current.toggle());
  expect(result.current.enabled).toBe(false);
  expect(result.current.active).toBe(false);
  expect(result.current.anchor).toBeNull();
});
