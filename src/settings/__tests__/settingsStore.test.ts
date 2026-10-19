const mockFile = { exists: true, text: jest.fn(), write: jest.fn(), create: jest.fn() };

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => mockFile),
  Paths: { document: 'doc' },
}));

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settingsStore';

beforeEach(() => {
  mockFile.exists = true;
  mockFile.text.mockReset();
  mockFile.write.mockReset();
  mockFile.create.mockReset();
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

  test('saveSettings creates a missing file and returns true', async () => {
    mockFile.exists = false;
    expect(await saveSettings({ autoRecognize: true })).toBe(true);
    expect(mockFile.create).toHaveBeenCalledTimes(1);
    expect(mockFile.write).toHaveBeenCalledTimes(1);
  });

  test('saveSettings does not create an existing file', async () => {
    mockFile.exists = true;
    await saveSettings({ autoRecognize: true });
    expect(mockFile.create).not.toHaveBeenCalled();
  });

  test('saveSettings resolves false when write throws', async () => {
    mockFile.write.mockImplementation(() => {
      throw new Error('disk');
    });
    expect(await saveSettings({ autoRecognize: true })).toBe(false);
    mockFile.write.mockReset();
  });
});
