/**
 * The few calls the free app makes to the shared backend: the approved brand
 * list, suggesting a new brand, identifying an item from a photo, and picking a
 * coordinated set. All are optional; the app works without a connection.
 * Plain fetch against Supabase's REST and Functions endpoints (no sign-in yet).
 */
import { deviceId, getTrainingNotes } from '@/lib/preferences';

const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const backendConfigured = !!URL_BASE && !!KEY;

const headers = (extra?: Record<string, string>) => ({ apikey: KEY ?? '', Authorization: `Bearer ${KEY ?? ''}`, 'Content-Type': 'application/json', ...extra });

async function timed(input: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface ApprovedBrand {
  name: string;
  aliases: string[];
  categories: string[];
}

/** Brands approved so far, or null when offline. */
export async function fetchApprovedBrands(): Promise<ApprovedBrand[] | null> {
  if (!backendConfigured) return null;
  try {
    const r = await timed(`${URL_BASE}/rest/v1/brands?select=name,aliases,categories&order=name&limit=2000`, { headers: headers({ 'Accept-Profile': 'edc' }) }, 10000);
    if (!r.ok) return null;
    const rows = (await r.json()) as ApprovedBrand[];
    return Array.isArray(rows) ? rows.filter((b) => typeof b.name === 'string') : null;
  } catch {
    return null;
  }
}

export type SuggestResult = { ok: true; status: 'exists' | 'pending'; name: string } | { ok: false; error: string };

/** Sends a brand that's missing from the list for review. Rate-limited per device. */
export async function suggestBrand(brand: string, category: string | null): Promise<SuggestResult> {
  if (!backendConfigured) return { ok: false, error: 'Not connected right now.' };
  try {
    const r = await timed(
      `${URL_BASE}/rest/v1/rpc/suggest_brand`,
      { method: 'POST', headers: headers({ 'Content-Profile': 'edc' }), body: JSON.stringify({ brand_name: brand, category, device: deviceId() }) },
      10000,
    );
    const body = (await r.json().catch(() => null)) as { status?: string; name?: string; message?: string } | null;
    if (!r.ok) return { ok: false, error: body?.message ?? 'Could not send that right now.' };
    return { ok: true, status: body?.status === 'exists' ? 'exists' : 'pending', name: body?.name ?? brand };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' };
  }
}

export interface Identified {
  category: string;
  brand: string | null;
  brandRead: string | null;
  brandCandidates: { name: string; score: number }[];
  model: string | null;
  confidence: 'high' | 'medium' | 'low';
  material: string | null;
  /** The likely materials, best guess first (a photo can't prove one). */
  materialOptions?: string[];
  finish: string | null;
  color: string | null;
  notes: string | null;
}

export type IdentifyResult = ({ ok: true } & Identified) | { ok: false; code: string; error: string; detail?: string };

/** Asks the AI service what an item is, from a small base64 JPEG. */
export async function identifyPhoto(base64: string): Promise<IdentifyResult> {
  if (!backendConfigured) return { ok: false, code: 'offline', error: 'Not connected right now.' };
  try {
    const r = await timed(`${URL_BASE}/functions/v1/edc-identify`, { method: 'POST', headers: headers(), body: JSON.stringify({ image: base64, device: deviceId(), notes: getTrainingNotes() }) }, 45000);
    const body = (await r.json().catch(() => null)) as IdentifyResult | null;
    if (body && typeof body === 'object' && 'ok' in body) return body;
    return { ok: false, code: 'error', error: 'Photo identify could not run.', detail: `The server answered ${r.status} without a result.` };
  } catch {
    return { ok: false, code: 'offline', error: 'Could not reach the server. Check your connection.' };
  }
}

export interface PairWheel {
  slot: number;
  category: string;
  locked?: string;
  options: { id: string; name: string; brand?: string | null; model?: string | null; material?: string | null; finish?: string | null; color?: string | null }[];
}

export type PairResult = { ok: true; picks: { slot: number; id: string }[]; why: string } | { ok: false; code: string; error: string };

/** Asks the AI service for one piece per wheel that go well together. */
export async function pickCoordinated(wheels: PairWheel[]): Promise<PairResult> {
  if (!backendConfigured) return { ok: false, code: 'offline', error: 'Not connected right now.' };
  try {
    const r = await timed(`${URL_BASE}/functions/v1/edc-pair`, { method: 'POST', headers: headers(), body: JSON.stringify({ device: deviceId(), wheels }) }, 15000);
    const body = (await r.json().catch(() => null)) as PairResult | null;
    if (body && typeof body === 'object' && 'ok' in body) return body;
    return { ok: false, code: 'error', error: 'Coordinated spin could not run.' };
  } catch {
    return { ok: false, code: 'offline', error: 'Could not reach the server.' };
  }
}

export type AiCheck = { ok: true } | { ok: false; error: string };

/** Sends a tiny made-up request to the coordinated-set service to see whether the AI side is reachable and set up. Nothing of the person's is sent. */
export async function checkAi(): Promise<AiCheck> {
  const res = await pickCoordinated([{ slot: 0, category: 'Pen', options: [{ id: 'check-a', name: 'Test pen', material: 'Steel' }, { id: 'check-b', name: 'Spare pen', material: 'Brass' }] }]);
  if (res.ok) return { ok: true };
  return { ok: false, error: res.code === 'offline' ? res.error : `The AI service answered with a problem: ${res.error}` };
}
