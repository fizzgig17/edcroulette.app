/**
 * Spin sounds. Each row passing a wheel's payline plays a soft detent click
 * (six slightly different pitches, so fast turning doesn't repeat one sample),
 * each wheel settles with a clunk, and the last one lands a little deeper with
 * a faint ring. Made by scripts/make-sounds.py. Off with the Settings switch;
 * follows the phone's silent switch, and mixes with music or podcasts.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { getSoundOn } from '@/lib/preferences';

const TICKS = [
  require('../../assets/sounds/tick1.wav'),
  require('../../assets/sounds/tick2.wav'),
  require('../../assets/sounds/tick3.wav'),
  require('../../assets/sounds/tick4.wav'),
  require('../../assets/sounds/tick5.wav'),
  require('../../assets/sounds/tick6.wav'),
];
const CLUNK = require('../../assets/sounds/clunk.wav');
const LAND = require('../../assets/sounds/land.wav');

let ready = false;
let tickPlayers: AudioPlayer[] = [];
let clunk: AudioPlayer | null = null;
let land: AudioPlayer | null = null;
let nextTick = 0;
let lastTickAt = 0;

function setup() {
  if (ready) return;
  ready = true;
  try {
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    tickPlayers = TICKS.map((f) => {
      const p = createAudioPlayer(f);
      p.volume = 0.6;
      return p;
    });
    clunk = createAudioPlayer(CLUNK);
    clunk.volume = 0.85;
    land = createAudioPlayer(LAND);
    land.volume = 0.9;
  } catch {
    // Sound is a nicety; never break a spin over it.
  }
}

function fire(p: AudioPlayer | null | undefined, volume?: number) {
  if (!p) return;
  try {
    if (volume !== undefined) p.volume = volume;
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Already gone.
  }
}

/** One detent click. Quick runs of clicks (three wheels at speed) are thinned and softened. */
export function tickSound() {
  if (!getSoundOn()) return;
  setup();
  const now = Date.now();
  const gap = now - lastTickAt;
  if (gap < 28) return;
  lastTickAt = now;
  const volume = gap < 55 ? 0.3 : gap < 100 ? 0.45 : 0.65;
  // Hop around the pitches rather than walking up them.
  nextTick = (nextTick + 1 + Math.floor(Math.random() * 4)) % tickPlayers.length;
  fire(tickPlayers[nextTick], volume);
}

/** A wheel settling into place. */
export function stopSound() {
  if (!getSoundOn()) return;
  setup();
  fire(clunk);
}

/** The last wheel settling. */
export function landSound() {
  if (!getSoundOn()) return;
  setup();
  fire(land);
}

/** Loads the sounds ahead of the first spin. */
export function warmUpSounds() {
  setup();
}

/** Silences everything (leaving the screen, turning sound off mid-spin). */
export function stopAllSounds() {
  for (const p of [...tickPlayers, clunk, land]) {
    try {
      p?.pause();
    } catch {
      // Already stopped.
    }
  }
}
