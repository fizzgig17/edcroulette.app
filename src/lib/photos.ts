/**
 * Gear photos for the free tier: picked or taken with the camera, shrunk, and
 * saved in the app's own documents folder (the picker's copy lives in a cache
 * the system can clear). Photos stay on the phone.
 *
 * The database stores only the file's name inside the app ("gear-photos/x.jpg"),
 * never the full path: iOS can move the app's folder between installs and
 * updates, which would break full paths. photoUri() turns a stored name back
 * into a path that's valid right now.
 */
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const MAX_EDGE = 1280;
const FOLDER = 'gear-photos';

/** A displayable file URI for a stored photo (also accepts older full-path values). */
export function photoUri(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const i = stored.lastIndexOf(`${FOLDER}/`);
  if (i === -1) return stored.includes('://') ? stored : null;
  return new File(Paths.document, stored.slice(i)).uri;
}

function photosDir(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export type PhotoSource = 'camera' | 'library';

/** Lets the person pick or take a photo; returns the stored name ("gear-photos/x.jpg"), or null if they cancelled. */
export async function choosePhoto(source: PhotoSource, onPicked?: () => void): Promise<string | null> {
  // No crop screen: iOS's editor misbehaved inside the form sheet (taps only landing on one
  // side, photos not coming back), and the whole frame gives photo identify more to go on.
  // Thumbnails fill their square from the middle of the photo anyway. The photo is left as the
  // phone has it (no full-size conversion, which took seconds); shrinking below handles any format.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access is off. You can turn it on in Settings.');
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  onPicked?.(); // the picker is closed; shrinking and saving still takes a moment
  return savePhoto(result.assets[0].uri, result.assets[0].width, result.assets[0].height);
}

async function savePhoto(uri: string, width: number, height: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_EDGE) {
    ctx.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const name = `${Crypto.randomUUID()}.jpg`;
  const dest = new File(photosDir(), name);
  // copy() is asynchronous in Expo 57: wait for it, or the photo may not be there yet.
  await new File(out.uri).copy(dest);
  try {
    new File(out.uri).delete();
  } catch {
    // The cache copy is cleaned up by the system anyway.
  }
  if (!dest.exists) throw new Error('The photo could not be saved.');
  return `${FOLDER}/${name}`;
}

/** Removes a photo this app saved. Ignores anything outside its own folder. */
export function deletePhoto(stored: string | null | undefined) {
  const uri = photoUri(stored);
  if (!uri || !uri.includes(`/${FOLDER}/`)) return;
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
    const dir = new Directory(Paths.document, FOLDER);
    if (dir.exists) dir.delete();
  } catch {
    // Nothing to remove.
  }
}

/** A stored photo as base64 (for sending to photo identify), or null if it can't be read. */
export async function photoBase64(stored: string | null | undefined): Promise<string | null> {
  const uri = photoUri(stored);
  if (!uri) return null;
  try {
    return await new File(uri).base64();
  } catch {
    return null;
  }
}
