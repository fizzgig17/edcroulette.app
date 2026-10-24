"""Traces the edge of the opaque shape in a PNG and prints it as JSON for the demo photo:
{"box": {x, y, w, h}, "outline": [[x, y], ...]}, all as fractions (0 to 1) of the picture.
Run by make-demo-photo.mjs."""
import json
import sys

import cv2
import numpy as np

img = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
h, w = img.shape[:2]
mask = (img[:, :, 3] > 200).astype('uint8') * 255
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(contours, key=cv2.contourArea)
x, y, bw, bh = cv2.boundingRect(c)
peri = cv2.arcLength(c, True)
eps = 0.004 * peri
pts = cv2.approxPolyDP(c, eps, True)
while len(pts) > 22:
    eps *= 1.25
    pts = cv2.approxPolyDP(c, eps, True)
print(json.dumps({
    'box': {'x': round(x / w, 4), 'y': round(y / h, 4), 'w': round(bw / w, 4), 'h': round(bh / h, 4)},
    'outline': [[round(float(p[0][0]) / w, 4), round(float(p[0][1]) / h, 4)] for p in pts],
}))
