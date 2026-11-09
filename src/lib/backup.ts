/**
 * Backup you keep yourself. Everyone can save the collection to one file (photos and outlines included) and add it back later;
 * Pro also gets a spreadsheet (CSV) of the text details. Nothing is sent anywhere: the file goes where the person shares it.
 */
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import type { Cutout } from '@/lib/cutout';
import { photoBase64, savePhotoFromBase64 } from '@/lib/photos';
import type { GearDraft, GearItem } from '@/types/models';

const APP = 'edc-roulette-backup';

type BackupItem = Omit<GearItem, 'id' | 'createdAt' | 'updatedAt' | 'isSample' | 'imageUri'> & { photo: string | null };
type BackupFile = { app: typeof APP; version: 1; exportedAt: string; items: BackupItem[] };

const stamp = () => new Date().toISOString().slice(0, 10);

async function share(name: string, text: string, mime: string, uti: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: uti, dialogTitle: name });
}

/** Saves the person's own items (not sample gear) as one file and opens the share sheet. */
export async function saveBackup(items: GearItem[]): Promise<number> {
  const own = items.filter((i) => !i.isSample);
  const out: BackupItem[] = [];
  for (const i of own) {
    const { id: _id, createdAt: _c, updatedAt: _u, isSample: _s, imageUri, ...rest } = i;
    out.push({ ...rest, photo: await photoBase64(imageUri) });
  }
  const body: BackupFile = { app: APP, version: 1, exportedAt: new Date().toISOString(), items: out };
  await share(`edc-roulette-backup-${stamp()}.json`, JSON.stringify(body), 'application/json', 'public.json');
  return own.length;
}

const str = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function isCutout(v: unknown): v is Cutout {
  const c = v as Cutout | null;
  return !!c && Array.isArray(c.outline) && c.outline.length >= 3 && c.outline.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number')) && typeof c.turn === 'number';
}

/** Picks a file and reads it as text; null if the person cancelled. */
async function pickText(types: string[]): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  const a = r.assets?.[0];
  if (r.canceled || !a) return null;
  return new File(a.uri).text();
}

export type Imported = { drafts: GearDraft[]; skipped: number };

/** Reads a backup file and returns the items in it (photos are saved to the phone as it goes). Null if cancelled. */
export async function readBackup(): Promise<Imported | null> {
  const text = await pickText(['application/json', 'text/plain', '*/*']);
  if (text === null) return null;
  let data: BackupFile;
  try {
    data = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('That file isn’t an EDC Roulette backup.');
  }
  if (data?.app !== APP || !Array.isArray(data.items)) throw new Error('That file isn’t an EDC Roulette backup.');
  const drafts: GearDraft[] = [];
  let skipped = 0;
  for (const raw of data.items) {
    const name = str(raw?.name, 120);
    if (!name) {
      skipped += 1;
      continue;
    }
    let imageUri: string | null = null;
    if (typeof raw.photo === 'string' && raw.photo.length > 0) {
      try {
        imageUri = savePhotoFromBase64(raw.photo);
      } catch {
        imageUri = null;
      }
    }
    drafts.push({
      name,
      brand: str(raw.brand, 80),
      model: str(raw.model, 80),
      category: str(raw.category, 40) ?? 'Other',
      material: str(raw.material, 40),
      finish: str(raw.finish, 40),
      primaryColor: str(raw.primaryColor, 9),
      weightGrams: num(raw.weightGrams),
      notes: str(raw.notes, 2000),
      imageUri,
      favorite: raw.favorite === true,
      photoStyle: raw.photoStyle === 'original' || raw.photoStyle === 'cutout' ? raw.photoStyle : null,
      cutout: imageUri && isCutout(raw.cutout) ? raw.cutout : null,
    });
  }
  return { drafts, skipped };
}

// --- CSV (Pro) ---------------------------------------------------------------------------

const COLUMNS = ['name', 'brand', 'model', 'category', 'material', 'finish', 'color', 'weight_g', 'notes', 'favorite'] as const;

const cell = (v: string | number | boolean | null) => {
  const t = v === null ? '' : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export async function saveCsv(items: GearItem[]): Promise<number> {
  const own = items.filter((i) => !i.isSample);
  const rows = own.map((i) => [i.name, i.brand, i.model, i.category, i.material, i.finish, i.primaryColor, i.weightGrams, i.notes, i.favorite ? 'yes' : ''].map(cell).join(','));
  await share(`edc-roulette-${stamp()}.csv`, [COLUMNS.join(','), ...rows].join('\n'), 'text/csv', 'public.comma-separated-values-text');
  return own.length;
}

/** Splits CSV text into rows of cells (quotes, doubled quotes and line breaks inside quotes are handled). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i += 1;
      row.push(cur);
      cur = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export async function readCsv(): Promise<Imported | null> {
  const text = await pickText(['text/csv', 'text/comma-separated-values', 'text/plain', '*/*']);
  if (text === null) return null;
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('That spreadsheet has no rows.');
  const head = rows[0]!.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const at = (name: string, ...alts: string[]) => [name, ...alts].map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  const col = { name: at('name', 'item'), brand: at('brand', 'maker'), model: at('model'), category: at('category', 'type'), material: at('material'), finish: at('finish'), color: at('color', 'colour', 'primary_color'), weight: at('weight_g', 'weight', 'grams'), notes: at('notes', 'note'), favorite: at('favorite', 'favourite', 'starred') };
  if (col.name < 0 && col.model < 0) throw new Error('Needs a “name” column (and optionally brand, model, category, material, finish, color, weight_g, notes, favorite).');
  const drafts: GearDraft[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const g = (i: number) => (i >= 0 ? str(r[i] ?? '') : null);
    const name = g(col.name) ?? [g(col.brand), g(col.model)].filter(Boolean).join(' ');
    if (!name) {
      skipped += 1;
      continue;
    }
    const w = g(col.weight);
    const color = g(col.color);
    drafts.push({
      name: name.slice(0, 120),
      brand: g(col.brand),
      model: g(col.model),
      category: g(col.category) ?? 'Other',
      material: g(col.material),
      finish: g(col.finish),
      primaryColor: color && /^#?[0-9a-f]{6}$/i.test(color) ? `#${color.replace('#', '').toUpperCase()}` : null,
      weightGrams: w && Number.isFinite(Number(w)) && Number(w) >= 0 ? Number(w) : null,
      notes: g(col.notes),
      imageUri: null,
      favorite: /^(y|yes|true|1|x)$/i.test(g(col.favorite) ?? ''),
    });
  }
  return { drafts, skipped };
}
