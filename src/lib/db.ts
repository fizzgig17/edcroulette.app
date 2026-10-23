/**
 * The free tier's on-phone database (expo-sqlite). Nothing here leaves the
 * phone. Schema changes go in `migrate` as a new numbered step; never edit a
 * step that has shipped.
 */
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_SLOT_CATEGORIES, type GearDraft, type GearItem, type SlotConfig, type SpinPick, type SpinRecord } from '@/types/models';

export const DATABASE_NAME = 'edc-roulette.db';
const DATABASE_VERSION = 1;

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
  // if (version === 1) { ...next migration...; version = 2; }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------
interface GearRow {
  id: string;
  name: string;
  category: string;
  material: string | null;
  finish: string | null;
  primary_color: string | null;
  weight_grams: number | null;
  notes: string | null;
  image_uri: string | null;
  created_at: number;
  updated_at: number;
}

const toGear = (r: GearRow): GearItem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  material: r.material,
  finish: r.finish,
  primaryColor: r.primary_color,
  weightGrams: r.weight_grams,
  notes: r.notes,
  imageUri: r.image_uri,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listGear(db: SQLiteDatabase): Promise<GearItem[]> {
  const rows = await db.getAllAsync<GearRow>('SELECT * FROM gear_items ORDER BY category, name COLLATE NOCASE');
  return rows.map(toGear);
}

export async function countGear(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM gear_items');
  return r?.n ?? 0;
}

export async function insertGear(db: SQLiteDatabase, draft: GearDraft): Promise<GearItem> {
  const now = Date.now();
  const item: GearItem = { ...draft, id: Crypto.randomUUID(), createdAt: now, updatedAt: now };
  await db.runAsync(
    `INSERT INTO gear_items (id, name, category, material, finish, primary_color, weight_grams, notes, image_uri, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id, item.name, item.category, item.material, item.finish, item.primaryColor, item.weightGrams, item.notes, item.imageUri, now, now,
  );
  return item;
}

export async function updateGear(db: SQLiteDatabase, id: string, draft: GearDraft): Promise<void> {
  await db.runAsync(
    `UPDATE gear_items SET name = ?, category = ?, material = ?, finish = ?, primary_color = ?, weight_grams = ?, notes = ?, image_uri = ?, updated_at = ?
     WHERE id = ?`,
    draft.name, draft.category, draft.material, draft.finish, draft.primaryColor, draft.weightGrams, draft.notes, draft.imageUri, Date.now(), id,
  );
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
