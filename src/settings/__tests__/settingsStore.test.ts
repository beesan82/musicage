const mockFile = { exists: true, text: jest.fn(), write: jest.fn() };

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => mockFile),
  Paths: { document: 'doc' },
}));

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settingsStore';

beforeEach(() => {
  mockFile.exists = true;
  mockFile.text.mockReset();
  mockFile.write.mockReset();
});

describe('settingsStore', () => {
  test('returns defaults when the file is missing or malformed', async () => {
    mockFile.exists = false;
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);

    mockFile.exists = true;
    mockFile.text.mockResolvedValue('{not json');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);

    mockFile.text.mockResolvedValue('{"autoRecognize":"yes"}');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);

    mockFile.text.mockRejectedValue(new Error('io'));
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('round-trips autoRecognize', async () => {
    await saveSettings({ autoRecognize: false });
    const written = mockFile.write.mock.calls[0][0] as string;
    mockFile.text.mockResolvedValue(written);
    expect(await loadSettings()).toEqual({ autoRecognize: false });
  });
});
