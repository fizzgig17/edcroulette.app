/**
 * The free tier's on-phone database (expo-sqlite). Nothing here leaves the
 * phone. Schema changes go in `migrate` as a new numbered step; never edit a
 * step that has shipped.
 */
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_SLOT_CATEGORIES, type GearDraft, type GearItem, type SlotConfig, type SpinPick, type SpinRecord } from '@/types/models';

export const DATABASE_NAME = 'edc-roulette.db';
const DATABASE_VERSION = 3;

export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS gear_items (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        material TEXT,
        finish TEXT,
        primary_color TEXT,
        weight_grams REAL,
        notes TEXT,
        image_uri TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS gear_items_category ON gear_items (category);
      CREATE TABLE IF NOT EXISTS slots (
        slot_index INTEGER PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        locked_item_id TEXT
      );
      CREATE TABLE IF NOT EXISTS spins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spun_at INTEGER NOT NULL,
        picks TEXT NOT NULL
      );
    `);
    for (const [i, category] of DEFAULT_SLOT_CATEGORIES.entries()) {
      await db.runAsync('INSERT OR IGNORE INTO slots (slot_index, category) VALUES (?, ?)', i, category);
    }
    version = 1;
  }
  if (version === 1) {
    // Brand and model, and the sample-gear flag.
    await db.execAsync(`
      ALTER TABLE gear_items ADD COLUMN brand TEXT;
      ALTER TABLE gear_items ADD COLUMN model TEXT;
      ALTER TABLE gear_items ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
    `);
    version = 2;
  }
  if (version === 2) {
    // Favorites.
    await db.execAsync('ALTER TABLE gear_items ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;');
    version = 3;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------
interface GearRow {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string;
  material: string | null;
  finish: string | null;
  primary_color: string | null;
  weight_grams: number | null;
  notes: string | null;
  image_uri: string | null;
  is_sample: number;
  favorite: number;
  created_at: number;
  updated_at: number;
}

const toGear = (r: GearRow): GearItem => ({
  id: r.id,
  name: r.name,
  brand: r.brand,
  model: r.model,
  category: r.category,
  material: r.material,
  finish: r.finish,
  primaryColor: r.primary_color,
  weightGrams: r.weight_grams,
  notes: r.notes,
  imageUri: r.image_uri,
  isSample: r.is_sample === 1,
  favorite: r.favorite === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listGear(db: SQLiteDatabase): Promise<GearItem[]> {
  const rows = await db.getAllAsync<GearRow>('SELECT * FROM gear_items ORDER BY category, favorite DESC, name COLLATE NOCASE');
  return rows.map(toGear);
}

/** Items the person added themselves (sample gear doesn't count toward the free limit). */
export async function countGear(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM gear_items WHERE is_sample = 0');
  return r?.n ?? 0;
}

export async function insertGear(db: SQLiteDatabase, draft: GearDraft): Promise<GearItem> {
  const now = Date.now();
  const item: GearItem = { ...draft, isSample: draft.isSample ?? false, favorite: draft.favorite ?? false, id: Crypto.randomUUID(), createdAt: now, updatedAt: now };
  await db.runAsync(
    `INSERT INTO gear_items (id, name, brand, model, category, material, finish, primary_color, weight_grams, notes, image_uri, is_sample, favorite, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id, item.name, item.brand, item.model, item.category, item.material, item.finish, item.primaryColor, item.weightGrams, item.notes, item.imageUri, item.isSample ? 1 : 0, item.favorite ? 1 : 0, now, now,
  );
  return item;
}

export async function updateGear(db: SQLiteDatabase, id: string, draft: GearDraft): Promise<void> {
  await db.runAsync(
    // Editing a sample piece makes it the person's own (it stays when samples are removed).
    `UPDATE gear_items SET name = ?, brand = ?, model = ?, category = ?, material = ?, finish = ?, primary_color = ?, weight_grams = ?, notes = ?, image_uri = ?, is_sample = 0, updated_at = ?
     WHERE id = ?`,
    draft.name, draft.brand, draft.model, draft.category, draft.material, draft.finish, draft.primaryColor, draft.weightGrams, draft.notes, draft.imageUri, Date.now(), id,
  );
}

export async function setFavorite(db: SQLiteDatabase, id: string, favorite: boolean): Promise<void> {
  await db.runAsync('UPDATE gear_items SET favorite = ? WHERE id = ?', favorite ? 1 : 0, id);
}

/** Adds the sample drafts (skipping any already loaded) in one go. Returns how many were added. */
export async function insertSamples(db: SQLiteDatabase, drafts: GearDraft[]): Promise<number> {
  let added = 0;
  await db.withTransactionAsync(async () => {
    const have = new Set((await db.getAllAsync<{ name: string }>('SELECT name FROM gear_items WHERE is_sample = 1')).map((r) => r.name));
    for (const d of drafts) {
      if (have.has(d.name)) continue;
      await insertGear(db, { ...d, isSample: true });
      added += 1;
    }
  });
  return added;
}

/** Removes every sample piece and unlocks any slot that held one. */
export async function deleteSamples(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE slots SET locked_item_id = NULL WHERE locked_item_id IN (SELECT id FROM gear_items WHERE is_sample = 1)');
    await db.runAsync('DELETE FROM gear_items WHERE is_sample = 1');
  });
}

/** Deletes the item and unlocks any slot that had it locked. */
export async function deleteGear(db: SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE slots SET locked_item_id = NULL WHERE locked_item_id = ?', id);
    await db.runAsync('DELETE FROM gear_items WHERE id = ?', id);
  });
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------
export async function listSlots(db: SQLiteDatabase): Promise<SlotConfig[]> {
  const rows = await db.getAllAsync<{ slot_index: number; category: string; locked_item_id: string | null }>(
    'SELECT slot_index, category, locked_item_id FROM slots ORDER BY slot_index',
  );
  return rows.map((r) => ({ slotIndex: r.slot_index, category: r.category, lockedItemId: r.locked_item_id }));
}

/** Replaces the whole set of slots, renumbered 0..n-1 in the given order. */
export async function saveSlots(db: SQLiteDatabase, slots: Omit<SlotConfig, 'slotIndex'>[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM slots');
    for (const [i, s] of slots.entries()) {
      await db.runAsync('INSERT INTO slots (slot_index, category, locked_item_id) VALUES (?, ?, ?)', i, s.category, s.lockedItemId);
    }
  });
}

export async function setSlotLock(db: SQLiteDatabase, slotIndex: number, itemId: string | null): Promise<void> {
  await db.runAsync('UPDATE slots SET locked_item_id = ? WHERE slot_index = ?', itemId, slotIndex);
}

// ---------------------------------------------------------------------------
// Spin history
// ---------------------------------------------------------------------------
export async function recordSpin(db: SQLiteDatabase, picks: SpinPick[]): Promise<SpinRecord> {
  const spunAt = Date.now();
  const r = await db.runAsync('INSERT INTO spins (spun_at, picks) VALUES (?, ?)', spunAt, JSON.stringify(picks));
  // Keep the last 200 spins; older ones aren't shown anywhere.
  await db.runAsync('DELETE FROM spins WHERE id NOT IN (SELECT id FROM spins ORDER BY id DESC LIMIT 200)');
  return { id: r.lastInsertRowId, spunAt, picks };
}

/** Replaces the picks of the newest spin (after the wheels were reordered or changed). */
export async function rewriteLastSpin(db: SQLiteDatabase, picks: SpinPick[]): Promise<void> {
  await db.runAsync('UPDATE spins SET picks = ? WHERE id = (SELECT MAX(id) FROM spins)', JSON.stringify(picks));
}

export async function lastSpin(db: SQLiteDatabase): Promise<SpinRecord | null> {
  const r = await db.getFirstAsync<{ id: number; spun_at: number; picks: string }>('SELECT * FROM spins ORDER BY id DESC LIMIT 1');
  if (!r) return null;
  try {
    return { id: r.id, spunAt: r.spun_at, picks: JSON.parse(r.picks) as SpinPick[] };
  } catch {
    return null;
  }
}

/** Erases everything on this phone and restores the default slots. */
export async function resetAll(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM gear_items; DELETE FROM slots; DELETE FROM spins;');
    for (const [i, category] of DEFAULT_SLOT_CATEGORIES.entries()) {
      await db.runAsync('INSERT INTO slots (slot_index, category) VALUES (?, ?)', i, category);
    }
  });
}
