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

/** For other small stores that live beside the preferences (see lib/categories.ts). */
export const readPref = read;
export const writePref = write;

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

// --- Favorites: how much more likely a starred piece is to come up (1 = no extra chance) -----
export const FAVORITE_BOOSTS = [1, 2, 3, 5] as const;
export type FavoriteBoost = (typeof FAVORITE_BOOSTS)[number];
export const getFavoriteBoost = (): FavoriteBoost => {
  const n = Number(read('edc.favoriteBoost'));
  return (FAVORITE_BOOSTS as readonly number[]).includes(n) ? (n as FavoriteBoost) : 2;
};
export const setFavoriteBoost = (n: FavoriteBoost) => write('edc.favoriteBoost', String(n));
export const useFavoriteBoost = () => useSyncExternalStore(subscribe, getFavoriteBoost, () => 2 as FavoriteBoost);

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

// --- How the collection is shown -----------------------------------------------------------
export type CollectionView = 'list' | 'grid' | 'compact';
export const getCollectionView = (): CollectionView => {
  const v = read('edc.collectionView');
  return v === 'grid' || v === 'compact' ? v : 'list';
};
export const setCollectionView = (v: CollectionView) => write('edc.collectionView', v);
export const useCollectionView = () => useSyncExternalStore(subscribe, getCollectionView, () => 'list' as CollectionView);

// --- Cutout photos: the default style, the angle pieces are set at, and the background ---------------
import type { CutoutBg, CutoutLook, PhotoStyle } from '@/lib/cutout';
export const getPhotoStyle = (): PhotoStyle => (read('edc.photoStyle') === 'original' ? 'original' : 'cutout');
export const setPhotoStyle = (v: PhotoStyle) => write('edc.photoStyle', v);
export const usePhotoStyle = () => useSyncExternalStore(subscribe, getPhotoStyle, () => 'cutout' as PhotoStyle);
export const getCutoutLook = (): CutoutLook => {
  const v = read('edc.cutoutLook');
  return v === 'upright' || v === 'asis' ? v : 'diagonal';
};
export const setCutoutLook = (v: CutoutLook) => write('edc.cutoutLook', v);
export const useCutoutLook = () => useSyncExternalStore(subscribe, getCutoutLook, () => 'diagonal' as CutoutLook);
export const getCutoutBg = (): CutoutBg => {
  const v = read('edc.cutoutBg');
  return v === 'charcoal' || v === 'light' ? v : 'gray';
};
export const setCutoutBg = (v: CutoutBg) => write('edc.cutoutBg', v);
export const useCutoutBg = () => useSyncExternalStore(subscribe, getCutoutBg, () => 'gray' as CutoutBg);

// --- Collection categories folded away -----------------------------------------------------------
let foldedRaw: string | null | undefined;
let foldedList: string[] = [];
export const getFoldedCategories = (): string[] => {
  const raw = read('edc.foldedCategories');
  if (raw === foldedRaw) return foldedList;
  foldedRaw = raw;
  try {
    const v = JSON.parse(raw ?? '[]') as unknown;
    foldedList = Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    foldedList = [];
  }
  return foldedList;
};
export const setFoldedCategories = (list: string[]) => write('edc.foldedCategories', JSON.stringify(list));
export const useFoldedCategories = () => useSyncExternalStore(subscribe, getFoldedCategories, () => [] as string[]);

// --- Whether the app icon follows the chosen metal ---------------------------------------------
export const getIconFollowsMetal = () => read('edc.iconFollows') !== '0';
export const setIconFollowsMetal = (on: boolean) => write('edc.iconFollows', on ? '1' : '0');
export const useIconFollowsMetal = () => useSyncExternalStore(subscribe, getIconFollowsMetal, () => true);

// --- Notes that teach the photo check about the person's gear ---------------------------------
// Short statements ("My black pens are usually zirconium") sent along with photos being identified.
export const MAX_TRAINING_NOTES = 10;
export const MAX_TRAINING_NOTE_CHARS = 200;
let notesRaw: string | null | undefined;
let notesParsed: string[] = [];
export const getTrainingNotes = (): string[] => {
  const raw = read('edc.trainingNotes');
  if (raw !== notesRaw) {
    notesRaw = raw;
    try {
      const v = raw ? JSON.parse(raw) : [];
      notesParsed = Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, MAX_TRAINING_NOTES) : [];
    } catch {
      notesParsed = [];
    }
  }
  return notesParsed;
};
const saveNotes = (list: string[]) => write('edc.trainingNotes', list.length ? JSON.stringify(list) : null);
/** Adds a note; false if it's empty, a repeat, or the list is full. */
export function addTrainingNote(text: string): boolean {
  const note = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TRAINING_NOTE_CHARS);
  const list = getTrainingNotes();
  if (!note || list.length >= MAX_TRAINING_NOTES || list.some((n) => n.toLowerCase() === note.toLowerCase())) return false;
  saveNotes([...list, note]);
  return true;
}
export const removeTrainingNote = (index: number) => saveNotes(getTrainingNotes().filter((_, i) => i !== index));
export const useTrainingNotes = () => useSyncExternalStore(subscribe, getTrainingNotes, () => [] as string[]);

// --- Whether the first-run tour has been shown ------------------------------------------------
export const getTourSeen = () => read('edc.tourSeen') === '1';
export const setTourSeen = (seen: boolean) => write('edc.tourSeen', seen ? '1' : null);
export const useTourSeen = () => useSyncExternalStore(subscribe, getTourSeen, () => true);

// --- The newest build whose "update available" banner was dismissed -----------------------------
export const getUpdateDismissed = () => parseInt(read('edc.updateDismissed') ?? '0', 10) || 0;
export const setUpdateDismissed = (build: number) => write('edc.updateDismissed', String(build));
export const useUpdateDismissed = () => useSyncExternalStore(subscribe, getUpdateDismissed, () => 0);

export { subscribe as subscribePrefs };
