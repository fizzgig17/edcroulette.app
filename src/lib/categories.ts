/**
 * The categories a person works with: the built-in ones (minus any they removed, and Other, which always stays) plus
 * their own. Kept on this phone with the other small settings. Only what was removed and what was added is stored, so
 * categories added to the app later appear on their own.
 */
import { useSyncExternalStore } from 'react';

import { readPref, subscribePrefs, writePref } from '@/lib/preferences';
import { CATEGORIES } from '@/types/models';

export const MAX_CATEGORIES = 30;
export const MAX_CATEGORY_CHARS = 24;
const KEY = 'edc.categories';
const PRESETS: readonly string[] = CATEGORIES;

type Stored = { hidden: string[]; custom: string[] };
type State = Stored & { list: string[] };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []);

let seen: string | null | undefined;
let state: State = build({ hidden: [], custom: [] });

function build({ hidden, custom }: Stored): State {
  const list = [...PRESETS.filter((c) => c !== 'Other' && !hidden.includes(c)), ...custom.filter((c) => !PRESETS.includes(c)), 'Other'];
  return { hidden, custom, list };
}

function current(): State {
  const raw = readPref(KEY);
  if (raw === seen) return state;
  seen = raw;
  let stored: Stored = { hidden: [], custom: [] };
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<Stored> | null;
    if (v) stored = { hidden: strings(v.hidden).filter((c) => PRESETS.includes(c) && c !== 'Other'), custom: strings(v.custom) };
  } catch {
    // Start from the built-in list.
  }
  state = build(stored);
  return state;
}

const save = (s: Stored) => writePref(KEY, JSON.stringify(s));

/** The categories to offer, in order. */
export const getCategories = () => current().list;
export const useCategories = () => useSyncExternalStore(subscribePrefs, getCategories, () => [...PRESETS]);

/** Built-in categories the person removed (they can add them back). */
export const getRemovedCategories = () => current().hidden;
export const useRemovedCategories = () => useSyncExternalStore(subscribePrefs, getRemovedCategories, () => [] as string[]);

export const isBuiltIn = (name: string) => PRESETS.includes(name);

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export type CategoryResult = { ok: true; name: string } | { ok: false; error: string };

/** Adds a category of the person's own (or brings back a built-in one they removed). */
export function addCategory(input: string): CategoryResult {
  const name = clean(input);
  if (!name) return { ok: false, error: 'Type a name for the category.' };
  if (name.length > MAX_CATEGORY_CHARS) return { ok: false, error: `Keep it to ${MAX_CATEGORY_CHARS} letters or fewer.` };
  const s = current();
  const existing = s.list.find((c) => same(c, name));
  if (existing) return { ok: false, error: `${existing} is already in your list.` };
  const removed = s.hidden.find((c) => same(c, name));
  if (removed) {
    save({ hidden: s.hidden.filter((c) => c !== removed), custom: s.custom });
    return { ok: true, name: removed };
  }
  if (s.list.length >= MAX_CATEGORIES) return { ok: false, error: `That’s the most categories (${MAX_CATEGORIES}). Remove one to add another.` };
  save({ hidden: s.hidden, custom: [...s.custom, name] });
  return { ok: true, name };
}

/** Removes a category from the list. Not allowed while pieces or wheels still use it, and never for Other. */
export function removeCategory(name: string, use: { pieces: number; wheels: number }): CategoryResult {
  if (name === 'Other') return { ok: false, error: 'Other always stays, for pieces that don’t fit anywhere else.' };
  if (use.pieces > 0) return { ok: false, error: `${use.pieces} ${use.pieces === 1 ? 'piece is' : 'pieces are'} in ${name}. Move or delete ${use.pieces === 1 ? 'it' : 'them'} first.` };
  if (use.wheels > 0) return { ok: false, error: `A wheel spins ${name}. Change or remove that wheel first.` };
  const s = current();
  if (isBuiltIn(name)) save({ hidden: [...new Set([...s.hidden, name])], custom: s.custom });
  else save({ hidden: s.hidden, custom: s.custom.filter((c) => c !== name) });
  return { ok: true, name };
}

/** Makes sure these categories are on the list (loading sample gear, say, brings its categories back). */
export function ensureCategories(names: readonly string[]) {
  const s = current();
  const hidden = s.hidden.filter((c) => !names.includes(c));
  const custom = [...s.custom];
  for (const n of names) if (!PRESETS.includes(n) && !custom.some((c) => same(c, n)) && s.list.length + custom.length - s.custom.length < MAX_CATEGORIES) custom.push(n);
  if (hidden.length !== s.hidden.length || custom.length !== s.custom.length) save({ hidden, custom });
}
