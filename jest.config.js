const expoPreset = require('jest-expo/jest-preset');

// jest-expo already transforms react-native-* packages (which covers Reanimated
// and Worklets); Skia ships ESM under @shopify, so it has to be added.
const transformIgnorePatterns = expoPreset.transformIgnorePatterns.map((pattern) =>
  pattern.replace('(?!(', '(?!(@shopify/react-native-skia|'),
);

module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest/setupSkia.js'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.worktrees/'],
  transformIgnorePatterns,
};
