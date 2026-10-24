/**
 * Blurs the other items in a saved gear photo, so a photo of a light and a pen
 * saved for the light shows the pen softly out of focus (the background stays
 * sharp). Done in plain JavaScript on the already-cropped photo, so it works
 * the same on iPhone, Android and the web without anything extra to install.
 */
import { File } from 'expo-file-system';
import { decode, encode } from 'jpeg-js';

import { hull } from '@/components/outlined-photo';
import type { Identified } from '@/lib/api';
import { photoUri } from '@/lib/photos';

type Pt = [number, number];

/** The area an item covers, as fractions of the picture: its outline's hull, or its box. */
export function areaOf(it: Identified): Pt[] | null {
  if (it.outline && it.outline.length >= 6) {
    const h = hull(it.outline as Pt[]);
    if (h.length >= 3) return h;
  }
  if (!it.box) return null;
  const { x, y, w, h } = it.box;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

function fill(mask: Uint8Array, w: number, h: number, poly: Pt[], value: number) {
  const ys = poly.map((p) => p[1]);
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  for (let y = top; y <= bottom; y += 1) {
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) xs.push(a[0] + ((y + 0.5 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.round(xs[k]!));
      const to = Math.min(w - 1, Math.round(xs[k + 1]!));
      for (let x = from; x <= to; x += 1) mask[y * w + x] = value;
    }
  }
}

/** A box blur of an RGB image, three passes (close to a Gaussian). */
function blurSmall(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const stride = horizontal ? 3 : w * 3;
    const lineStride = horizontal ? w * 3 : 3;
    for (let l = 0; l < lines; l += 1) {
      const base = l * lineStride;
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        for (let i = -r; i <= r; i += 1) sum += from[base + Math.min(len - 1, Math.max(0, i)) * stride + c]!;
        for (let i = 0; i < len; i += 1) {
          to[base + i * stride + c] = sum / (2 * r + 1);
          sum += from[base + Math.min(len - 1, i + r + 1) * stride + c]! - from[base + Math.max(0, i - r) * stride + c]!;
        }
      }
    }
  };
  for (let n = 0; n < 3; n += 1) {
    pass(a, b, true);
    pass(b, a, false);
  }
  return a;
}

/**
 * Blurs the given areas (fractions of the original picture) in the stored photo,
 * leaving `keep` sharp. `source` is the original picture's size and `crop` how it was cropped.
 */
export async function blurAreasInPhoto(
  stored: string,
  areas: Pt[][],
  keep: Pt[] | null,
  source: { width: number; height: number },
  crop: { originX: number; originY: number; size: number },
): Promise<void> {
  const uri = photoUri(stored);
  if (!uri || areas.length === 0) return;
  const file = new File(uri);
  const b64 = await file.base64();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const img = decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
  const { width: W, height: H } = img;

  // Where each area lands in the cropped photo.
  const size = Math.max(1, Math.round(Math.min(crop.size, source.width, source.height)));
  const ox = Math.max(0, Math.min(source.width - size, Math.round(crop.originX)));
  const oy = Math.max(0, Math.min(source.height - size, Math.round(crop.originY)));
  const place = (poly: Pt[]): Pt[] => poly.map(([x, y]) => [((x * source.width - ox) * W) / size, ((y * source.height - oy) * H) / size] as Pt);
  const mask = new Uint8Array(W * H);
  for (const a of areas) fill(mask, W, H, place(a), 1);
  if (keep) fill(mask, W, H, place(keep), 0);
  let any = false;
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) { any = true; break; }
  if (!any) return;

  // Blur a quarter-size copy (fast), then bring it back where the mask says.
  const S = 4;
  const sw = Math.max(1, Math.floor(W / S));
  const sh = Math.max(1, Math.floor(H / S));
  const small = new Float32Array(sw * sh * 3);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < S; dy += 1) {
        for (let dx = 0; dx < S; dx += 1) {
          const p = ((y * S + dy) * W + (x * S + dx)) * 4;
          r += img.data[p]!; g += img.data[p + 1]!; b += img.data[p + 2]!;
        }
      }
      const q = (y * sw + x) * 3;
      small[q] = r / (S * S); small[q + 1] = g / (S * S); small[q + 2] = b / (S * S);
    }
  }
  const blurred = blurSmall(small, sw, sh, Math.max(3, Math.round(sw / 22)));
  for (let y = 0; y < H; y += 1) {
    const fy = Math.min(sh - 1, Math.max(0, y / S - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x += 1) {
      if (!mask[y * W + x]) continue;
      const fx = Math.min(sw - 1, Math.max(0, x / S - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const p = (y * W + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const top = blurred[(y0 * sw + x0) * 3 + c]! * (1 - tx) + blurred[(y0 * sw + x1) * 3 + c]! * tx;
        const bottom = blurred[(y1 * sw + x0) * 3 + c]! * (1 - tx) + blurred[(y1 * sw + x1) * 3 + c]! * tx;
        img.data[p + c] = top * (1 - ty) + bottom * ty;
      }
    }
  }
  const out = encode({ data: img.data, width: W, height: H }, 85);
  file.write(new Uint8Array(out.data));
}
