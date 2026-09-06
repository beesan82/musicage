import * as SecureStore from 'expo-secure-store';

import { clearAudDToken, getAudDToken, saveAudDToken } from '../tokenStore';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

describe('tokenStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trims before storing the owner token', async () => {
    await saveAudDToken('  owner-token  ');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('musicage.auddToken', 'owner-token');
  });

  it('rejects blank input without writing storage', async () => {
    await expect(saveAudDToken('  ')).rejects.toThrow('AudD token is required');

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('reads null and clears the same private key', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(getAudDToken()).resolves.toBeNull();
    await clearAudDToken();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('musicage.auddToken');
  });
});
