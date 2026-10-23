import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

/**
 * Every icon the app uses, by meaning. iOS draws SF Symbols; Android and the
 * website draw Material Symbols, so each icon needs both names.
 */
const icon = (ios: SFSymbol, material: AndroidSymbol) => ({ ios, android: material, web: material });

export const Icons = {
  spin: icon('shuffle', 'shuffle'),
  collection: icon('square.grid.2x2', 'grid_view'),
  settings: icon('gearshape', 'settings'),
  lock: icon('lock.fill', 'lock'),
  unlock: icon('lock.open', 'lock_open'),
  add: icon('plus', 'add'),
  camera: icon('camera', 'photo_camera'),
  photo: icon('photo', 'image'),
  trash: icon('trash', 'delete'),
  chevron: icon('chevron.right', 'chevron_right'),
  check: icon('checkmark', 'check'),
  up: icon('arrow.up', 'arrow_upward'),
  down: icon('arrow.down', 'arrow_downward'),
  close: icon('xmark', 'close'),
  grip: icon('line.3.horizontal', 'drag_handle'),
  sparkle: icon('sparkles', 'auto_awesome'),
  minus: icon('minus', 'remove'),
  sound: icon('speaker.wave.2.fill', 'volume_up'),
} as const;

export type IconName = keyof typeof Icons;
