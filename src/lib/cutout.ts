/**
 * Cutout photos: an item's outline (from the phone's object finder) is used to lift it out of its photo and set it on a
 * plain neutral background, turned to a consistent angle, so every piece in the collection looks alike. Nothing is
 * baked into the photo: the outline and a turn are stored with the piece, and the picture is drawn from them, so the
 * background and angle can be changed at any time. This file is the layout maths only (no screen code).
 */
export type Pt = [number, number];

/** The outline (fractions 0..1 of the stored photo, which is square) and how far the person turned it from the default angle. */
export type Cutout = { outline: Pt[]; turn: number };

export type PhotoStyle = 'original' | 'cutout';
/** The angle pieces are set at: long side corner to corner, long side up and down, or as photographed. */
export type CutoutLook = 'diagonal' | 'upright' | 'asis';
export type CutoutBg = 'gray' | 'charcoal' | 'light';

export const CUTOUT_BGS: Record<CutoutBg, { fill: string; shadow: string }> = {
  gray: { fill: '#D8D5CF', shadow: '#000000' },
  charcoal: { fill: '#2A2E33', shadow: '#000000' },
  light: { fill: '#F2F0EB', shadow: '#000000' },
};

/** How much of the square the piece fills along its longest side. */
const FILL = 0.8;

const rad = (d: number) => (d * Math.PI) / 180;
const norm = (d: number) => {
  let a = ((d % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a;
};

function rotate(points: Pt[], deg: number, c: Pt): Pt[] {
  const s = Math.sin(rad(deg));
  const k = Math.cos(rad(deg));
  return points.map(([x, y]) => [c[0] + (x - c[0]) * k - (y - c[1]) * s, c[1] + (x - c[0]) * s + (y - c[1]) * k] as Pt);
}

function bounds(points: Pt[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** The centre of the shape (area-weighted), falling back to the average of its points. */
function centroid(p: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i += 1) {
    const [x0, y0] = p[i]!;
    const [x1, y1] = p[(i + 1) % p.length]!;
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-6) return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * The turn (degrees, clockwise on screen) that puts the shape's long side along the target: the smallest-area box round
 * the shape gives its long axis, and of the two ways round (head up or head down) the one nearest how it was photographed wins.
 */
export function baseTurn(points: Pt[], look: CutoutLook): number {
  if (look === 'asis' || points.length < 3) return 0;
  const c = centroid(points);
  let best = 0;
  let bestArea = Infinity;
  for (let d = 0; d < 180; d += 2) {
    const b = bounds(rotate(points, d, c));
    const area = b.w * b.h;
    if (area < bestArea - 1e-9) {
      bestArea = area;
      best = d;
    }
  }
  const b = bounds(rotate(points, best, c));
  // After `best` the long side runs along x when w >= h, else along y. Put it along the horizontal first.
  const toHorizontal = b.w >= b.h ? best : best + 90;
  // Horizontal (the long side lying down) -> target: upright is a quarter turn, diagonal is 45 degrees up to the right.
  const target = look === 'upright' ? -90 : -45;
  const options = [toHorizontal + target, toHorizontal + target + 180].map(norm);
  return Math.abs(options[0]!) <= Math.abs(options[1]!) ? options[0]! : options[1]!;
}

export type CutoutLayout = {
  /** The outline in the photo's own pixels (the clip shape), as an SVG path. */
  clip: string;
  /** Moves the whole photo so the clipped piece is turned, scaled and centred in the square. */
  transform: string;
  /** A soft shadow under the piece, in the square's pixels. */
  shadow: { cx: number; cy: number; rx: number; ry: number };
};

/** Lays a piece out in a square of `size` pixels. The photo is drawn size x size too, so the outline is in the same pixels. */
export function cutoutLayout(cutout: Cutout, size: number, look: CutoutLook): CutoutLayout {
  const pts = cutout.outline.map(([x, y]) => [x * size, y * size] as Pt);
  const c = centroid(pts);
  const turn = baseTurn(pts, look) + cutout.turn;
  const b = bounds(rotate(pts, turn, c));
  const bc: Pt = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const longest = Math.max(b.w, b.h, 1);
  const s = (FILL * size) / longest;
  const f = (n: number) => n.toFixed(3);
  const half = size / 2;
  const transform = `translate(${f(half)} ${f(half)}) scale(${f(s)}) translate(${f(-bc[0])} ${f(-bc[1])}) rotate(${f(turn)} ${f(c[0])} ${f(c[1])})`;
  const clip = `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${f(x)} ${f(y)}`).join(' ')} Z`;
  const w = b.w * s;
  const h = b.h * s;
  return { clip, transform, shadow: { cx: half, cy: Math.min(size * 0.93, half + h / 2 - size * 0.01), rx: Math.max(size * 0.12, w * 0.46), ry: size * 0.035 } };
}
