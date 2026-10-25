/**
 * The collection, slots and last spin for the screens, backed by the phone's
 * database (lib/db.ts). Free tier rules live here: at most FREE_MAX_ITEMS gear
 * items and FREE_MAX_SLOTS slots.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { SAMPLE_GEAR } from '@/content/sample-gear';
import * as db from '@/lib/db';
import { FREE_MAX_SLOTS, MAX_ITEMS, MIN_SLOTS } from '@/lib/limits';
import { deleteAllPhotos, deletePhoto } from '@/lib/photos';
import type { GearDraft, GearItem, SlotConfig, SpinPick, SpinRecord } from '@/types/models';

export type Result = { ok: true } | { ok: false; error: string };

/** A wheel to save. `from` is the wheel's current index, so the last spin's result follows it when wheels are reordered. */
export type SlotDraft = { category: string; lockedItemId: string | null; from?: number };

type GearState = {
  loading: boolean;
  items: GearItem[];
  slots: SlotConfig[];
  lastSpin: SpinRecord | null;
  maxItems: number;
  maxSlots: number;
  /** Items the person added themselves (the free limit counts these, not sample gear). */
  ownCount: number;
  sampleCount: number;
  addSamples: () => Promise<number>;
  removeSamples: () => Promise<void>;
  itemById: (id: string | null | undefined) => GearItem | null;
  addItem: (draft: GearDraft) => Promise<Result & { item?: GearItem }>;
  updateItem: (id: string, draft: GearDraft) => Promise<Result>;
  removeItem: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  setLock: (slotIndex: number, itemId: string | null) => Promise<void>;
  saveSlots: (slots: SlotDraft[]) => Promise<Result>;
  recordSpin: (picks: SpinPick[]) => Promise<void>;
  eraseEverything: () => Promise<void>;
};

const GearContext = createContext<GearState | null>(null);

const sortGear = (list: GearItem[]) =>
  [...list].sort((a, b) => a.category.localeCompare(b.category) || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

export function GearProvider({ children }: { children: ReactNode }) {
  const sqlite = useSQLiteContext();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<GearItem[]>([]);
  const [slots, setSlots] = useState<SlotConfig[]>([]);
  const [last, setLast] = useState<SpinRecord | null>(null);

  // Premium (phase 3) raises these.
  const maxItems = MAX_ITEMS;
  const maxSlots = FREE_MAX_SLOTS;

  const reload = useCallback(async () => {
    const [g, s, l] = await Promise.all([db.listGear(sqlite), db.listSlots(sqlite), db.lastSpin(sqlite)]);
    setItems(g);
    setSlots(s);
    setLast(l);
  }, [sqlite]);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const value = useMemo<GearState>(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    return {
      loading,
      items,
      slots,
      lastSpin: last,
      maxItems,
      maxSlots,
      ownCount: items.filter((g) => !g.isSample).length,
      sampleCount: items.filter((g) => g.isSample).length,
      addSamples: async () => {
        const n = await db.insertSamples(sqlite, SAMPLE_GEAR);
        await reload();
        return n;
      },
      removeSamples: async () => {
        await db.deleteSamples(sqlite);
        await reload();
      },
      itemById: (id) => (id ? byId.get(id) ?? null : null),

      addItem: async (draft) => {
        if ((await db.countGear(sqlite)) >= maxItems) {
          return { ok: false, error: `The free version holds up to ${maxItems} items. Remove one to add another.` };
        }
        const item = await db.insertGear(sqlite, draft);
        await reload();
        return { ok: true, item };
      },

      updateItem: async (id, draft) => {
        const before = byId.get(id);
        await db.updateGear(sqlite, id, draft);
        // A replaced or removed photo is deleted from the phone.
        if (before?.imageUri && before.imageUri !== draft.imageUri) deletePhoto(before.imageUri);
        // A locked item moved to another category no longer fits its slot.
        for (const s of slots) {
          if (s.lockedItemId === id && s.category !== draft.category) await db.setSlotLock(sqlite, s.slotIndex, null);
        }
        await reload();
        return { ok: true };
      },

      removeItem: async (id) => {
        const before = byId.get(id);
        await db.deleteGear(sqlite, id);
        deletePhoto(before?.imageUri);
        await reload();
      },

      toggleFavorite: async (id) => {
        const was = byId.get(id)?.favorite ?? false;
        await db.setFavorite(sqlite, id, !was);
        // Same order as the database gives: by category, favorites first, then by name.
        setItems((prev) => sortGear(prev.map((g) => (g.id === id ? { ...g, favorite: !was } : g))));
      },

      setLock: async (slotIndex, itemId) => {
        await db.setSlotLock(sqlite, slotIndex, itemId);
        setSlots((prev) => prev.map((s) => (s.slotIndex === slotIndex ? { ...s, lockedItemId: itemId } : s)));
      },

      saveSlots: async (next) => {
        if (next.length < MIN_SLOTS) return { ok: false, error: 'Keep at least one slot.' };
        if (next.length > maxSlots) return { ok: false, error: `The free version has up to ${maxSlots} slots.` };
        // Drop locks that no longer match the slot's category.
        const cleaned = next.map((s) => {
          const locked = s.lockedItemId ? byId.get(s.lockedItemId) : null;
          return { category: s.category, lockedItemId: locked && locked.category === s.category ? locked.id : null };
        });
        await db.saveSlots(sqlite, cleaned);
        // The last spin's results follow their wheels to the new positions; a wheel whose
        // category changed (or that was removed) loses its result.
        if (last) {
          const kept: SpinPick[] = [];
          next.forEach((s, i) => {
            const old = s.from != null ? last.picks.find((p) => p.slotIndex === s.from) : undefined;
            if (old && old.category === s.category) kept.push({ ...old, slotIndex: i, locked: !!cleaned[i]?.lockedItemId && old.locked });
          });
          await db.rewriteLastSpin(sqlite, kept);
        }
        await reload();
        return { ok: true };
      },

      recordSpin: async (picks) => {
        setLast(await db.recordSpin(sqlite, picks));
      },

      eraseEverything: async () => {
        await db.resetAll(sqlite);
        deleteAllPhotos();
        await reload();
      },
    };
  }, [items, slots, last, loading, maxItems, maxSlots, reload, sqlite]);

  return <GearContext.Provider value={value}>{children}</GearContext.Provider>;
}

export function useGear(): GearState {
  const ctx = useContext(GearContext);
  if (!ctx) throw new Error('useGear must be used inside GearProvider');
  return ctx;
}
