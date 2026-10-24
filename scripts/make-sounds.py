"""Generates the Spin screen's sound effects (assets/sounds/*.wav) with numpy.

Mechanical detents, nothing casino-like:
  tick1..tick6  a soft click for each row passing the payline (six pitches, so a
                fast spin doesn't sound like one sample on repeat)
  clunk.wav     a wheel settling into place
  land.wav      the last wheel settling: deeper, with a faint metallic ring
Run: python3 scripts/make-sounds.py
"""
import wave
import numpy as np

SR = 44100
rng = np.random.default_rng(11)


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def fade_edges(x, ms=1.5):
    n = int(SR * ms / 1000)
    x[:n] *= np.linspace(0, 1, n)
    x[-n:] *= np.linspace(1, 0, n)
    return x


def tick(pitch):
    n = int(SR * 0.045)
    t = np.arange(n) / SR
    # a tiny burst of noise for the click's edge, then a short damped body
    noise = rng.standard_normal(n) * np.exp(-t * 900)
    noise = noise - lowpass(noise, 1400)          # keep the top, lose the rumble
    body = np.sin(2 * np.pi * 1250 * pitch * t) * np.exp(-t * 230)
    body += 0.45 * np.sin(2 * np.pi * 2310 * pitch * t) * np.exp(-t * 330)
    wood = np.sin(2 * np.pi * 410 * pitch * t) * np.exp(-t * 120) * 0.5
    x = noise * 0.55 + body * 0.7 + wood
    x = lowpass(x, 6500)
    return fade_edges(x)


def clunk(depth=1.0, ring=0.0, length=0.45):
    n = int(SR * length)
    t = np.arange(n) / SR
    f = 150 * depth * (1 + 0.6 * np.exp(-t * 40))     # pitch drops as it lands
    phase = 2 * np.pi * np.cumsum(f) / SR
    thud = np.sin(phase) * np.exp(-t * (22 / depth))
    knock = rng.standard_normal(n) * np.exp(-t * 500)
    knock = lowpass(knock, 2500) - lowpass(knock, 300)
    x = thud * 0.9 + knock * 0.5
    if ring:
        for fr, amp, dec in ((1480, 1.0, 14), (2750, 0.5, 20), (4120, 0.25, 30)):
            x += ring * amp * np.sin(2 * np.pi * fr * t) * np.exp(-t * dec) * 0.3
    return fade_edges(lowpass(x, 7000), 2.0)


def save(name, data, peak):
    data = data / max(1e-9, np.max(np.abs(data))) * peak
    pcm = (np.clip(data, -1, 1) * 32767).astype('<i2')
    with wave.open(f'assets/sounds/{name}.wav', 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


for i, pitch in enumerate((0.84, 0.92, 1.0, 1.08, 1.17, 1.27), start=1):
    save(f'tick{i}', tick(pitch), 0.6)
save('clunk', clunk(1.0), 0.8)
save('land', clunk(0.8, ring=1.0, length=0.7), 0.85)
