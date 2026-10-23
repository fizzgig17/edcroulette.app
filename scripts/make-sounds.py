"""Generates the Spin screen's sound effects (assets/sounds/*.wav) with numpy.

Soft mechanical ticks, nothing casino-like:
  spin.wav  1.0 s loop of quick light ticks (the wheels turning)
  slow.wav  ticks that space out and fade (the wheels slowing)
  stop.wav  one soft tock (a wheel stopping)
  land.wav  a deeper tock with a short low tail (the last wheel stopping)
Run: python3 scripts/make-sounds.py
"""
import wave
import numpy as np

SR = 22050
rng = np.random.default_rng(7)


def tick(pitch=1.0, level=1.0, length=0.05):
    n = int(SR * length)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t * 700)
    # crude band-pass: difference of two smoothed copies
    k1, k2 = 3, 24
    a = np.convolve(noise, np.ones(k1) / k1, 'same')
    b = np.convolve(noise, np.ones(k2) / k2, 'same')
    click = (a - b) * 2.2
    body = np.sin(2 * np.pi * 760 * pitch * t) * np.exp(-t * 170) * 0.7
    out = (click * 0.8 + body) * level
    return out


def place(buf, sig, at):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    if i < len(buf):
        buf[i:j] += sig[: j - i]


def save(name, data, peak=0.8):
    data = data / max(1e-9, np.max(np.abs(data))) * peak
    pcm = (np.clip(data, -1, 1) * 32767).astype('<i2')
    with wave.open(f'assets/sounds/{name}.wav', 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# spin: 1.0 s, 24 ticks/s with slight variation, plus a faint airy bed. Loops cleanly
# because the last tick ends well before the end and the bed fades at both ends.
buf = np.zeros(SR)
rate = 24
for k in range(rate):
    at = k / rate + rng.uniform(-0.002, 0.002)
    place(buf, tick(pitch=1 + rng.uniform(-0.05, 0.05), level=0.8 + rng.uniform(-0.15, 0.15)), max(0, at))
bed = np.convolve(rng.standard_normal(SR), np.ones(40) / 40, 'same') * 0.05
win = np.sin(np.linspace(0, np.pi, SR)) ** 2
buf += bed * win
save('spin', buf, 0.55)

# slow: ticks follow an ease-out, so they space out and soften, ending on silence.
D = 1.4
buf = np.zeros(int(SR * (D + 0.1)))
rows = 11  # ticks over the slowdown
for k in range(rows):
    u = (k + 1) / rows                     # 0..1 of the way through the travel
    at = D * (1 - (1 - u) ** (1 / 3))      # inverse of a cubic ease-out position
    place(buf, tick(pitch=1 - 0.18 * u, level=0.85 - 0.45 * u), at)
save('slow', buf, 0.6)

# stop: one soft tock.
buf = np.zeros(int(SR * 0.22))
place(buf, tick(pitch=0.62, level=1.0, length=0.09), 0.005)
save('stop', buf, 0.7)

# land: deeper tock plus a short low tail.
n = int(SR * 0.5)
t = np.arange(n) / SR
buf = np.zeros(n)
place(buf, tick(pitch=0.45, level=1.0, length=0.1), 0.005)
buf += np.sin(2 * np.pi * 150 * t) * np.exp(-t * 11) * 0.45
buf[: int(SR * 0.004)] *= np.linspace(0, 1, int(SR * 0.004))
save('land', buf, 0.8)
