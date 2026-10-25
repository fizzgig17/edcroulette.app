"""Draws the metal textures for the Spin button and tab icons (assets/images/metals/*.jpg).
Run: python3 scripts/make_metals.py   (needs numpy, scipy, Pillow).
Each is a height field (the pattern a smith would etch or forge) lit from the top left, with
fine grain and a soft sheen, so it reads as metal instead of a flat color ramp."""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

N = 512
rng = np.random.default_rng(7)
OUT = 'assets/images/metals'
HI = 'scripts/.metals-512'
os.makedirs(OUT, exist_ok=True)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / N


def noise(scale, aniso=(1, 1), seed=None):
    r = np.random.default_rng(seed if seed is not None else rng.integers(1e9))
    f = gaussian_filter(r.standard_normal((N, N)).astype(np.float32), (scale * aniso[0], scale * aniso[1]), mode='wrap')
    return (f - f.mean()) / (f.std() + 1e-6)


def fractal(base, octaves=4, aniso=(1, 1), seed=0):
    t = np.zeros((N, N), np.float32)
    for o in range(octaves):
        t += noise(base / (2 ** o), aniso, seed + o) / (1.9 ** o)
    return t / t.std()


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def palette(v, stops):
    """v in 0..1 -> rgb through evenly spaced color stops."""
    stops = np.array(stops, np.float32) / 255
    pos = np.clip(v, 0, 0.9999) * (len(stops) - 1)
    i = pos.astype(int)
    f = (pos - i)[..., None]
    return stops[i] * (1 - f) + stops[np.minimum(i + 1, len(stops) - 1)] * f


def light(h, strength, grain=0.0, sheen=0.0):
    """Lighting factor from a height field: light from the top left."""
    gy, gx = np.gradient(gaussian_filter(h, 1.0))
    nx, ny = -gx * strength, -gy * strength
    nz = np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    d = (nx * -0.5 + ny * -0.6 + nz * 0.62) / ln
    out = 0.55 + 0.9 * d
    if grain:
        out += grain * noise(0.7, seed=99)
    if sheen:
        out += sheen * np.sin((xx * 0.9 + yy * 1.4) * np.pi * 1.6)
    return out


def finish(rgb, name, L, spec=0.0):
    img = np.clip(rgb * L[..., None] + spec * np.clip(L - 1.0, 0, 1)[..., None], 0, 1)
    full = Image.fromarray((img * 255).astype(np.uint8))
    full.save(f'{OUT}/{name}.jpg', quality=88)
    os.makedirs(HI, exist_ok=True)  # full size copies, used only to draw the app icons
    full.save(f'{HI}/{name}.png')


def warp(base_amp, scale, seed):
    return base_amp * fractal(scale, 3, seed=seed)


# --- Damascus: pattern-welded steel, etched so the nickel layers stand proud -------------
def damascus():
    # Layers are bent twice: a broad flow, then a "raindrop" dimple pattern pressed into the stack.
    flow = fractal(150, 3, aniso=(1.0, 2.2), seed=1)
    dimples = np.zeros((N, N), np.float32)
    r = np.random.default_rng(3)
    for _ in range(26):
        cx, cy, rad = r.random(), r.random(), 0.04 + r.random() * 0.07
        d = np.sqrt(((xx - cx + 0.5) % 1 - 0.5) ** 2 + ((yy - cy + 0.5) % 1 - 0.5) ** 2)
        dimples += np.exp(-(d / rad) ** 2) * (0.5 + r.random())
    y = yy + 0.035 * flow + 0.06 * dimples
    h = np.sin(y * 2 * np.pi * 150) * 0.5 + np.sin(y * 2 * np.pi * 63 + 1.3) * 0.3 + np.sin(y * 2 * np.pi * 27) * 0.2
    h = h + 0.15 * noise(1.2, aniso=(0.6, 2.0), seed=9)
    tone = smooth(h, -0.95, 0.95)
    tone = gaussian_filter(tone, 0.7)
    rgb = palette(tone, [(58, 61, 67), (92, 96, 103), (138, 143, 150), (182, 186, 193), (212, 216, 222)])
    finish(rgb, 'damascus', light(tone * 1.8, 0.8, grain=0.03, sheen=0.1) * 1.08, spec=0.3)


# --- Mokume gane: stacked copper, brass, silver and shakudo, carved and sanded to show contour lines
def mokume():
    # Wood-grain style flow: stretched noise, many thin contour layers, muted metals with soft seams.
    f = fractal(70, 4, aniso=(1.0, 2.6), seed=11) + 0.35 * fractal(22, 3, aniso=(1.0, 2.2), seed=12)
    layers = 6.5
    v = f * layers
    idx = np.floor(v).astype(int) % 5
    frac = v - np.floor(v)
    cols = np.array([(176, 104, 66), (196, 156, 92), (190, 190, 192), (74, 54, 56), (164, 96, 62)], np.float32) / 255
    rgb = cols[idx]
    rgb = rgb * (0.82 + 0.3 * smooth(frac, 0.0, 1.0)[..., None])  # each layer brightens toward its upper edge
    seam = np.exp(-((frac - 0.0) / 0.035) ** 2) + np.exp(-((frac - 1.0) / 0.035) ** 2)
    rgb = rgb * (1 - 0.32 * np.clip(seam, 0, 1)[..., None])
    h = gaussian_filter(frac * 0.7 - np.clip(seam, 0, 1) * 0.4, 1.2)
    rgb = np.stack([gaussian_filter(rgb[..., c], 0.8) for c in range(3)], -1)
    finish(rgb, 'mokume', light(h * 4, 0.9, grain=0.02, sheen=0.08) * 1.05, spec=0.28)


# --- Timascus: titanium damascus, heat-anodized to blue, violet and gold --------------------
def timascus():
    flow = fractal(110, 3, aniso=(1.0, 1.7), seed=21)
    y = yy + 0.11 * flow + 0.03 * fractal(36, 2, aniso=(1.0, 1.6), seed=24)
    h = np.sin(y * 2 * np.pi * 70) * 0.5 + np.sin(y * 2 * np.pi * 31 + 0.7) * 0.32 + np.sin(y * 2 * np.pi * 13) * 0.18
    tone = smooth(h, -0.9, 0.9)
    heat = 0.5 + 0.5 * np.sin(fractal(200, 2, aniso=(1.0, 2.0), seed=22) * 1.6)  # slow colour drift across the bar
    v = np.clip(tone * 0.7 + heat * 0.3, 0, 1)
    v = gaussian_filter(v, 0.7)
    rgb = palette(v, [(24, 26, 56), (44, 58, 124), (96, 76, 156), (150, 108, 148), (198, 154, 96), (222, 196, 142)])
    finish(rgb, 'timascus', light(tone * 1.6, 0.8, grain=0.025, sheen=0.1) * 1.05, spec=0.3)


# --- Titanium: bead-blasted, a soft cool gray with a faint blue heat tint ---------------------
def titanium():
    # Satin: very fine, mostly horizontal grain over a soft cool gradient; no coarse bumps to blow up on a big button.
    h = noise(1.0, aniso=(0.05, 30), seed=31) * 0.5 + noise(0.8, seed=34) * 0.2
    sweep = 0.5 + 0.5 * np.sin((xx * 0.8 + yy * 0.5) * np.pi * 2)
    tone = 0.46 + 0.1 * sweep + 0.03 * h
    base = np.stack([tone * 0.97, tone * 1.0, tone * 1.06], -1)
    tint = (fractal(180, 2, seed=33) * 0.01)[..., None] * np.array([0.5, 0.2, 1.0], np.float32)
    finish(base + tint, 'titanium', light(h * 0.25, 0.4, grain=0.015, sheen=0.06) * 1.2, spec=0.2)


# --- Zirconium: black oxide with a soft blue, violet and bronze oil-slick flow ----------------
def zirconium():
    f = fractal(140, 4, aniso=(1.0, 2.4), seed=41)
    f2 = fractal(60, 3, aniso=(1.0, 3.0), seed=42)
    v = 0.5 + 0.5 * np.sin(f * 1.7 + f2 * 0.8)
    v = smooth(v, 0.1, 0.95)
    rgb = palette(v, [(9, 9, 12), (16, 20, 34), (30, 40, 80), (62, 52, 110), (84, 60, 78), (40, 34, 30), (12, 12, 15)])
    # fine brushed streaks
    streak = noise(1.0, aniso=(0.04, 40), seed=44)
    L = light(f * 0.5 + streak * 0.15, 0.6, grain=0.025, sheen=0.12) * 1.12
    finish(rgb, 'zirconium', L, spec=0.45)


# --- Brushed copper, brass and steel -----------------------------------------------------------
def brushed(name, stops, seed, amount=0.16):
    h = noise(1.0, aniso=(0.02, 55), seed=seed) * 0.6 + noise(0.6, aniso=(0.05, 20), seed=seed + 1) * 0.4
    tone = np.clip(0.5 + amount * h + 0.18 * np.sin((xx * 1.0 + yy * 0.6) * np.pi * 2.2), 0, 1)
    rgb = palette(tone, stops)
    finish(rgb, name, light(h * 0.3, 0.5, grain=0.02, sheen=0.08) * 1.1, spec=0.4)


damascus(); mokume(); timascus(); titanium(); zirconium()
brushed('copper', [(112, 56, 30), (176, 96, 54), (222, 150, 100), (246, 190, 146)], 51)
brushed('brass', [(120, 86, 26), (184, 140, 50), (228, 190, 100), (248, 224, 156)], 61)
brushed('steel', [(96, 102, 110), (150, 156, 164), (204, 209, 216), (238, 241, 246)], 71, 0.2)
print('metals drawn')
