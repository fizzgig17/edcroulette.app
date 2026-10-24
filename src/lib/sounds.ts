/**
 * Spin sounds. A spin's whole soundtrack (a soft detent click for every row
 * that passes a wheel's payline, a clunk as each wheel settles, a deeper one
 * with a faint ring for the last) is mixed into one short audio clip when the
 * spin starts and played with a single call. Playing a sound per click
 * stalled the screen, which showed as jerking while the wheels slowed down.
 * Off with the Settings switch; follows the phone's silent switch, and mixes
 * with music or podcasts.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { getSoundOn } from '@/lib/preferences';

const SR = 22050;

// --- The sounds themselves, synthesized once ---------------------------------
function lowpass(x: Float32Array, cutoff: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR);
  const y = new Float32Array(x.length);
  let acc = 0;
  for (let i = 0; i < x.length; i += 1) {
    acc = (1 - a) * (x[i] as number) + a * acc;
    y[i] = acc;
  }
  return y;
}

function finish(x: Float32Array, cutoff: number, fadeMs = 1.5): Float32Array {
  const y = lowpass(x, cutoff);
  const n = Math.floor((SR * fadeMs) / 1000);
  for (let i = 0; i < n; i += 1) {
    (y[i] as number) *= i / n;
    (y[y.length - 1 - i] as number) *= i / n;
  }
  return y;
}

/** A pitched wooden "tok": clear enough to tell clicks apart, with a tiny edge at the front. */
function makeTick(pitch: number): Float32Array {
  const n = Math.floor(SR * 0.07);
  const edge = new Float32Array(n);
  const body = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    edge[i] = (Math.random() * 2 - 1) * Math.exp(-t * 1400);
    body[i] =
      Math.sin(2 * Math.PI * 880 * pitch * t) * Math.exp(-t * 95) +
      Math.sin(2 * Math.PI * 1760 * pitch * t) * Math.exp(-t * 170) * 0.45 +
      Math.sin(2 * Math.PI * 440 * pitch * t) * Math.exp(-t * 70) * 0.3;
  }
  const low = lowpass(edge, 1800);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i += 1) x[i] = ((edge[i] as number) - (low[i] as number)) * 0.4 + (body[i] as number);
  return finish(x, 5500);
}

/** A soft wooden thock: a mid body that phone speakers can reproduce, a little low weight, no ring. */
function makeClunk(depth: number, tail: number, seconds: number): Float32Array {
  const n = Math.floor(SR * seconds);
  const x = new Float32Array(n);
  const knock = new Float32Array(n);
  for (let i = 0; i < n; i += 1) knock[i] = (Math.random() * 2 - 1) * Math.exp(-(i / SR) * 420);
  const k1 = lowpass(knock, 3200);
  const k2 = lowpass(knock, 400);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    phase += (2 * Math.PI * 240 * depth * (1 + 0.5 * Math.exp(-t * 45))) / SR; // pitch drops as it lands
    const body = Math.sin(phase) * Math.exp(-t * (30 / depth));
    const wood = Math.sin(2 * Math.PI * 560 * depth * t) * Math.exp(-t * 70) * 0.5;
    const low = tail * Math.sin(2 * Math.PI * 130 * t) * Math.exp(-t * 16) * 0.5;
    x[i] = body * 0.8 + wood + low + ((k1[i] as number) - (k2[i] as number)) * 0.45;
  }
  return finish(x, 5200, 2);
}

let kit: { ticks: Float32Array[]; clunk: Float32Array; land: Float32Array } | null = null;
function getKit() {
  if (!kit) {
    kit = {
      ticks: [0.8, 1.0, 1.26].map(makeTick), // one pitch per wheel, so the wheels can be told apart
      clunk: makeClunk(1.15, 0, 0.3),
      land: makeClunk(0.9, 1, 0.5),
    };
  }
  return kit;
}

// --- Mixing and playing ------------------------------------------------------
type Hit = { at: number; sound: Float32Array; gain: number };

function toWav(hits: Hit[]): Uint8Array {
  const end = Math.max(...hits.map((h) => h.at + h.sound.length / SR));
  const mix = new Float32Array(Math.ceil((end + 0.05) * SR));
  for (const h of hits) {
    const start = Math.floor(h.at * SR);
    for (let i = 0; i < h.sound.length && start + i < mix.length; i += 1) (mix[start + i] as number) += (h.sound[i] as number) * h.gain;
  }
  const bytes = new Uint8Array(44 + mix.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + mix.length * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, mix.length * 2, true);
  let peak = 1e-6;
  for (let i = 0; i < mix.length; i += 1) peak = Math.max(peak, Math.abs(mix[i] as number));
  const scale = (0.92 * 32767) / peak;
  for (let i = 0; i < mix.length; i += 1) v.setInt16(44 + i * 2, Math.round((mix[i] as number) * scale), true);
  return bytes;
}

let ready = false;
let player: AudioPlayer | null = null;
let flip = 0;
let playToken = 0;

/**
 * Builds the clip and plays it once it has really loaded (playing a clip that
 * hasn't loaded yet sometimes does nothing). If loading takes a moment the clip
 * starts part-way in, so the clicks still line up with the wheels.
 */
function play(hits: Hit[], startedAt = Date.now()) {
  if (!getSoundOn() || hits.length === 0) return;
  try {
    if (!ready) {
      ready = true;
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    const bytes = toWav(hits);
    let uri: string;
    if (Platform.OS === 'web') {
      uri = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/wav' }));
    } else {
      flip = (flip + 1) % 2; // alternate names so a clip is never mistaken for the last one
      const file = new File(Paths.cache, `spin-sound-${flip}.wav`);
      if (!file.exists) file.create();
      file.write(bytes);
      uri = file.uri;
    }
    const mine = ++playToken;
    const next = createAudioPlayer({ uri });
    next.volume = 0.9;
    const attempt = () => {
      try {
        if (mine !== playToken) {
          next.remove();
          return;
        }
        const waited = Date.now() - startedAt;
        if (!next.isLoaded && waited < 1500) {
          setTimeout(attempt, 12);
          return;
        }
        const old = player;
        player = next;
        try {
          old?.remove();
        } catch {
          // Already gone.
        }
        if (waited > 40) next.seekTo(waited / 1000).catch(() => {}).finally(() => mine === playToken && next.play());
        else next.play();
      } catch {
        // Sound is a nicety; never break a spin over it.
      }
    };
    attempt();
  } catch {
    // Sound is a nicety; never break a spin over it.
  }
}

/**
 * Starts a spin's soundtrack. Each run is one wheel: how many rows it passes,
 * how long it turns (the clip then adds `settleMs` for it to settle).
 */
export function startSpinSound(runs: { rows: number; durationMs: number }[], overshoot: number, settleMs: number) {
  if (!getSoundOn() || runs.length === 0) return;
  const { ticks, clunk, land } = getKit();
  const hits: Hit[] = [];
  const gain = 0.8;
  let lastEnd = -1;
  let lastIndex = 0;
  runs.forEach((run, index) => {
    const d = run.durationMs / 1000;
    let prev = -1;
    for (let k = 1; k <= run.rows; k += 1) {
      // The wheel eases out, so rows pass further and further apart.
      const at = d * (1 - Math.sqrt(1 - (k - 0.5) / (run.rows + overshoot)));
      if (prev >= 0 && at - prev < 0.04) continue; // too close together to hear as separate clicks
      prev = at;
      hits.push({ at, sound: ticks[index % ticks.length] as Float32Array, gain });
    }
    const end = d + settleMs / 1000;
    if (end > lastEnd) {
      lastEnd = end;
      lastIndex = index;
    }
  });
  runs.forEach((run, index) => {
    const end = run.durationMs / 1000 + settleMs / 1000 - 0.05;
    hits.push({ at: Math.max(0, end), sound: index === lastIndex ? land : clunk, gain: index === lastIndex ? 1.15 : 0.9 });
  });
  play(hits);
}

/** One deeper clunk with a faint ring (the Settings preview, and spins where nothing turns). */
export function landSound() {
  play([{ at: 0, sound: getKit().land, gain: 1 }]);
}

/** Builds the sounds ahead of the first spin. */
export function warmUpSounds() {
  try {
    getKit();
  } catch {
    // Sound is a nicety.
  }
}

/** Silences everything (leaving the screen, turning sound off mid-spin, a spin cut short). */
export function stopAllSounds() {
  playToken += 1;
  try {
    player?.pause();
  } catch {
    // Already stopped.
  }
}
