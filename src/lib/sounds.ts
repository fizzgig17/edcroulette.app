/**
 * Spin sounds: soft ticks while the wheels turn, spacing out as they slow, a
 * tock as each one stops and a deeper one for the last. Made by
 * scripts/make-sounds.py. Off with the Settings switch; follows the phone's
 * silent switch, and mixes with music or podcasts instead of stopping them.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { getSoundOn } from '@/lib/preferences';

const FILES = {
  spin: require('../../assets/sounds/spin.wav'),
  slow: require('../../assets/sounds/slow.wav'),
  stop: require('../../assets/sounds/stop.wav'),
  land: require('../../assets/sounds/land.wav'),
} as const;

type Name = keyof typeof FILES;
export const SLOW_MS = 1400; // length of the slowing sound

const players: Partial<Record<Name, AudioPlayer>> = {};
let ready = false;

function player(name: Name): AudioPlayer | null {
  try {
    if (!ready) {
      ready = true;
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    let p = players[name];
    if (!p) {
      p = createAudioPlayer(FILES[name]);
      if (name === 'spin') p.loop = true;
      p.volume = name === 'land' ? 0.9 : 0.7;
      players[name] = p;
    }
    return p;
  } catch {
    return null;
  }
}

function play(name: Name) {
  if (!getSoundOn()) return;
  const p = player(name);
  if (!p) return;
  try {
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Sound is a nicety; never break a spin over it.
  }
}

/** Loads the sounds ahead of the first spin. */
export function warmUpSounds() {
  (Object.keys(FILES) as Name[]).forEach((n) => player(n));
}

export const startSpinSound = () => play('spin');
export const slowSound = () => {
  stopSpinSound();
  play('slow');
};
export const stopSound = () => play('stop');
export const landSound = () => play('land');

export function stopSpinSound() {
  try {
    players.spin?.pause();
  } catch {
    // Already stopped.
  }
}

/** Silences everything (leaving the screen, turning sound off mid-spin). */
export function stopAllSounds() {
  for (const p of Object.values(players)) {
    try {
      p?.pause();
    } catch {
      // Already stopped.
    }
  }
}
