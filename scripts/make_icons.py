"""Draws the app icons: a kit of four metal discs, each with a piece of gear (knife, light, pen, multi-tool).
Run after make_metals.py:  python3 scripts/make_icons.py
Writes assets/images/icons/<id>.png (1024) and icons/dev/<id>.png (same with a red DEV band, used by dev builds).
`mixed` is the default icon (four different metals); every metal also has an all-one-metal kit."""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 1024
OUT = 'assets/images/icons'
os.makedirs(OUT + '/dev', exist_ok=True)
AMBER = (232, 163, 61, 255)
HILO = {
    'damascus': ((227, 231, 236), (74, 81, 90)), 'mokume': ((232, 184, 128), (122, 69, 36)), 'timascus': ((154, 168, 240), (42, 36, 104)),
    'titanium': ((201, 206, 214), (94, 102, 112)), 'zirconium': ((126, 120, 184), (20, 22, 28)), 'copper': ((237, 174, 128), (138, 69, 34)),
    'brass': ((242, 210, 131), (143, 106, 30)), 'steel': ((230, 233, 238), (106, 113, 123)),
}
KITS = {'mixed': ['damascus', 'mokume', 'timascus', 'brass'], **{m: [m] * 4 for m in HILO}}
KINDS = ['knife', 'light', 'pen', 'tool']
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
def tex(n, size=S): return Image.open(f'scripts/.metals-512/{n}.png').convert('RGBA').resize((size, size), Image.LANCZOS)
def bg():
    d = np.sqrt((xx - S * .5) ** 2 + (yy - S * .42) ** 2) / (S * .75); t = np.clip(d, 0, 1)[..., None]
    return Image.fromarray((np.array([46, 52, 62], np.float32) * (1 - t) + np.array([14, 16, 20], np.float32) * t).astype(np.uint8)).convert('RGBA')
def mask(size, fn, k=3):
    m = Image.new('L', (size[0] * k, size[1] * k), 0); fn(ImageDraw.Draw(m), k); return m.resize(size, Image.LANCZOS)
def grad_rim(size, metal):
    hi, lo = (np.array(c, np.float32) for c in HILO[metal]); w, h = size
    fy, fx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = np.clip(1 - np.abs((fx / w + fy / h) / 2 - .5) * 4, 0, 1)[..., None]
    return Image.fromarray((lo * (1 - t) + hi * t).astype(np.uint8)).convert('RGBA')
def dome(size, a1=110, a2=130):
    w, h = size; fy, fx = np.mgrid[0:h, 0:w].astype(np.float32); diag = fx / w * .35 + fy / h * .65
    a = np.zeros((h, w, 4), np.float32); a[..., :3] = np.where(diag[..., None] < .45, 255, 0)
    a[..., 3] = np.where(diag < .45, (.45 - diag) / .45 * a1, (diag - .45) / .55 * a2)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')
def shadow(img, drawfn, dy=30, blur=26, alpha=190):
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); drawfn(ImageDraw.Draw(sh), dy, (0, 0, 0, alpha)); img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))
def disc(img, cx, cy, D, metal, rim=.07):
    x, y = cx - D // 2, cy - D // 2
    shadow(img, lambda d, dy, c: d.ellipse((x, y + dy, x + D, y + D + dy), fill=c))
    m = mask((D, D), lambda d, k: d.ellipse((0, 0, D * k - 1, D * k - 1), fill=255)); img.paste(grad_rim((D, D), metal), (x, y), m)
    r = int(D * rim); F = D - 2 * r
    face = tex(metal, F); face.alpha_composite(dome((F, F)))
    fm = mask((F, F), lambda d, k: d.ellipse((0, 0, F * k - 1, F * k - 1), fill=255)); img.paste(face, (x + r, y + r), fm)
def glyph_layer(kind, size, color=(255, 255, 255, 255)):
    k = 3; L = Image.new('RGBA', (size * k, size * k), (0, 0, 0, 0)); d = ImageDraw.Draw(L); u = size * k / 100
    P = lambda pts: [(a * u, b * u) for a, b in pts]
    if kind == 'knife':  # folding knife, tip to the right: handle, pocket clip, curved blade
        def q(p0, p1, p2, n=24): return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]
        d.rounded_rectangle((6 * u, 44 * u, 50 * u, 62 * u), 9 * u, fill=color)
        d.rounded_rectangle((12 * u, 38 * u, 38 * u, 44 * u), 3 * u, fill=color)
        blade = [(46, 45)] + q((46, 45), (74, 40), (97, 57)) + q((97, 57), (74, 64), (46, 62))
        d.polygon(P(blade), fill=color)
        d.ellipse((44 * u, 49 * u, 52 * u, 57 * u), fill=(0, 0, 0, 150))
        d.line(P([(54, 52), (84, 52)]), fill=(0, 0, 0, 70), width=int(1.6 * u))
    elif kind == 'light':
        d.rounded_rectangle((12 * u, 44 * u, 66 * u, 58 * u), 4 * u, fill=color)
        d.polygon(P([(64, 40), (84, 36), (84, 66), (64, 62)]), fill=color)
        d.rounded_rectangle((84 * u, 38 * u, 90 * u, 64 * u), 2 * u, fill=color)
    elif kind == 'pen':
        d.polygon(P([(8, 44), (68, 44), (94, 51), (68, 58), (8, 58)]), fill=color)
        d.rounded_rectangle((52 * u, 33 * u, 80 * u, 41 * u), 3 * u, fill=color)
    elif kind == 'tool':
        d.rounded_rectangle((8 * u, 38 * u, 52 * u, 49 * u), 5 * u, fill=color); d.rounded_rectangle((8 * u, 53 * u, 52 * u, 64 * u), 5 * u, fill=color)
        d.polygon(P([(48, 38), (80, 44), (80, 58), (48, 64)]), fill=color)
    return L.resize((size, size), Image.LANCZOS)
def put_glyph(img, kind, cx, cy, size, color=(255, 255, 255, 255)):
    g = glyph_layer(kind, size, color); sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sh.paste(Image.new('RGBA', g.size, (0, 0, 0, 255)), (cx - size // 2 + 4, cy - size // 2 + 10), g.split()[3])
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)).point(lambda v: int(v * .8)))
    gl = Image.new('RGBA', (S, S), (0, 0, 0, 0)); gl.paste(g, (cx - size // 2, cy - size // 2), g); img.alpha_composite(gl)
def font(sz, bold=True): return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', sz)



def make(kit, scale=1.0, dy=0):
    img = bg()
    for i, (m, kd) in enumerate(zip(KITS[kit], KINDS)):
        cx = 512 + (-1 if i % 2 == 0 else 1) * int(215 * scale)
        cy = 512 + dy + (-1 if i < 2 else 1) * int(215 * scale)
        disc(img, cx, cy, int(400 * scale), m, .08)
        put_glyph(img, kd, cx, cy, int(250 * scale))
    return img.convert('RGB')


def font_bold(sz):
    try:
        return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf', sz)
    except OSError:
        return ImageFont.load_default()


for kit in KITS:
    make(kit).save(f'{OUT}/{kit}.png')
    dev = make(kit, 0.8, -52)
    dd = ImageDraw.Draw(dev)
    dd.rectangle((0, int(S * 0.8), S, S), fill=(200, 38, 32))
    dd.text((S / 2, S * 0.9), 'DEV', font=font_bold(140), fill='white', anchor='mm')
    dev.save(f'{OUT}/dev/{kit}.png')
print('icons drawn')
