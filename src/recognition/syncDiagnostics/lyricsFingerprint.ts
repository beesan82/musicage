import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from 'expo-crypto';

export async function fingerprintSyncedLyrics(syncedLyrics: string): Promise<string> {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, syncedLyrics);
  return `sha256:${digest}`;
}

export function createDiagnosticId(): string {
  return randomUUID();
}
