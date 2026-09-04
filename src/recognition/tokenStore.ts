import * as SecureStore from 'expo-secure-store';

const AUDD_TOKEN_KEY = 'musicage.auddToken';

export async function getAudDToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUDD_TOKEN_KEY);
}

export async function saveAudDToken(rawToken: string): Promise<void> {
  const token = rawToken.trim();

  if (!token) {
    throw new Error('AudD token is required');
  }

  await SecureStore.setItemAsync(AUDD_TOKEN_KEY, token);
}

export async function clearAudDToken(): Promise<void> {
  await SecureStore.deleteItemAsync(AUDD_TOKEN_KEY);
}
