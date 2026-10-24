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
    const near = scaled(poly, 1.3);
    const others = polys.filter((p, i) => p && i !== idx) as Pt[][];
    const otherZones = others.map((p) => scaled(p, 1.12));
    const otherCores = others.map((p) => scaled(p, 0.95));
    const itemS: number[][] = [];
    const bgS: number[][] = [];
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...scaled(poly, 1.5).map((p) => p[0]))));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...scaled(poly, 1.5).map((p) => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...scaled(poly, 1.5).map((p) => p[1]))));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...scaled(poly, 1.5).map((p) => p[1]))));
    void xs; void ys;
    const nearFlag = new Uint8Array(W * H);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const o = (y * W + x) * 4;
        const px = [data[o]!, data[o + 1]!, data[o + 2]!];
        if (inside(core, x + 0.5, y + 0.5)) itemS.push(px);
        else if (!inside(near, x + 0.5, y + 0.5) && !otherZones.some((z) => inside(z, x + 0.5, y + 0.5))) bgS.push(px);
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
    const pts: Pt[] = [];
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W;
      const y = (p - x) / W;
      pts.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const q = (y + dy) * W + x + dx;
        if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && er[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (pts.length < 12) return null;
    const h = hull(pts);
    if (h.length < 3) return null;
    const ratio = area(h) / area(poly);
    if (ratio < 0.55 || ratio > 1.45) return null;
    // Back to fractions, and grown by a pixel for the 3x3 erosion.
    const hc = scaled(h, 1.0);
    return hc.map(([x, y]) => [Math.min(1, Math.max(0, x / W)), Math.min(1, Math.max(0, y / H))] as Pt);
  });
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
  const refined = refineAreas(img.data, img.width, img.height, items.map((it) => areaOf(it)));
  return items.map((it, i) => {
    const r = refined[i];
    if (!r) return it;
    const xs = r.map((p) => p[0]);
    const ys = r.map((p) => p[1]);
    const left = Math.min(...xs), top = Math.min(...ys);
    return { ...it, outline: r, box: { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top } };
  });
}
