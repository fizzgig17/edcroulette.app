/**
 * Brand list and forgiving matching. The app ships a starter list
 * (content/brands.json, the same one seeded in the database) and adds the
 * brands approved since, fetched once a day. Matching tolerates typos, spacing,
 * accents and aliases, so "bench made", "Spydercoo" and "leathrman" all find
 * the right brand even without a connection.
 */
import { useEffect, useState } from 'react';

import starter from '@/content/brands.json';
import { fetchApprovedBrands } from '@/lib/api';

export interface Brand {
  name: string;
  aliases: string[];
  categories: string[];
}

export const brandKey = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i += 1) out.add(p.slice(i, i + 3));
  return out;
}

function trigramSimilarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  let shared = 0;
  for (const t of x) if (y.has(t)) shared += 1;
  return shared / (x.size + y.size - shared || 1);
}

/** 0 to 1: how close two brand keys are (edit distance, or trigram overlap a little discounted). */
export function closeness(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const base = Math.max(trigramSimilarity(a, b) * 0.85, 1 - levenshtein(a.slice(0, 100), b.slice(0, 100)) / Math.max(a.length, b.length));
  // Typos rarely hit the first letters, so a shared start is a good sign.
  return a.slice(0, 2) === b.slice(0, 2) ? Math.min(1, base + 0.05) : base;
}

export interface BrandMatch {
  name: string;
  score: number;
}

/** The best matches for what was typed, best first. Typing the start of a name counts as a match. */
export function matchBrands(query: string, brands: Brand[], limit = 5, category?: string): BrandMatch[] {
  const k = brandKey(query);
  if (k.length < 2) return [];
  const scored: BrandMatch[] = [];
  for (const b of brands) {
    let score = 0;
    for (const n of [b.name, ...b.aliases]) {
      const nk = brandKey(n);
      if (!nk) continue;
      let s = closeness(nk, k);
      if (nk.startsWith(k) && k.length >= 2) s = Math.max(s, 0.85 + Math.min(0.1, k.length / nk.length / 10));
      if (s > score) score = s;
    }
    // A small nudge toward brands known for this kind of item.
    if (category && score > 0.3 && b.categories.includes(category)) score = Math.min(1, score + 0.03);
    if (score >= 0.45) scored.push({ name: b.name, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

// --- The list in use: starter + approved since ------------------------------------
const CACHE_KEY = 'edc.brands.v1';
const DAY = 24 * 60 * 60 * 1000;
let merged: Brand[] | null = null;

function mergeLists(extra: Brand[]): Brand[] {
  const byKey = new Map<string, Brand>();
  for (const b of [...(starter as Brand[]), ...extra]) {
    const k = brandKey(b.name);
    if (!byKey.has(k)) byKey.set(k, b);
  }
  return [...byKey.values()];
}

function cached(): { at: number; brands: Brand[] } | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as { at: number; brands: Brand[] }) : null;
  } catch {
    return null;
  }
}

/** Starter brands plus any cached approved ones (instant, works offline). */
export function currentBrands(): Brand[] {
  if (!merged) merged = mergeLists(cached()?.brands ?? []);
  return merged;
}

/** Refreshes the approved list from the server at most once a day. Never throws. */
export async function refreshBrands(): Promise<void> {
  const c = cached();
  if (c && Date.now() - c.at < DAY) return;
  const fresh = await fetchApprovedBrands();
  if (!fresh) return;
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), brands: fresh }));
  } catch {
    // Not cached; used for this session only.
  }
  merged = mergeLists(fresh);
}

/** The brand list for a screen; updates itself once the daily refresh finishes. */
export function useBrands(): Brand[] {
  const [brands, setBrands] = useState(currentBrands);
  useEffect(() => {
    let alive = true;
    refreshBrands().then(() => alive && setBrands(currentBrands()));
    return () => {
      alive = false;
    };
  }, []);
  return brands;
}
