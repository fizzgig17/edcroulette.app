import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

/**
 * Every icon the app uses, by meaning. iOS draws SF Symbols; Android and the
 * website draw Material Symbols, so each icon needs both names.
 */
const icon = (ios: SFSymbol, material: AndroidSymbol) => ({ ios, android: material, web: material });

export const Icons = {
  spin: icon('arrow.triangle.2.circlepath', 'autorenew'),
  collection: icon('square.grid.2x2', 'grid_view'),
  settings: icon('gearshape', 'settings'),
  lock: icon('lock.fill', 'lock'),
  unlock: icon('lock.open', 'lock_open'),
  add: icon('plus', 'add'),
  help: icon('questionmark.circle', 'help'),
  share: icon('square.and.arrow.up', 'share'),
  helpOn: icon('questionmark.circle.fill', 'help'),
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
  filter: icon('line.3.horizontal.decrease', 'filter_list'),
  list: icon('rectangle.grid.1x2', 'view_agenda'),
  viewGrid: icon('square.grid.2x2', 'grid_view'),
  viewCompact: icon('list.bullet', 'view_list'),
  swap: icon('chevron.up.chevron.down', 'unfold_more'),
  search: icon('magnifyingglass', 'search'),
  sound: icon('speaker.wave.2.fill', 'volume_up'),
} as const;

export type IconName = keyof typeof Icons;
