/**
 * Small settings kept on this phone (the same storage as the theme choice):
 * sound on/off, spin style, whether photos and item details may go to the AI
 * service, and a random device id used only to rate-limit the shared services.
 */
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const cache = new Map<string, string | null>();

function read(key: string): string | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  let v: string | null = null;
  try {
    v = globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    v = null;
  }
  cache.set(key, v);
  return v;
}

function write(key: string, value: string | null) {
  cache.set(key, value);
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // Not remembered, still applied until the app closes.
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// --- Sound ------------------------------------------------------------------
export const getSoundOn = () => read('edc.sound') !== '0';
export const setSoundOn = (on: boolean) => write('edc.sound', on ? '1' : '0');
export const useSoundOn = () => useSyncExternalStore(subscribe, getSoundOn, () => true);

// --- Spin style: random, or AI picks pieces that go well together -----------------
export type SpinStyle = 'random' | 'coordinated';
export const getSpinStyle = (): SpinStyle => (read('edc.spinStyle') === 'coordinated' ? 'coordinated' : 'random');
export const setSpinStyle = (s: SpinStyle) => write('edc.spinStyle', s);
export const useSpinStyle = () => useSyncExternalStore(subscribe, getSpinStyle, () => 'random' as SpinStyle);

// --- AI permission: null = not asked yet ------------------------------------------
export type AiConsent = 'allowed' | 'declined' | null;
export const getAiConsent = (): AiConsent => {
  const v = read('edc.ai');
  return v === 'allowed' || v === 'declined' ? v : null;
};
export const setAiConsent = (v: AiConsent) => write('edc.ai', v);
export const useAiConsent = () => useSyncExternalStore(subscribe, getAiConsent, () => null as AiConsent);

// --- Device id (random, never tied to a person) -----------------------------------
export function deviceId(): string {
  let id = read('edc.device');
  if (!id) {
    id = Crypto.randomUUID();
    write('edc.device', id);
  }
  return id;
}

// --- Metal for the Spin button and wheel trim ------------------------------------
export const getMetalId = (): string => read('edc.metal') ?? 'damascus';
export const setMetalId = (id: string) => write('edc.metal', id);
export const useMetalId = () => useSyncExternalStore(subscribe, getMetalId, () => 'damascus');
