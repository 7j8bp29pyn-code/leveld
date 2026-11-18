import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** Reads a picked file (file:// on native, blob:/data: on web) into memory for upload. */
export async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}
