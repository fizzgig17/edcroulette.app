/**
 * Tightens each item's outline against the real picture. The photo check gives a
 * rough outline; this learns what the item looks like (from the middle of the
 * rough outline) and what the surroundings look like (from outside it), then
 * keeps the pixels that look like the item. The result is the hull of those
 * pixels. If anything looks off, the rough outline is kept.
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { areaOf } from '@/lib/blur-items';
import { hull } from '@/components/outlined-photo';
import { decode } from '@/lib/jpeg';
import { findObjects, lastMaskProblem, type InstanceMask } from '@/lib/subject-mask';
import { photoUri } from '@/lib/photos';
import type { Identified } from '@/lib/api';

type Pt = [number, number];

const EDGE = 320;

function scaled(poly: Pt[], k: number): Pt[] {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt);
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

const area = (p: Pt[]) => Math.abs(p.reduce((s, a, i) => s + (a[0] * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * a[1]), 0)) / 2;

/** A few colour centres (k-means) describing a set of RGB samples. */
function centres(samples: number[][], k: number): number[][] {
  if (samples.length === 0) return [];
  const sorted = [...samples].sort((a, b) => a[0]! + a[1]! + a[2]! - (b[0]! + b[1]! + b[2]!));
  let c = Array.from({ length: Math.min(k, sorted.length) }, (_, i) => [...sorted[Math.floor(((i + 0.5) * sorted.length) / Math.min(k, sorted.length))]!]);
  for (let it = 0; it < 6; it += 1) {
    const sum = c.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let best = 0;
      let bd = Infinity;
      c.forEach((m, i) => {
        const d = (s[0]! - m[0]!) ** 2 + (s[1]! - m[1]!) ** 2 + (s[2]! - m[2]!) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      const t = sum[best]!;
      t[0]! += s[0]!; t[1]! += s[1]!; t[2]! += s[2]!; t[3]! += 1;
    }
    c = c.map((m, i) => (sum[i]![3]! > 0 ? [sum[i]![0]! / sum[i]![3]!, sum[i]![1]! / sum[i]![3]!, sum[i]![2]! / sum[i]![3]!] : m));
  }
  return c;
}

const dist = (s: ArrayLike<number>, o: number, cs: number[][]) => {
  let bd = Infinity;
  for (const m of cs) {
    const d = (s[o]! - m[0]!) ** 2 + (s[o + 1]! - m[1]!) ** 2 + (s[o + 2]! - m[2]!) ** 2;
    if (d < bd) bd = d;
  }
  return bd;
};

/** The pixels (small copy of the photo) and the same function on plain data, for testing. */
export function refineAreas(data: ArrayLike<number>, W: number, H: number, rough: (Pt[] | null)[]): (Pt[] | null)[] {
  const polys = rough.map((r) => (r ? r.map(([x, y]) => [x * W, y * H] as Pt) : null));
  return polys.map((poly, idx) => {
    if (!poly) return null;
    const core = scaled(poly, 0.6);
    const near = scaled(poly, 1.25);
    const ringIn = scaled(poly, 1.1);
    const ringOut = scaled(poly, 1.7);
    const others = polys.filter((p, i) => p && i !== idx) as Pt[][];
    const otherZones = others.map((p) => scaled(p, 1.12));
    const otherCores = others.map((p) => scaled(p, 0.95));
    const itemS: number[][] = [];
    const bgS: number[][] = [];
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...scaled(poly, 1.7).map((p) => p[0]))));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...scaled(poly, 1.7).map((p) => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...scaled(poly, 1.7).map((p) => p[1]))));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...scaled(poly, 1.7).map((p) => p[1]))));
    void xs; void ys;
    const nearFlag = new Uint8Array(W * H);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const o = (y * W + x) * 4;
        const px = [data[o]!, data[o + 1]!, data[o + 2]!];
        if (inside(core, x + 0.5, y + 0.5)) itemS.push(px);
        else if (!inside(ringIn, x + 0.5, y + 0.5) && inside(ringOut, x + 0.5, y + 0.5) && !otherZones.some((z) => inside(z, x + 0.5, y + 0.5))) bgS.push(px);
        if (inside(near, x + 0.5, y + 0.5) && !otherCores.some((z) => inside(z, x + 0.5, y + 0.5))) nearFlag[y * W + x] = 1;
      }
    }
    if (itemS.length < 30 || bgS.length < 30) return null;
    const ic = centres(itemS, 3);
    const bc = centres(bgS, 3);
    // Label every candidate pixel: does it look more like the item than like the surroundings?
    const lab = new Uint8Array(W * H);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!nearFlag[y * W + x]) continue;
        const o = (y * W + x) * 4;
        if (dist(data, o, ic) <= dist(data, o, bc)) lab[y * W + x] = 1;
      }
    }
    // Remove specks (3x3 erosion), then grow from the middle of the item.
    const er = new Uint8Array(W * H);
    for (let y = Math.max(1, y0); y <= Math.min(H - 2, y1); y += 1) {
      for (let x = Math.max(1, x0); x <= Math.min(W - 2, x1); x += 1) {
        let all = 1;
        for (let dy = -1; dy <= 1 && all; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (!lab[(y + dy) * W + x + dx]) { all = 0; break; }
        er[y * W + x] = all;
      }
    }
    const seen = new Uint8Array(W * H);
    const stack: number[] = [];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (er[y * W + x] && inside(core, x + 0.5, y + 0.5)) { seen[y * W + x] = 1; stack.push(y * W + x); }
      }
    }
    let count = 0;
    while (stack.length) {
      const p = stack.pop()!;
      count += 1;
      const x = p % W;
      const y = (p - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const q = (y + dy) * W + x + dx;
        if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && er[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (count < 12) return null;
    const poly2 = rowPolygon((x, y) => !!seen[y * W + x], x0, x1, y0, y1, 1.5, 2.5);
    if (!poly2) return null;
    // The hull of the smoothed edges: tight, and not thrown off by a patch the colours got wrong.
    const simple = simplify(hull(poly2), 0.8);
    if (simple.length < 4) return null;
    const ratio = area(simple) / area(poly);
    if (ratio < 0.55 || ratio > 1.45) return null;
    return simple.map(([x, y]) => [Math.min(1, Math.max(0, x / W)), Math.min(1, Math.max(0, y / H))] as Pt);
  });
}

/** An item's left and right edge on every row, smoothed so a stray pixel doesn't spike the outline. */
function rowPolygon(has: (x: number, y: number) => boolean, x0: number, x1: number, y0: number, y1: number, padL: number, padR: number): Pt[] | null {
  const rows: number[] = [];
  const left: number[] = [];
  const right: number[] = [];
  for (let y = y0; y <= y1; y += 1) {
    let lo = -1;
    let hi = -1;
    for (let x = x0; x <= x1; x += 1) if (has(x, y)) { if (lo < 0) lo = x; hi = x; }
    if (lo >= 0) { rows.push(y); left.push(lo); right.push(hi); }
  }
  if (rows.length < 6) return null;
  const med = (arr: number[], i: number) => {
    const w = arr.slice(Math.max(0, i - 3), Math.min(arr.length, i + 4)).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)]!;
  };
  const out: Pt[] = [];
  for (let i = 0; i < rows.length; i += 1) out.push([med(left, i) - padL, rows[i]!]);
  for (let i = rows.length - 1; i >= 0; i -= 1) out.push([med(right, i) + padR, rows[i]! + 1]);
  return out;
}

/** Outlines from the phone's object finder: each item is the labelled object that sits in its rough outline. */
export function outlinesFromObjects(mask: InstanceMask, rough: (Pt[] | null)[]): (Pt[] | null)[] {
  const { width: W, height: H, labels } = mask;
  const polys = rough.map((r) => (r ? r.map(([x, y]) => [x * W, y * H] as Pt) : null));
  const cores = polys.map((p) => (p ? scaled(p, 0.7) : null));
  return polys.map((poly, idx) => {
    const core = cores[idx];
    if (!poly || !core) return null;
    const box = scaled(poly, 1.6);
    const bx0 = Math.max(0, Math.floor(Math.min(...box.map((p) => p[0]))));
    const bx1 = Math.min(W - 1, Math.ceil(Math.max(...box.map((p) => p[0]))));
    const by0 = Math.max(0, Math.floor(Math.min(...box.map((p) => p[1]))));
    const by1 = Math.min(H - 1, Math.ceil(Math.max(...box.map((p) => p[1]))));
    // Which object fills this item's middle?
    const votes = new Map<number, number>();
    let inCore = 0;
    for (let y = by0; y <= by1; y += 1) {
      for (let x = bx0; x <= bx1; x += 1) {
        if (!inside(core, x + 0.5, y + 0.5)) continue;
        inCore += 1;
        const l = labels[y * W + x]!;
        if (l) votes.set(l, (votes.get(l) ?? 0) + 1);
      }
    }
    let label = 0;
    let best = 0;
    for (const [l, n] of votes) if (n > best) { best = n; label = l; }
    if (!label || best < inCore * 0.35) return null;
    // An object that also fills another item's middle is two items found as one: leave it.
    for (let j = 0; j < cores.length; j += 1) {
      const c = cores[j];
      if (j === idx || !c) continue;
      let shared = 0;
      for (let y = by0; y <= by1; y += 1) for (let x = bx0; x <= bx1; x += 1) if (labels[y * W + x] === label && inside(c, x + 0.5, y + 0.5)) shared += 1;
      if (shared > 40) return null;
    }
    // The object may only reach so far beyond the rough outline.
    const wide = scaled(poly, 1.5);
    let count = 0;
    const has = (x: number, y: number) => labels[y * W + x] === label && inside(wide, x + 0.5, y + 0.5);
    for (let y = by0; y <= by1; y += 1) for (let x = bx0; x <= bx1; x += 1) if (has(x, y)) count += 1;
    const poly2 = rowPolygon(has, bx0, bx1, by0, by1, 0.5, 1.5);
    if (!poly2) return null;
    const simple = simplify(poly2, 0.9);
    void count;
    const ratio = area(simple) / area(poly);
    if (simple.length < 4 || ratio < 0.4 || ratio > 1.8) return null;
    return simple.map(([x, y]) => [Math.min(1, Math.max(0, x / W)), Math.min(1, Math.max(0, y / H))] as Pt);
  });
}

/** Douglas-Peucker: drops points that lie within `eps` of the line between their neighbours. */
function simplify(pts: Pt[], eps: number): Pt[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const a = pts[s]!;
    const b = pts[e]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let best = -1;
    let bd = 0;
    for (let i = s + 1; i < e; i += 1) {
      const p = pts[i]!;
      const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd > eps) { keep[best] = 1; stack.push([s, best], [best, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Refines every item's outline from the saved photo; items it can't improve are returned unchanged. */
export async function refineItems(stored: string, items: Identified[]): Promise<Identified[]> {
  const uri = photoUri(stored);
  if (!uri) return items;
  const small = await ImageManipulator.manipulate(uri).resize({ width: EDGE }).renderAsync();
  const saved = await small.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const f = new File(saved.uri);
  const bin = atob(await f.base64());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  try {
    f.delete();
  } catch {
    // Cleaned up with the cache.
  }
  const img = decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 128 });
  const rough = items.map((it) => areaOf(it));
  const colour = refineAreas(img.data, img.width, img.height, rough);
  // The phone's own object finder, where there is one (iPhone): exact, so it wins.
  const objects = await findObjects(uri);
  const exact = objects ? outlinesFromObjects(objects, rough) : [];
  const note = objects ? undefined : (lastMaskProblem ?? undefined);
  const refined = colour.map((c, i) => exact[i] ?? c);
  return items.map((it, i) => {
    const r = refined[i];
    if (!r) return { ...it, outlineSource: 'rough' as const };
    const xs = r.map((p) => p[0]);
    const ys = r.map((p) => p[1]);
    const left = Math.min(...xs), top = Math.min(...ys);
    return { ...it, outlineSource: exact[i] ? ('object finder' as const) : ('colours' as const), outlineNote: exact[i] ? undefined : note, tight: true, outline: r, box: { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top } };
  });
}
