// EDC Roulette: identify an everyday-carry item from a photo.
//
// POST { image: <base64 JPEG, no prefix>, device: <random id the app keeps> }
//   -> { ok: true, category, brand, brandCandidates, model, material, finish, color, name, notes }
//   or { ok: false, code, error }
//
// Anyone can call it (no account yet), so it is limited per device, per network
// address and overall each day (edc.take_identify_quota). The photo goes to the
// model and is not stored by us. The app only calls this after the person agrees.

import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODEL = Deno.env.get('EDC_AI_MODEL') ?? 'claude-sonnet-5-5';
const FALLBACK_MODEL = Deno.env.get('EDC_AI_FALLBACK_MODEL') ?? 'claude-haiku-5-5';
const DEVICE_LIMIT = Number(Deno.env.get('EDC_AI_DEVICE_DAILY') ?? '25');
const IP_LIMIT = Number(Deno.env.get('EDC_AI_IP_DAILY') ?? '60');
const GLOBAL_LIMIT = Number(Deno.env.get('EDC_AI_GLOBAL_DAILY') ?? '3000');
const MAX_IMAGE_CHARS = 2_000_000; // base64 characters, about 1.5 MB

const CATEGORIES = ['Knife', 'Flashlight', 'Pen', 'Multi-tool', 'Watch', 'Wallet', 'Keychain', 'Pry bar', 'Other'];
const MATERIALS = ['Titanium', 'Copper', 'Brass', 'Aluminum', 'Steel', 'Damascus', 'Carbon fiber', 'G10', 'Micarta', 'Ultem', 'Delrin', 'Zirconium', 'Wood'];
const FINISHES = ['Polished', 'Stonewashed', 'Satin', 'Raw', 'Anodized', 'Blasted', 'Patina', 'Coated'];

const SYSTEM = `You help people catalog their everyday-carry (EDC) gear from a photo: pocket knives, flashlights, pens, multi-tools, watches, wallets and keychain items.
Always answer by calling the report_item tool, once.

Rules:
- If the photo has nudity, sexual content, graphic violence, or anything not suitable for all ages, set unsafe to true, leave everything else empty, and do not describe it.
- If there is no everyday-carry item in the photo, set category to "Other" and leave brand and model empty.
- Only say what you can see. A brand or model counts only if it is printed, engraved or unmistakable from the shape. Otherwise leave it empty. A wrong brand is worse than a blank one.
- "confidence" is how sure you are of the brand and model together: high, medium or low.
- "color" is the main color of the item itself as a hex code like #3A3F45 (not the background, not the hand).
- Finish: pick from the list if one fits, otherwise leave empty.
- Materials: a photo can't prove what something is made of, so give your best guess first, then up to two other materials from the list that would look the same. A dark or black body could be anodized aluminum, black zirconium, or a coated titanium or steel: include Zirconium among the possibilities when a pen, light or tool looks black or dark grey and sleek. Warm gold or orange metal could be Brass or Copper. Do not guess steel types or alloys; leave materials empty if nothing fits.
- Never identify or describe any person in the photo.
- Keep notes to one short plain sentence about what you can see (for example "Blue anodized aluminum body with a pocket clip"), or leave it empty.`;

const TOOL = {
  name: 'report_item',
  description: 'Report what the item in the photo is.',
  input_schema: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: CATEGORIES },
      brand: { type: 'string', description: 'The brand as written on the item, or empty.' },
      model: { type: 'string', description: 'The model name, or empty.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      materials: {
        type: 'array',
        items: { type: 'string', enum: MATERIALS },
        maxItems: 3,
        description: 'Up to three materials the body could be made of, most likely first. Include other materials that would look the same in a photo.',
      },
      finish: { type: 'string', description: `One of: ${FINISHES.join(', ')}; or empty.` },
      color: { type: 'string', description: 'Main color as #RRGGBB, or empty.' },
      notes: { type: 'string' },
      unsafe: { type: 'boolean' },
    },
    required: ['category', 'confidence'],
  },
};

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const pick = (value: unknown, list: string[]): string | null => {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return list.find((x) => x.toLowerCase() === v) ?? null;
};
// The model sometimes answers "empty" with a pair of quote marks; those are not text.
const clean = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/[\u0022\u201C\u201D\u2018\u2019`]/g, '').trim().slice(0, max) : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method', error: 'Use POST.' }, 405);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ ok: false, code: 'not-set-up', error: 'Photo identify is not set up yet.' }, 503);

  let body: { image?: unknown; device?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'bad-request', error: 'Bad request.' }, 400);
  }
  if (typeof body.image !== 'string' || body.image.length < 100) return json({ ok: false, code: 'bad-request', error: 'Send a photo.' }, 400);
  if (body.image.length > MAX_IMAGE_CHARS) return json({ ok: false, code: 'too-large', error: 'That photo is too large.' }, 413);
  if (typeof body.device !== 'string' || body.device.length < 8 || body.device.length > 100) {
    return json({ ok: false, code: 'bad-request', error: 'Missing device id.' }, 400);
  }
  const image = body.image.replace(/^data:image\/\w+;base64,/, '');

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'edc' },
    auth: { persistSession: false },
  });

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const { data: allowed, error: quotaError } = await db.rpc('take_identify_quota', {
    buckets: [`device:${await sha(body.device)}`, `ip:${await sha(ip)}`, 'all'],
    limits: [DEVICE_LIMIT, IP_LIMIT, GLOBAL_LIMIT],
  });
  if (quotaError) {
    console.error('quota error', quotaError.message);
    return json({ ok: false, code: 'error', error: 'Could not check your limit. Try again.' }, 500);
  }
  if (!allowed) return json({ ok: false, code: 'limit', error: "You've used today's photo identifies. You can still fill in the details yourself." }, 429);

  const ask = (model: string) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        temperature: 1,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'report_item' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
              { type: 'text', text: 'What is this item?' },
            ],
          },
        ],
      }),
    });

  // If the main model is refused (a bad request or model setting, not just busy), try the backup once.
  let res = await ask(MODEL);
  let detail = '';
  if (!res.ok) {
    detail = `${MODEL} ${res.status}: ${(await res.text()).slice(0, 300)}`;
    console.error('Anthropic error', detail);
    if (res.status >= 400 && res.status < 500 && res.status !== 429 && MODEL !== FALLBACK_MODEL) {
      res = await ask(FALLBACK_MODEL);
      if (!res.ok) {
        detail += ` | ${FALLBACK_MODEL} ${res.status}: ${(await res.text()).slice(0, 300)}`;
        console.error('Anthropic fallback error', detail);
      }
    }
  }
  if (!res.ok) {
    const busy = res.status === 429 || res.status === 529 || res.status >= 500;
    return json(
      { ok: false, code: busy ? 'busy' : 'error', error: busy ? 'The photo service is busy. Try again in a moment.' : 'Photo identify could not run.', detail },
      502,
    );
  }
  const data = await res.json();
  const out = (data.content ?? []).find((c: { type: string }) => c.type === 'tool_use')?.input;
  if (!out) return json({ ok: false, code: 'error', error: 'Could not read the photo. Try again.' }, 502);
  if (out.unsafe === true) return json({ ok: false, code: 'unsafe', error: 'That photo can’t be used here.' });

  const category = pick(out.category, CATEGORIES) ?? 'Other';
  const brandText = clean(out.brand, 60);
  const model = clean(out.model, 60);
  const confident = out.confidence === 'high' || out.confidence === 'medium';

  // Match what the model read against the brand catalog (fixes spelling and aliases).
  let brand: string | null = null;
  let brandCandidates: { name: string; score: number }[] = [];
  if (brandText) {
    const { data: matches } = await db.rpc('match_brands', { q: brandText, max_results: 4 });
    brandCandidates = ((matches ?? []) as { name: string; score: number }[]).map((m) => ({ name: m.name, score: Math.round(m.score * 100) / 100 }));
    if (brandCandidates[0] && brandCandidates[0].score >= 0.8 && confident) brand = brandCandidates[0].name;
  }

  const materialOptions = [...new Set((Array.isArray(out.materials) ? out.materials : []).map((m: unknown) => pick(m, MATERIALS)).filter((m: string | null): m is string => !!m))].slice(0, 3);
  const color = /^#[0-9a-fA-F]{6}$/.test(clean(out.color, 7)) ? clean(out.color, 7).toUpperCase() : null;
  return json({
    ok: true,
    category,
    brand,
    brandRead: brandText || null, // what the model read, even if not in the catalog
    brandCandidates,
    model: model || null,
    confidence: ['high', 'medium', 'low'].includes(out.confidence) ? out.confidence : 'low',
    material: materialOptions[0] ?? null,
    materialOptions,
    finish: pick(out.finish, FINISHES),
    color,
    notes: clean(out.notes, 200) || null,
  });
});
