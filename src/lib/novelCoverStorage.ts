import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import type { ImagePickerAsset } from 'expo-image-picker';

const COVER_DIRECTORY = `${FileSystem.documentDirectory ?? ''}novel-covers/`;

function extensionForAsset(asset: ImagePickerAsset) {
  const fileExtension = asset.fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  if (fileExtension) return fileExtension.toLowerCase();

  const uriExtension = asset.uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1];
  if (uriExtension) return uriExtension.toLowerCase();

  const mimeExtension = asset.mimeType?.match(/^image\/([a-zA-Z0-9]+)$/)?.[1];
  if (mimeExtension) return mimeExtension === 'jpeg' ? 'jpg' : mimeExtension.toLowerCase();
  return 'jpg';
}

export async function persistNovelCover(
  novelId: string,
  asset: ImagePickerAsset,
): Promise<string> {
  if (Platform.OS === 'web') {
    if (asset.base64) {
      return `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
    }
    return asset.uri;
  }

  if (!FileSystem.documentDirectory) {
    throw new Error('Persistent device storage is unavailable.');
  }

  await FileSystem.makeDirectoryAsync(COVER_DIRECTORY, { intermediates: true });
  const safeNovelId = novelId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const destination = `${COVER_DIRECTORY}${safeNovelId}-${Date.now()}.${extensionForAsset(asset)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: destination });
  return destination;
}

export async function deleteNovelCover(uri?: string): Promise<void> {
  if (!uri || !FileSystem.documentDirectory || !uri.startsWith(COVER_DIRECTORY)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
