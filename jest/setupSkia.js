// Worklets has no JS fallback for its native module under jest; the package
// ships a mock that keeps Reanimated's JS runtime working on the test thread.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// Skia has no JS-only renderer, so under jest we use the mock the package ships.
// The mock expects CanvasKit for anything that touches real drawing APIs; the
// scenes only need `Skia.RuntimeEffect.Make` plus the declarative components,
// so we stub the shader compiler and keep everything else from the mock.
jest.mock('@shopify/react-native-skia', () => {
  const { Mock } = require('@shopify/react-native-skia/lib/commonjs/mock');
  const mock = Mock(undefined);

  return {
    ...mock,
    useTypeface: () => ({ __mockTypeface: true }),
    Skia: {
      ...mock.Skia,
      Font: (typeface, size) => ({
        measureText: (t) => ({ width: size * [...t].length, height: size }),
        // Advances: one glyph per code point, each sizePx wide (as measureText).
        getGlyphIDs: (t) => [...t].map((c) => c.codePointAt(0)),
        getGlyphWidths: (ids) => ids.map(() => size),
        getMetrics: () => ({ ascent: -size * 0.88, descent: size * 0.12 }),
        getSize: () => size,
      }),
      RuntimeEffect: {
        Make: () => ({ __mockRuntimeEffect: true }),
      },
    },
  };
});
