/**
 * Data shapes shared by the phone database, the screens and (later) the cloud
 * sync. Keep them backend-agnostic: the SQLite rows and the Supabase `edc`
 * tables both map onto these.
 */

/** The built-in categories. A person can remove any of them (except Other) and add their own; see lib/categories.ts. */
export const CATEGORIES = ['Knife', 'Flashlight', 'Pen', 'Multi-tool', 'Watch', 'Wallet', 'Keychain', 'Pry bar', 'Sunglasses', 'Fidget spinner', 'Bag', 'Beads', 'Coin', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const MATERIALS = ['Titanium', 'Copper', 'Brass', 'Aluminum', 'Steel', 'Damascus', 'Carbon fiber', 'G10', 'Micarta', 'Ultem', 'Delrin', 'Zirconium', 'Wood', 'Bronze', 'Silver', 'Nickel', 'Glass', 'Stone', 'Resin', 'Acetate', 'Plastic', 'Leather', 'Nylon', 'Canvas', 'Bone'] as const;
export const FINISHES = ['Polished', 'Stonewashed', 'Satin', 'Raw', 'Anodized', 'Blasted', 'Patina', 'Coated', 'Brushed', 'Matte', 'Glossy', 'Hammered'] as const;

/** The default reels for a new install (the spec's four). */
export const DEFAULT_SLOT_CATEGORIES: Category[] = ['Knife', 'Flashlight', 'Pen'];

export interface GearItem {
  id: string;
  name: string;
  /** From the brand list, or typed by the person. */
  brand: string | null;
  model: string | null;
  category: string;
  /** One of MATERIALS, or anything the person typed. */
  material: string | null;
  finish: string | null;
  /** '#RRGGBB' or null. */
  primaryColor: string | null;
  weightGrams: number | null;
  notes: string | null;
  /** file:// URI of the photo saved on this phone, or null. */
  imageUri: string | null;
  /** Part of the sample set (not counted toward the free limit; removed with "Remove sample gear"). */
  isSample: boolean;
  /** Starred by the person: listed first, and a little more likely to come up in a spin. */
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export type GearDraft = Omit<GearItem, 'id' | 'createdAt' | 'updatedAt' | 'isSample' | 'favorite'> & { isSample?: boolean; favorite?: boolean };

export interface SlotConfig {
  slotIndex: number;
  category: string;
  lockedItemId: string | null;
}

export interface SpinPick {
  slotIndex: number;
  category: string;
  itemId: string | null;
  locked: boolean;
}

export interface SpinRecord {
  id: number;
  spunAt: number;
  picks: SpinPick[];
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** '#abc', 'aabbcc' or '#AABBCC' -> '#AABBCC'; anything else -> null. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = HEX.exec(value.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toUpperCase()}`;
}
