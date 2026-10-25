/**
 * "Is there a newer version?" for the store builds (TestFlight on iOS, Google Play on Android).
 * Neither store has a public lookup, so each production build publishes a GitHub release
 * (ios-prod-latest / android-prod-latest) whose body has "build: <number>" and "version: <x>" lines.
 * The app compares that build number with its own. Development builds never check.
 */
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { IS_DEV_BUILD } from '@/lib/env';

const REPO = 'fizzgig17/edcroulette.app';
const TAG = Platform.OS === 'ios' ? 'ios-prod-latest' : 'android-prod-latest';
/** The release is published when the build starts or uploads; the store needs a while to offer it. */
const STORE_DELAY_MS = 30 * 60 * 1000;

export interface UpdateInfo {
  available: boolean;
  latest: number;
  version: string;
  installed: number;
}

export function installedBuild(): number {
  const v = Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : Constants.expoConfig?.android?.versionCode;
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Production installs from a store that know their own build number. */
export const updatesSupported = (Platform.OS === 'ios' || Platform.OS === 'android') && !IS_DEV_BUILD && installedBuild() > 0;

export function parseRelease(rel: { name?: string; body?: string } | null): { build: number; version: string } | null {
  const text = `${rel?.name ?? ''}\n${rel?.body ?? ''}`;
  const b = /^\s*build:\s*(\d+)\s*$/im.exec(text);
  if (!b) return null;
  const v = /^\s*version:\s*([0-9][0-9.]*)\s*$/im.exec(text);
  return { build: parseInt(b[1], 10), version: v ? v[1] : '' };
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const installed = installedBuild();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, { headers: { Accept: 'application/vnd.github+json' }, signal: ctl.signal });
    if (res.status === 404) return { available: false, latest: 0, version: '', installed };
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const rel = await res.json();
    const parsed = parseRelease(rel);
    if (!parsed) throw new Error('Could not read the build number from the release.');
    const age = Date.now() - Date.parse(rel.published_at ?? rel.created_at ?? '');
    const old = Number.isFinite(age) ? age > STORE_DELAY_MS : true;
    return { available: installed > 0 && parsed.build > installed && old, latest: parsed.build, version: parsed.version, installed };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    throw new Error(err?.name === 'AbortError' ? 'Timed out reaching the update service.' : (err?.message ?? 'Check failed.'));
  } finally {
    clearTimeout(timer);
  }
}

/** Opens the TestFlight app (iOS) or this app's Play Store page (Android), where the update is installed. */
export async function openStore(): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      await Linking.openURL('itms-beta://');
    } catch {
      await Linking.openURL('https://testflight.apple.com/').catch(() => {});
    }
    return;
  }
  try {
    await Linking.openURL('market://details?id=app.edcroulette.android');
  } catch {
    await Linking.openURL('https://play.google.com/store/apps/details?id=app.edcroulette.android').catch(() => {});
  }
}
