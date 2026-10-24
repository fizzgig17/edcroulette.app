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

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** A square cut from a picked photo, in that photo's own pixels. */
export interface PhotoCrop {
  originX: number;
  originY: number;
  size: number;
}

/** Lets the person pick or take a photo; returns it as picked (not yet saved or cropped), or null if they cancelled. */
export async function pickPhoto(source: PhotoSource): Promise<PickedPhoto | null> {
  // The framing is done in the app's own crop screen (PhotoCropper); iOS's built-in
  // editor doesn't crop when picking from the library.
  // Current: hand back the photo as the phone stores it. Asking iOS to convert it first (to JPEG,
  // at full size) is what made the picker sit there for seconds after you chose; the framing
  // step below decodes any format itself.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    exif: false,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access is off. You can turn it on in Settings.');
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const a = result.assets?.[0];
  if (result.canceled || !a) return null;
  return { uri: a.uri, width: a.width, height: a.height };
}

/** Crops (if asked), shrinks and saves a picked photo; returns the stored name ("gear-photos/x.jpg"). */
export async function savePhoto(photo: PickedPhoto, crop?: PhotoCrop, maxEdge: number = MAX_EDGE): Promise<string> {
  const ctx = ImageManipulator.manipulate(photo.uri);
  let edge = Math.max(photo.width, photo.height);
  if (crop) {
    const size = Math.max(1, Math.round(Math.min(crop.size, photo.width, photo.height)));
    ctx.crop({
      originX: Math.max(0, Math.min(photo.width - size, Math.round(crop.originX))),
      originY: Math.max(0, Math.min(photo.height - size, Math.round(crop.originY))),
      width: size,
      height: size,
    });
    edge = size;
  }
  if (edge > maxEdge) ctx.resize(crop || photo.width >= photo.height ? { width: maxEdge } : { height: maxEdge });
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
