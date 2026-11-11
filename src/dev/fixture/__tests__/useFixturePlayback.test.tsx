import { act, renderHook } from '@testing-library/react-native';

import { PALETTE_FAMILIES, paletteFamilyKeyFor } from '../../../direction/palettes';
import * as validateDirection from '../../../direction/validateDirection';
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

test('reloadDirection warns and keeps the previous direction when validation fails', async () => {
  const reloaded = { ...FIXTURE_DIRECTION };
  const validate = jest.spyOn(validateDirection, 'validateSongDirection').mockReturnValue(reloaded);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { result } = await renderHook(() => useFixturePlayback(true));

  await act(async () => result.current.reloadDirection());
  expect(result.current.direction).toBe(reloaded);
  expect(warn).not.toHaveBeenCalled();

  validate.mockReturnValue(null);
  await act(async () => result.current.reloadDirection());
  expect(result.current.direction).toBe(reloaded);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]?.[0]).toMatch(/FIXTURE_DIRECTION failed validation/);
});

test('cyclePalette walks the eight families and leaves the line directions alone', async () => {
  const { result } = await renderHook(() => useFixturePlayback(true));
  const keys = PALETTE_FAMILIES.map((f) => f.key);
  const start = keys.indexOf('kohaku');
  expect(paletteFamilyKeyFor(result.current.direction.palette)).toBe('kohaku');

  for (let step = 1; step <= keys.length; step++) {
    await act(async () => result.current.cyclePalette());
    const family = PALETTE_FAMILIES[(start + step) % keys.length]!;
    expect(result.current.direction.palette).toEqual(family.palette);
    expect(result.current.direction.texture).toBe(family.texture);
    expect(result.current.direction.lines).toBe(FIXTURE_DIRECTION.lines);
    expect(result.current.direction.idleGlyphs).toBe(FIXTURE_DIRECTION.idleGlyphs);
  }
  // A full round comes back to kohaku.
  expect(paletteFamilyKeyFor(result.current.direction.palette)).toBe('kohaku');
});

test('cyclePalette does not touch the transport, and RELOAD restores kohaku', async () => {
  const { result } = await renderHook(() => useFixturePlayback(true));
  await act(async () => result.current.toggle());
  const anchor = result.current.anchor;
  await act(async () => result.current.cyclePalette());
  expect(result.current.active).toBe(true);
  expect(result.current.anchor).toBe(anchor);
  expect(paletteFamilyKeyFor(result.current.direction.palette)).toBe('hana');

  await act(async () => result.current.reloadDirection());
  expect(result.current.direction).toEqual(FIXTURE_DIRECTION);
});

test('is inert when disabled', async () => {
  const { result } = await renderHook(() => useFixturePlayback(false));
  await act(async () => result.current.cyclePalette());
  expect(result.current.direction).toBe(FIXTURE_DIRECTION);
  await act(async () => result.current.toggle());
  expect(result.current.enabled).toBe(false);
  expect(result.current.active).toBe(false);
  expect(result.current.anchor).toBeNull();
});
