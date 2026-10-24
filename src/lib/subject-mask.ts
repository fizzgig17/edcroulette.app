/**
 * The phone's own object finder (Apple Vision on iPhone, iOS 17 and later). It labels every
 * pixel with the object it belongs to, which gives far better outlines than guessing from
 * colours. Not available on Android or the web: null there, and the app falls back to colours.
 */
import { requireOptionalNativeModule } from 'expo';

type Raw = { width: number; height: number; data: string } | null;
const native = requireOptionalNativeModule<{ instanceMask(uri: string, maxEdge: number): Promise<Raw> }>('EdcSubjectMask');

export type InstanceMask = { width: number; height: number; labels: Uint8Array };

export async function findObjects(uri: string, maxEdge = 480): Promise<InstanceMask | null> {
  if (!native) return null;
  try {
    const r = await native.instanceMask(uri, maxEdge);
    if (!r) return null;
    const bin = atob(r.data);
    const labels = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) labels[i] = bin.charCodeAt(i);
    if (labels.length !== r.width * r.height) return null;
    return { width: r.width, height: r.height, labels };
  } catch {
    return null;
  }
}
