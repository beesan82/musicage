import { File } from 'expo-file-system';

type TemporaryFile = Pick<File, 'delete' | 'exists'>;

export function deleteTemporaryRecording(
  uri: string | null,
  fileFactory: (candidateUri: string) => TemporaryFile = (candidateUri) =>
    new File(candidateUri),
): void {
  if (!uri) return;

  const file = fileFactory(uri);
  if (file.exists) file.delete();
}
