import { lightHexFor, PALETTE_FAMILIES } from '../../direction/palettes';
import {
  beatLift,
  followToward,
  frame,
  IDLE_FOCUS,
  lampPool,
  lampTarget,
  litColor,
  surface,
  voidSurface,
} from '../surfaceModel';
import type { Uv } from '../surfaceModel';
import { hexToRgb01, SURFACE_CONSTANTS } from '../textureShader';
import type { Rgb01 } from '../textureShader';
import { VOID_LAMP } from '../void';

// The visual overhaul's numeric targets for the lit surface (spec §3b.1,
// §5 T3), held on the TS twin of the shader prelude. Levels are 8-bit sRGB
// values averaged over R, G and B (what ImageMagick's %[mean] reports for a
// screenshot, spec §5 D1). The screen is a 390 x 844 pt iPhone.
const ASPECT = 844 / 390;
const FOCUS: Uv = IDLE_FOCUS;
const level = (rgb: Rgb01) => ((rgb[0] + rgb[1] + rgb[2]) / 3) * 255;
const maxChannel = (rgb: Rgb01) => Math.max(...rgb) * 255;
const CORNERS: Uv[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];
/** The centres of a 16 x 16 grid over the screen. */
const GRID: Uv[] = Array.from({ length: 256 }, (_, i) => ({ x: ((i % 16) + 0.5) / 16, y: (Math.floor(i / 16) + 0.5) / 16 }));

const families = PALETTE_FAMILIES.map((family) => ({
  key: family.key,
  background: hexToRgb01(family.palette.background),
  light: hexToRgb01(lightHexFor(family.palette)),
}));

const lit = (
  f: (typeof families)[number],
  uv: Uv,
  lamp: number,
  pulse = 0,
  confidence = 0,
  kind: 'surface' | 'void' = 'surface',
) => litColor(uv, FOCUS, ASPECT, f.background, f.light, lamp, pulse, confidence, kind);

const meanLevel = (f: (typeof families)[number], lamp: number) =>
  GRID.reduce((sum, uv) => sum + level(lit(f, uv, lamp)), 0) / GRID.length;

test('the focus starts a little above the centre', () => {
  expect(IDLE_FOCUS).toEqual({ x: 0.5, y: 0.42 });
});

test('the pool is 1 at the focus, round on screen, and gone at LAMP_RADIUS screen widths', () => {
  expect(lampPool(FOCUS, FOCUS, ASPECT)).toBe(1);
  const across = { x: FOCUS.x + 0.3, y: FOCUS.y };
  const down = { x: FOCUS.x, y: FOCUS.y + 0.3 / ASPECT };
  expect(lampPool(across, FOCUS, ASPECT)).toBeCloseTo(lampPool(down, FOCUS, ASPECT), 10);
  expect(lampPool({ x: FOCUS.x, y: FOCUS.y + SURFACE_CONSTANTS.LAMP_RADIUS / ASPECT }, FOCUS, ASPECT)).toBeCloseTo(0, 10);
  expect(lampPool({ x: FOCUS.x, y: FOCUS.y + (SURFACE_CONSTANTS.LAMP_RADIUS * 1.01) / ASPECT }, FOCUS, ASPECT)).toBe(0);
});

test('the frame is 1 in the middle and sinks the corners by FRAME_DARK at most', () => {
  expect(frame({ x: 0.5, y: 0.5 })).toBe(1);
  for (const corner of CORNERS) {
    expect(frame(corner)).toBeLessThan(1);
    expect(frame(corner)).toBeGreaterThanOrEqual(1 - SURFACE_CONSTANTS.FRAME_DARK);
  }
});

describe.each(families)('the $key family', (f) => {
  test('the lamp centre stays at or under 42/255 with the lamp fully open', () => {
    expect(level(lit(f, FOCUS, 1))).toBeLessThanOrEqual(42);
  });

  test('the corners sit at or under 12/255 even with the lamp fully open', () => {
    for (const corner of CORNERS) {
      expect(level(lit(f, corner, 1))).toBeLessThanOrEqual(12);
    }
  });

  test('the screen mean (16 x 16 samples) is 18..22/255 at a typical lamp of 0.65', () => {
    const mean = meanLevel(f, 0.65);
    expect(mean).toBeGreaterThanOrEqual(18);
    expect(mean).toBeLessThanOrEqual(22);
  });

  test('in silence (lamp 0) the centre is the ground plus LAMP_BASE of the light, nothing more', () => {
    const centre = surface(FOCUS, FOCUS, ASPECT, f.background, f.light, 0);
    for (const c of [0, 1, 2] as const) {
      expect(centre[c]).toBeCloseTo(f.background[c] + f.light[c] * SURFACE_CONSTANTS.LAMP_BASE, 10);
    }
  });

  test('the beat lifts at most 5/255 anywhere, and under 15% of the centre at its dimmest', () => {
    const lifts = [FOCUS, ...CORNERS, ...GRID].map((uv) => {
      const still = lit(f, uv, 0);
      const beat = lit(f, uv, 0, 1, 1);
      return [beat[0] - still[0], beat[1] - still[1], beat[2] - still[2]] as Rgb01;
    });
    for (const lift of lifts) {
      expect(maxChannel(lift)).toBeLessThanOrEqual(5);
    }
    // At the centre, against the shut lamp (the dimmest centre a beat can land on).
    const centreLift = beatLift(FOCUS, FOCUS, ASPECT, f.light, 1, 1);
    expect(level(centreLift) / level(lit(f, FOCUS, 0))).toBeLessThanOrEqual(0.15);
    // The lift lives in the pool: none at the corners.
    for (const corner of CORNERS) {
      expect(maxChannel(beatLift(corner, FOCUS, ASPECT, f.light, 1, 1))).toBe(0);
    }
  });

  test('the beat lift is gated by the confidence', () => {
    expect(level(beatLift(FOCUS, FOCUS, ASPECT, f.light, 1, 0))).toBe(0);
    expect(level(beatLift(FOCUS, FOCUS, ASPECT, f.light, 1, 0.5))).toBeCloseTo(
      level(beatLift(FOCUS, FOCUS, ASPECT, f.light, 1, 1)) / 2,
      10,
    );
  });

  test("the void's sharper lamp: centre 36..44/255 fully open, corners at or under 12/255", () => {
    const centre = level(lit(f, FOCUS, 1, 0, 0, 'void'));
    expect(centre).toBeGreaterThanOrEqual(36);
    expect(centre).toBeLessThanOrEqual(44);
    for (const corner of CORNERS) {
      expect(level(lit(f, corner, 1, 0, 0, 'void'))).toBeLessThanOrEqual(12);
    }
  });
});

test("the void's pool is gathered: off-centre it is darker than the shared surface's, at the centre brighter", () => {
  const [f] = families;
  const off = { x: FOCUS.x + 0.3, y: FOCUS.y };
  const lampShare = (rgb: Rgb01) => level(rgb) - level(f!.background);
  const shared = lampShare(surface(off, FOCUS, ASPECT, f!.background, f!.light, 0.65));
  const sharp = lampShare(voidSurface(off, FOCUS, ASPECT, f!.background, f!.light, 0.65));
  const pool = lampPool(off, FOCUS, ASPECT);
  expect(sharp / shared).toBeCloseTo(
    (pool ** VOID_LAMP.POWER * (VOID_LAMP.BASE + 0.65 * SURFACE_CONSTANTS.LAMP_GAIN)) /
      (pool * (SURFACE_CONSTANTS.LAMP_BASE + 0.65 * SURFACE_CONSTANTS.LAMP_GAIN)),
    10,
  );
  expect(level(voidSurface(FOCUS, FOCUS, ASPECT, f!.background, f!.light, 0.65))).toBeGreaterThan(
    level(surface(FOCUS, FOCUS, ASPECT, f!.background, f!.light, 0.65)),
  );
});

describe("the lamp's followers (UI thread)", () => {
  test('the lamp shuts in silence and opens from 0.3 to 1 with the energy', () => {
    expect(lampTarget(1, 0)).toBe(0);
    expect(lampTarget(1, 1)).toBe(0);
    expect(lampTarget(0, 0)).toBeCloseTo(0.3, 10);
    expect(lampTarget(0, 0.5)).toBeCloseTo(0.65, 10);
    expect(lampTarget(0, 1)).toBeCloseTo(1, 10);
    expect(lampTarget(0, 5)).toBeCloseTo(1, 10);
    expect(lampTarget(0, -1)).toBeCloseTo(0.3, 10);
  });

  test('followToward is a first-order step: 63% of the way after one time constant, still without time', () => {
    expect(followToward(0, 1, 800, 800)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(followToward(0.4, 0.4, 16, 800)).toBe(0.4);
    expect(followToward(0.2, 1, 0, 800)).toBe(0.2);
    // Many small frames land where one long step does.
    let v = 0;
    for (let i = 0; i < 50; i += 1) v = followToward(v, 1, 16, 600);
    expect(v).toBeCloseTo(followToward(0, 1, 800, 600), 10);
  });
});
