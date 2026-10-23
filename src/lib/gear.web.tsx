/**
 * Website stand-in for lib/gear.tsx: the same API with an empty collection, so
 * app screens (which Expo Router still bundles for the web, but which redirect
 * home there) compile without pulling in the phone database.
 */
import type { ReactNode } from 'react';

import { FREE_MAX_ITEMS, FREE_MAX_SLOTS } from '@/lib/limits';
import type { GearDraft, GearItem, SlotConfig, SpinPick, SpinRecord } from '@/types/models';

export type Result = { ok: true } | { ok: false; error: string };
export type SlotDraft = { category: string; lockedItemId: string | null; from?: number };

const unavailable: Result = { ok: false, error: 'Your collection lives in the EDC Roulette app.' };

const state = {
  loading: false,
  items: [] as GearItem[],
  slots: [] as SlotConfig[],
  lastSpin: null as SpinRecord | null,
  maxItems: FREE_MAX_ITEMS,
  maxSlots: FREE_MAX_SLOTS,
  ownCount: 0,
  sampleCount: 0,
  addSamples: async () => 0,
  removeSamples: async () => {},
  itemById: (_id: string | null | undefined): GearItem | null => null,
  addItem: async (_draft: GearDraft): Promise<Result & { item?: GearItem }> => unavailable,
  updateItem: async (_id: string, _draft: GearDraft): Promise<Result> => unavailable,
  removeItem: async (_id: string) => {},
  setLock: async (_slotIndex: number, _itemId: string | null) => {},
  saveSlots: async (_slots: SlotDraft[]): Promise<Result> => unavailable,
  recordSpin: async (_picks: SpinPick[]) => {},
  eraseEverything: async () => {},
};

export function GearProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useGear() {
  return state;
}
