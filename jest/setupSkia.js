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
    Skia: {
      ...mock.Skia,
      RuntimeEffect: {
        Make: () => ({ __mockRuntimeEffect: true }),
      },
    },
  };
});
