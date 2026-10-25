/**
 * Wheel lab only (see run.mjs): a stand-in for lib/gear.web.tsx that keeps a working collection
 * and wheels in memory, so the real Spin screen can run in a browser. Never part of the app.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { SAMPLE_GEAR } from '@/content/sample-gear';
import { FREE_MAX_SLOTS, MAX_ITEMS, MIN_SLOTS } from '@/lib/limits';
import { DEFAULT_SLOT_CATEGORIES, type GearDraft, type GearItem, type SlotConfig, type SpinPick, type SpinRecord } from '@/types/models';

export type Result = { ok: true } | { ok: false; error: string };
export type SlotDraft = { category: string; lockedItemId: string | null; from?: number };

const ITEMS: GearItem[] = SAMPLE_GEAR.map((d, i) => ({ ...d, id: `lab-${i}`, isSample: true, favorite: false, createdAt: i, updatedAt: i }) as GearItem);

const Ctx = createContext<ReturnType<typeof build> | null>(null);

function build(items: GearItem[], slots: SlotConfig[], last: SpinRecord | null, set: { setSlots: (s: SlotConfig[]) => void; setLast: (l: SpinRecord | null) => void }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    loading: false,
    items,
    slots,
    lastSpin: last,
    maxItems: MAX_ITEMS,
    maxSlots: FREE_MAX_SLOTS,
    ownCount: 0,
    sampleCount: items.length,
    addSamples: async () => 0,
    removeSamples: async () => {},
    itemById: (id: string | null | undefined) => (id ? (byId.get(id) ?? null) : null),
    addItem: async (_d: GearDraft): Promise<Result & { item?: GearItem }> => ({ ok: false, error: 'lab' }),
    updateItem: async (_id: string, _d: GearDraft): Promise<Result> => ({ ok: false, error: 'lab' }),
    removeItem: async (_id: string) => {},
    toggleFavorite: async (_id: string) => {},
    setLock: async (slotIndex: number, itemId: string | null) => set.setSlots(slots.map((s) => (s.slotIndex === slotIndex ? { ...s, lockedItemId: itemId } : s))),
    saveSlots: async (next: SlotDraft[]): Promise<Result> => {
      if (next.length < MIN_SLOTS) return { ok: false, error: 'Keep at least one slot.' };
      if (next.length > FREE_MAX_SLOTS) return { ok: false, error: `The free version has up to ${FREE_MAX_SLOTS} slots.` };
      const cleaned = next.map((s) => {
        const locked = s.lockedItemId ? byId.get(s.lockedItemId) : null;
        return { category: s.category, lockedItemId: locked && locked.category === s.category ? locked.id : null };
      });
      if (last) {
        const kept: SpinPick[] = [];
        next.forEach((s, i) => {
          const old = s.from != null ? last.picks.find((p) => p.slotIndex === s.from) : undefined;
          if (old && old.category === s.category) kept.push({ ...old, slotIndex: i, locked: !!cleaned[i]?.lockedItemId && old.locked });
        });
        set.setLast({ ...last, picks: kept });
      }
      set.setSlots(cleaned.map((s, i) => ({ slotIndex: i, ...s })));
      return { ok: true };
    },
    recordSpin: async (picks: SpinPick[]) => set.setLast({ id: Date.now(), spunAt: Date.now(), picks }),
    eraseEverything: async () => {},
  };
}

export function GearProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<SlotConfig[]>(DEFAULT_SLOT_CATEGORIES.map((category, slotIndex) => ({ slotIndex, category, lockedItemId: null })));
  const [last, setLast] = useState<SpinRecord | null>(null);
  const value = useMemo(() => build(ITEMS, slots, last, { setSlots, setLast }), [slots, last]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGear() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGear must be used inside GearProvider');
  return v;
}
