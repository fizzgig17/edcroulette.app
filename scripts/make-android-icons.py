"""
Makes the Android icon art from the iOS icons (assets/images/icons/*.png, four metal discs on a dark square):
the discs alone on a transparent canvas, scaled into the adaptive-icon safe zone. Also writes the splash image
and the one-colour (themed) icon. Run: python3 scripts/make-android-icons.py
"""
import cv2, numpy as np, glob, os

SRC = 'assets/images/icons'
OUT = 'assets/images/icons/android'
SAFE = 0.64  # discs' share of the canvas: the visible circle of an adaptive icon is about 2/3

def find_discs(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    g = cv2.GaussianBlur(g, (0, 0), 3)
    _, th = cv2.threshold(g, 62, 255, cv2.THRESH_BINARY)
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))
    cs, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cs = sorted(cs, key=cv2.contourArea, reverse=True)[:4]
    return [cv2.minEnclosingCircle(c) for c in cs]  # ((x, y), r)

def cutout(path, discs, scale, canvas, white=False):
    img = cv2.imread(path)
    mask = np.zeros(img.shape[:2], np.uint8)
    for (x, y), r in discs:
        cv2.circle(mask, (int(x), int(y)), int(r - 1), 255, -1, cv2.LINE_AA)
    xs = [x for (x, y), r in discs for x in (x - r, x + r)]
    ys = [y for (x, y), r in discs for y in (y - r, y + r)]
    x0, x1, y0, y1 = int(min(xs)), int(max(xs)), int(min(ys)), int(max(ys))
    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = cv2.GaussianBlur(mask, (0, 0), 1.2)
    if white:
        glyph = (img.min(axis=2) > 232).astype(np.uint8) * 255      # the white tool silhouettes
        glyph = cv2.morphologyEx(glyph, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        rgba[:, :, :3] = 255
        rgba[:, :, 3] = cv2.GaussianBlur(cv2.subtract(mask, glyph), (0, 0), 1.2)
    crop = rgba[y0:y1, x0:x1]
    side = max(crop.shape[:2])
    target = int(canvas * scale)
    k = target / side
    crop = cv2.resize(crop, (int(crop.shape[1] * k), int(crop.shape[0] * k)), interpolation=cv2.INTER_AREA)
    out = np.zeros((canvas, canvas, 4), np.uint8)
    oy = (canvas - crop.shape[0]) // 2
    ox = (canvas - crop.shape[1]) // 2
    out[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
    return out

mixed = f'{SRC}/mixed.png'
discs = find_discs(cv2.imread(mixed))
print('discs', [(round(x), round(y), round(r)) for (x, y), r in discs])
cv2.imwrite('assets/images/android-foreground.png', cutout(mixed, discs, SAFE, 1024))
cv2.imwrite('assets/images/android-monochrome.png', cutout(mixed, discs, SAFE, 1024, white=True))
cv2.imwrite('assets/images/splash.png', cutout(mixed, discs, 0.98, 512))
for p in sorted(glob.glob(f'{SRC}/*.png')):
    name = os.path.basename(p)
    if name == 'mixed.png':
        continue
    cv2.imwrite(f'{OUT}/{name}', cutout(p, discs, SAFE, 1024))
print('done')
