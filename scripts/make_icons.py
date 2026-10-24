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


def rr_mask(w, h, r, k=3):
    m = Image.new('L', (w * k, h * k), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * k - 1, h * k - 1), r * k, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def make(mid):
    """Three tall wheels cut from the metal, with an amber payline across them."""
    img = background()
    W, H, GAP, R, RIM = 236, 640, 36, 74, 14
    x0 = (S - (3 * W + 2 * GAP)) // 2
    y0 = (S - H) // 2 - 6
    hi, lo = (np.array(rgb(c), np.float32) for c in HILO[mid])
    tex = Image.open(f'scripts/.metals-512/{mid}.png').convert('RGB').resize((1024, 1024), Image.LANCZOS)
    # shadow under all three
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    for i in range(3):
        x = x0 + i * (W + GAP)
        d.rounded_rectangle((x, y0 + 30, x + W, y0 + H + 30), R, fill=(0, 0, 0, 200))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(26)))
    fy, fx = np.mgrid[0:H, 0:W].astype(np.float32)
    for i in range(3):
        x = x0 + i * (W + GAP)
        # rim
        t = np.clip(1 - np.abs((fx / W + fy / H) / 2 - 0.5) * 4, 0, 1)[..., None]
        rim = Image.fromarray((lo * (1 - t) + hi * t).astype(np.uint8)).convert('RGBA')
        img.paste(rim, (x, y0), rr_mask(W, H, R))
        # face: a different slice of the metal in each wheel
        fw, fh = W - RIM * 2, H - RIM * 2
        ox, oy = 90 + i * 260, 120 + i * 90
        face = tex.crop((ox, oy, ox + fw, oy + fh)).convert('RGBA')
        a = np.zeros((fh, fw, 4), np.float32)
        gy, gx = np.mgrid[0:fh, 0:fw].astype(np.float32)
        v = gy / fh
        edge = np.clip(np.abs(v - 0.5) * 2, 0, 1)  # 0 at the middle, 1 at the ends
        a[..., 3] = (smooth_np(edge, 0.25, 1.0) ** 1.1) * 235  # the wheel curves away top and bottom
        face.alpha_composite(Image.fromarray(a.astype(np.uint8), 'RGBA'))
        sheen = np.zeros((fh, fw, 4), np.float32)
        sheen[..., :3] = 255
        sheen[..., 3] = np.exp(-(((gx / fw) - 0.28) / 0.12) ** 2) * 70 * (1 - edge * 0.8)  # cylinder highlight
        face.alpha_composite(Image.fromarray(sheen.astype(np.uint8), 'RGBA'))
        shade = np.zeros((fh, fw, 4), np.float32)
        shade[..., 3] = np.clip((gx / fw - 0.62) / 0.38, 0, 1) * 110  # shaded right edge
        face.alpha_composite(Image.fromarray(shade.astype(np.uint8), 'RGBA'))
        img.paste(face, (x + RIM, y0 + RIM), rr_mask(fw, fh, R - RIM))
    # amber payline: two bars across the middle, with pointers outside the outer wheels
    amber = (232, 163, 61, 255)
    pl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(pl)
    cy = y0 + H // 2
    for dy in (-92, 92):
        d.rectangle((x0 - 6, cy + dy - 8, x0 + 3 * W + 2 * GAP + 6, cy + dy + 8), fill=amber)
    d.polygon([(x0 - 70, cy - 40), (x0 - 70, cy + 40), (x0 - 8, cy)], fill=amber)
    xr = x0 + 3 * W + 2 * GAP
    d.polygon([(xr + 70, cy - 40), (xr + 70, cy + 40), (xr + 8, cy)], fill=amber)
    img.alpha_composite(pl.filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * 0.55)))
    img.alpha_composite(pl)
    out = img.convert('RGB')
    out.save(f'{OUT}/{mid}.png')
    dev = out.copy()
    dd = ImageDraw.Draw(dev)
    dd.rectangle((0, int(S * 0.78), S, S), fill=(200, 38, 32))
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf', 150)
    except OSError:
        font = ImageFont.load_default()
    dd.text((S / 2, S * 0.89), 'DEV', font=font, fill='white', anchor='mm')
    dev.save(f'{OUT}/dev/{mid}.png')


def smooth_np(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


for i in IDS:
    make(i)
print('icons drawn')
