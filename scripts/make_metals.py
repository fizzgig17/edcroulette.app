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
    im = Image.fromarray((img * 255).astype(np.uint8)).resize((256, 256), Image.LANCZOS)
    im.save(f'{OUT}/{name}.jpg', quality=90)


def warp(base_amp, scale, seed):
    return base_amp * fractal(scale, 3, seed=seed)


# --- Damascus: pattern-welded steel, etched so the nickel layers stand proud -------------
def damascus():
    w = warp(0.05, 60, 1)
    layers = np.sin((yy + w) * 2 * np.pi * 120) * 0.55 + np.sin((yy + 1.7 * w) * 2 * np.pi * 52) * 0.45
    ladder = 0.25 * np.sin(xx * 2 * np.pi * 7 + 6 * fractal(60, 2, seed=5))
    h = layers + ladder
    tone = smooth(h, -1.15, 1.15)
    rgb = palette(tone, [(40, 43, 48), (86, 91, 98), (156, 161, 168), (204, 208, 214)])
    finish(rgb, 'damascus', light(tone * 3, 1.4, grain=0.05, sheen=0.05), spec=0.3)


# --- Mokume gane: stacked copper, brass, silver and shakudo, carved and sanded to show contour lines
def mokume():
    f = fractal(55, 4, seed=11) * 0.9 + 0.25 * fractal(20, 2, seed=12)
    bands = (f * 2.6) % 1.0
    idx = np.floor(f * 2.6) % 4
    cols = np.array([(188, 108, 62), (214, 170, 86), (206, 208, 214), (62, 40, 44)], np.float32) / 255
    rgb = cols[idx.astype(int)]
    ramp = 0.8 + 0.4 * bands[..., None]
    edge = smooth(np.abs(bands - 0.5), 0.46, 0.5)[..., None]  # dark seam between layers
    rgb = rgb * ramp * (1 - 0.5 * edge)
    h = bands * 0.6 - edge[..., 0] * 0.4
    finish(rgb, 'mokume', light(h * 6, 1.1, grain=0.05, sheen=0.06), spec=0.25)


# --- Timascus: titanium damascus, heat-anodized to blue, violet and gold --------------------
def timascus():
    w = warp(0.07, 70, 21)
    h = np.sin((yy + w) * 2 * np.pi * 60) * 0.55 + np.sin((yy + 1.4 * w + 0.2 * xx) * 2 * np.pi * 26) * 0.45
    tone = smooth(h, -0.8, 0.8)
    tint = fractal(160, 2, seed=22) * 0.18
    rgb = palette(np.clip(tone + tint, 0, 1), [(18, 20, 52), (44, 56, 150), (112, 70, 176), (208, 150, 70), (226, 196, 128)])
    finish(rgb, 'timascus', light(tone * 3, 1.2, grain=0.04, sheen=0.05), spec=0.3)


# --- Titanium: bead-blasted, a soft cool gray with a faint blue heat tint ---------------------
def titanium():
    h = noise(0.9, seed=31) * 0.5 + fractal(8, 2, seed=32) * 0.12
    base = np.full((N, N, 3), (0.50, 0.52, 0.56), np.float32)
    tint = (fractal(180, 2, seed=33) * 0.012)[..., None] * np.array([0.5, 0.2, 1.0], np.float32)
    finish(base + tint, 'titanium', light(h, 0.8, grain=0.03, sheen=0.1) * 1.15, spec=0.2)


# --- Zirconium: black oxide with a blue and violet ripple -------------------------------------
def zirconium():
    f = fractal(100, 4, aniso=(1.0, 0.45), seed=41)
    tone = smooth(np.sin(f * 2.4) * 0.5 + 0.5, 0.15, 0.95)
    rgb = palette(tone, [(10, 10, 14), (22, 28, 48), (52, 46, 98), (28, 80, 96), (14, 16, 22)])
    finish(rgb, 'zirconium', light(f * 0.8, 0.7, grain=0.03, sheen=0.1) * 1.1, spec=0.35)


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
