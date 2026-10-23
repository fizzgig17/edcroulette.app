/**
 * Gear photos for the free tier: picked or taken with the camera, shrunk, and
 * saved in the app's own documents folder (the picker's copy lives in a cache
 * the system can clear). Photos stay on the phone.
 */
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const MAX_EDGE = 1280;

function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'gear-photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export type PhotoSource = 'camera' | 'library';

/** Lets the person pick or take a photo; returns the saved file's URI, or null if they cancelled. */
export async function choosePhoto(source: PhotoSource): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access is off. You can turn it on in Settings.');
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  return savePhoto(result.assets[0].uri, result.assets[0].width, result.assets[0].height);
}

async function savePhoto(uri: string, width: number, height: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_EDGE) {
    ctx.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const dest = new File(photosDir(), `${Crypto.randomUUID()}.jpg`);
  new File(out.uri).move(dest);
  return dest.uri;
}

/** Removes a photo this app saved. Ignores anything outside its own folder. */
export function deletePhoto(uri: string | null | undefined) {
  if (!uri || !uri.includes('/gear-photos/')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

/** Removes every saved photo (used by "Erase everything"). */
export function deleteAllPhotos() {
  try {
    const dir = new Directory(Paths.document, 'gear-photos');
    if (dir.exists) dir.delete();
  } catch {
    // Nothing to remove.
  }
}
