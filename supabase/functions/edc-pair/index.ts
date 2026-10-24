// EDC Roulette: pick pieces that go well together.
//
// POST { device, wheels: [{ slot, category, locked?: itemId, options: [{ id, name, brand, model, material, finish, color }] }] }
//   -> { ok: true, picks: [{ slot, id }], why }
//   or { ok: false, code, error }
//
// Sends only the text details of the person's items (no photos, no names of people).
// The app calls it only when "Coordinated" spin style is on and AI is allowed, and
// falls back to a random spin if it fails. Limited per device and overall each day.

import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODEL = Deno.env.get('EDC_PAIR_MODEL') ?? 'claude-haiku-5-5';
const DEVICE_LIMIT = Number(Deno.env.get('EDC_PAIR_DEVICE_DAILY') ?? '60');
const GLOBAL_LIMIT = Number(Deno.env.get('EDC_PAIR_GLOBAL_DAILY') ?? '6000');
const MAX_WHEELS = 6;
const MAX_OPTIONS = 60; // per wheel (the free version holds 20 items in all)

type Option = { id: string; name: string; brand?: string; model?: string; material?: string; finish?: string; color?: string };
type Wheel = { slot: number; category: string; locked?: string; options: Option[] };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validate(body: unknown): { device: string; wheels: Wheel[] } | string {
  const b = body as { device?: unknown; wheels?: unknown };
  const device = str(b?.device, 100);
  if (device.length < 8) return 'Missing device id.';
  if (!Array.isArray(b.wheels) || b.wheels.length < 1 || b.wheels.length > MAX_WHEELS) return 'Send 1 to 6 wheels.';
  const wheels: Wheel[] = [];
  for (const w of b.wheels as Record<string, unknown>[]) {
    if (typeof w.slot !== 'number' || !Array.isArray(w.options) || w.options.length > MAX_OPTIONS) return 'Bad wheel data.';
    const options: Option[] = [];
    for (const o of w.options as Record<string, unknown>[]) {
      const id = str(o.id, 60);
      if (!id) return 'Bad item data.';
      options.push({
        id,
        name: str(o.name, 80),
        brand: str(o.brand, 60) || undefined,
        model: str(o.model, 60) || undefined,
        material: str(o.material, 40) || undefined,
        finish: str(o.finish, 40) || undefined,
        color: /^#[0-9a-fA-F]{6}$/.test(str(o.color, 7)) ? str(o.color, 7) : undefined,
      });
    }
    wheels.push({ slot: Math.round(w.slot), category: str(w.category, 40), locked: str(w.locked, 60) || undefined, options });
  }
  return { device, wheels };
}

const SYSTEM = `You help someone choose which everyday-carry (EDC) pieces to carry together today, like a friend with good taste.
Each wheel is one category (knife, flashlight, pen, watch...) with the options they own. Choose exactly one option per wheel so the set looks and feels like it belongs together.
Always answer by calling the choose_set tool, once.

What "go together" means: matching or complementary materials and finishes (for example titanium with stonewashed, brass with copper or patina, black anodized with black), colors that sit well together (not necessarily the same color), brands from the same style or era, a consistent mood (rugged, refined, minimal, bright). Variety is fine when it looks intentional.
- A wheel with "locked" set must keep that option; build the rest around it.
- If a wheel has no options, leave it out of picks.
- Give some variety from day to day: when several sets work equally well, choose one at random instead of always the "best" one.
- "why" is one short, friendly sentence on what ties the set together (under 25 words). No prices, no gambling language.`;

const TOOL = {
  name: 'choose_set',
  description: 'Choose one option per wheel.',
  input_schema: {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object',
          properties: { slot: { type: 'integer' }, id: { type: 'string' } },
          required: ['slot', 'id'],
        },
      },
      why: { type: 'string' },
    },
    required: ['picks', 'why'],
  },
};

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'method', error: 'Use POST.' }, 405);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ ok: false, code: 'not-set-up', error: 'Coordinated spins are not set up yet.' }, 503);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'bad-request', error: 'Bad request.' }, 400);
  }
  const parsed = validate(body);
  if (typeof parsed === 'string') return json({ ok: false, code: 'bad-request', error: parsed }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'edc' },
    auth: { persistSession: false },
  });
  const { data: allowed, error: quotaError } = await db.rpc('take_identify_quota', {
    buckets: [`pair-device:${await sha(parsed.device)}`, 'pair-all'],
    limits: [DEVICE_LIMIT, GLOBAL_LIMIT],
  });
  if (quotaError) {
    console.error('quota error', quotaError.message);
    return json({ ok: false, code: 'error', error: 'Could not check the limit.' }, 500);
  }
  if (!allowed) return json({ ok: false, code: 'limit', error: "That's today's coordinated spins." }, 429);

  const lines = parsed.wheels.map((w) => {
    const opts = w.options
      .map((o) => {
        const bits = [o.brand, o.model].filter(Boolean).join(' ') || o.name;
        const extra = [o.material, o.finish, o.color].filter(Boolean).join(', ');
        return `  - id=${o.id}: ${bits}${o.name && o.name !== bits ? ` ("${o.name}")` : ''}${extra ? ` [${extra}]` : ''}`;
      })
      .join('\n');
    return `Wheel ${w.slot} (${w.category})${w.locked ? ` — locked to id=${w.locked}` : ''}:\n${opts || '  (no options)'}`;
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      temperature: 1,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'choose_set' },
      messages: [{ role: 'user', content: `Choose today's set.\n\n${lines.join('\n\n')}` }],
    }),
  });
  if (!res.ok) {
    console.error('Anthropic error', res.status, (await res.text()).slice(0, 300));
    return json({ ok: false, code: 'busy', error: 'The coordination service is busy.' }, 502);
  }
  const data = await res.json();
  const out = (data.content ?? []).find((c: { type: string }) => c.type === 'tool_use')?.input;
  if (!out || !Array.isArray(out.picks)) return json({ ok: false, code: 'error', error: 'Could not read the answer.' }, 502);

  // Keep only real choices: one per wheel, from that wheel's own options, honoring locks.
  const picks: { slot: number; id: string }[] = [];
  for (const w of parsed.wheels) {
    const ids = new Set(w.options.map((o) => o.id));
    const wanted = w.locked && ids.has(w.locked) ? w.locked : (out.picks as { slot: number; id: string }[]).find((p) => p.slot === w.slot && ids.has(p.id))?.id;
    if (wanted) picks.push({ slot: w.slot, id: wanted });
  }
  return json({ ok: true, picks, why: str(out.why, 200) });
});
