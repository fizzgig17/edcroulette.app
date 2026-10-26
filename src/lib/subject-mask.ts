/**
 * The phone's own object finder: Apple Vision on iPhone (iOS 17 and later), Google's subject
 * segmentation on Android. It labels every pixel with the object it belongs to, which gives far
 * better outlines than guessing from colours. Not available on the web (or while Android is still
 * downloading its model): null there, and the app falls back to colours.
 */
import { requireOptionalNativeModule } from 'expo';
import { NativeModules } from 'react-native';

import { log } from '@/lib/log';

type Raw = { width: number; height: number; data: string } | null;
type Finder = { instanceMask(uri: string, maxEdge: number): Promise<Raw> };
const native = requireOptionalNativeModule<Finder>('EdcSubjectMask') ?? ((NativeModules.EdcSubjectMask as Finder | undefined) || null);

export type InstanceMask = { width: number; height: number; labels: Uint8Array };

/** Why the last call found nothing, for the test builds to show. */
export let lastMaskProblem: string | null = null;

export async function findObjects(uri: string, maxEdge = 480): Promise<InstanceMask | null> {
  lastMaskProblem = null;
  const t0 = Date.now();
  if (!native) {
    lastMaskProblem = 'no object finder in this build';
    log('finder.fail', { reason: lastMaskProblem });
    return null;
  }
  try {
    const r = await native.instanceMask(uri, maxEdge);
    if (!r) {
      lastMaskProblem = 'empty answer';
      return null;
    }
    const bin = atob(r.data);
    const labels = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) labels[i] = bin.charCodeAt(i);
    if (labels.length !== r.width * r.height) {
      lastMaskProblem = 'wrong size';
      return null;
    }
    log('finder.ok', { ms: Date.now() - t0, w: r.width, h: r.height });
    return { width: r.width, height: r.height, labels };
  } catch (e) {
    lastMaskProblem = e instanceof Error ? e.message : String(e);
    log('finder.fail', { reason: lastMaskProblem, ms: Date.now() - t0 });
    return null;
  }
}
