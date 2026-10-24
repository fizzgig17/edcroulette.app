"""Draws the app icons: a round disc of each metal with the spin arrows, on gunmetal.
Run after make_metals.py:  python3 scripts/make_icons.py
Writes assets/images/icons/<id>.png (1024) and icons/dev/<id>.png (same with a red DEV band, used by dev builds)."""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 1024
IDS = ['damascus', 'mokume', 'timascus', 'titanium', 'zirconium', 'copper', 'brass', 'steel']
HILO = {  # rim colors, matching src/constants/metals.ts
    'damascus': ('#E3E7EC', '#4A515A'), 'mokume': ('#E8B880', '#7A4524'), 'timascus': ('#9AA8F0', '#2A2468'), 'titanium': ('#C9CED6', '#5E6670'),
    'zirconium': ('#7E78B8', '#14161C'), 'copper': ('#EDAE80', '#8A4522'), 'brass': ('#F2D283', '#8F6A1E'), 'steel': ('#E6E9EE', '#6A717B'),
}
rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
OUT = 'assets/images/icons'
os.makedirs(OUT + '/dev', exist_ok=True)
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)


def background():
    d = np.sqrt((xx - S * 0.5) ** 2 + (yy - S * 0.42) ** 2) / (S * 0.75)
    t = np.clip(d, 0, 1)[..., None]
    a, b = np.array([46, 52, 62], np.float32), np.array([14, 16, 20], np.float32)
    return Image.fromarray((a * (1 - t) + b * t).astype(np.uint8)).convert('RGBA')


def disc_mask(size, d):
    m = Image.new('L', (size * 4, size * 4), 0)
    c = size * 2
    ImageDraw.Draw(m).ellipse((c - d * 4, c - d * 4, c + d * 4, c + d * 4), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def arrows():
    """Two circular arrows (the spin symbol), white, drawn big and shrunk for smooth edges."""
    k = 3
    im = Image.new('RGBA', (S * k, S * k), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    c, R, w = S * k / 2, 205 * k, 46 * k
    for start in (200, 20):  # two arcs half a turn apart, each ~140 degrees, arrowhead at the clockwise end
        end = start + 140
        dr.arc((c - R, c - R, c + R, c + R), start, end, fill=(255, 255, 255, 255), width=int(w))
        a = math.radians(end)
        tip = (c + (R + 0) * math.cos(a) - 0, c + (R + 0) * math.sin(a))
        # arrowhead pointing along the clockwise tangent
        tx, ty = -math.sin(a), math.cos(a)
        nx, ny = math.cos(a), math.sin(a)
        L, W = 100 * k, 70 * k
        base = (tip[0] + tx * 6 * k, tip[1] + ty * 6 * k)
        p1 = (base[0] + nx * W, base[1] + ny * W)
        p2 = (base[0] - nx * W, base[1] - ny * W)
        p3 = (base[0] + tx * L, base[1] + ty * L)
        dr.polygon([p1, p2, p3], fill=(255, 255, 255, 255))
    return im.resize((S, S), Image.LANCZOS)


def make(mid):
    img = background()
    D = 700  # disc diameter
    off = (S - D) // 2
    # shadow
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((off, off + 34, off + D, off + D + 34), fill=(0, 0, 0, 190))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(28)))
    # rim: diagonal gradient hi -> lo -> hi
    hi, lo = (np.array(rgb(c), np.float32) for c in HILO[mid])
    g = ((xx + yy) / (2 * S))[..., None]
    t = np.abs(g - 0.5) * 2
    rim = Image.fromarray((hi * (1 - t) * 0 + (hi * (1 - np.abs(t - 1)) + lo * np.abs(t - 1)) * 1).astype(np.uint8)).convert('RGBA')
    rim_t = np.clip(1 - np.abs(((xx + yy) / (2 * S)) - 0.5) * 4, 0, 1)[..., None]
    rim = Image.fromarray((lo * (1 - rim_t) + hi * rim_t).astype(np.uint8)).convert('RGBA')
    m = Image.new('L', (S, S), 0)
    m.paste(disc_mask(D, D / 2), (off, off))
    img.paste(rim, (0, 0), m)
    # face
    F = D - 70
    face = Image.open(f'scripts/.metals-512/{mid}.png').convert('RGBA').resize((F, F), Image.LANCZOS)
    dome = np.zeros((F, F, 4), np.float32)
    fy, fx = np.mgrid[0:F, 0:F].astype(np.float32) / F
    diag = (fx * 0.35 + fy * 0.65)
    dome[..., :3] = np.where(diag[..., None] < 0.45, 255, 0)
    dome[..., 3] = np.where(diag < 0.45, (0.45 - diag) / 0.45 * 105, (diag - 0.45) / 0.55 * 130)
    face.alpha_composite(Image.fromarray(dome.astype(np.uint8), 'RGBA'))
    fm = disc_mask(F, F / 2)
    # engraved glyph with a soft shadow
    gl = arrows().resize((int(S * F / D * 0.78),) * 2, Image.LANCZOS)
    glow = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    gx = (F - gl.width) // 2
    shadow = Image.new('RGBA', (F, F), (0, 0, 0, 0))
    black = Image.new('RGBA', gl.size, (0, 0, 0, 255))
    shadow.paste(black, (gx + 4, gx + 10), gl.split()[3])
    face.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(9)))
    glow.paste(gl, (gx, gx), gl)
    face.alpha_composite(glow)
    img.paste(face, ((S - F) // 2, (S - F) // 2), fm)
    # glassy highlight on the upper left of the face
    out = img.convert('RGB')
    out.save(f'{OUT}/{mid}.png')
    dev = out.copy()
    d = ImageDraw.Draw(dev)
    d.rectangle((0, int(S * 0.78), S, S), fill=(200, 38, 32))
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf', 150)
    except OSError:
        font = ImageFont.load_default()
    d.text((S / 2, S * 0.89), 'DEV', font=font, fill='white', anchor='mm')
    dev.save(f'{OUT}/dev/{mid}.png')


for i in IDS:
    make(i)
print('icons drawn')
