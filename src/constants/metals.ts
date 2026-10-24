import type { ImageSourcePropType } from 'react-native';

/** The metals to pick from for the Spin button and the wheel trim. Textures are drawn by scripts/make-metals.mjs. */
export const METALS = [
  { id: 'damascus', label: 'Damascus', texture: require('../../assets/images/metals/damascus.jpg'), hi: '#E3E7EC', lo: '#4A515A', line: '#D5DAE0' },
  { id: 'mokume', label: 'Mokume gane', texture: require('../../assets/images/metals/mokume.jpg'), hi: '#E8B880', lo: '#7A4524', line: '#E3AE6C' },
  { id: 'timascus', label: 'Timascus', texture: require('../../assets/images/metals/timascus.jpg'), hi: '#9AA8F0', lo: '#2A2468', line: '#E4B863' },
  { id: 'titanium', label: 'Titanium', texture: require('../../assets/images/metals/titanium.jpg'), hi: '#C9CED6', lo: '#5E6670', line: '#C9CED6' },
  { id: 'zirconium', label: 'Zirconium', texture: require('../../assets/images/metals/zirconium.jpg'), hi: '#7E78B8', lo: '#14161C', line: '#8F8AD0' },
  { id: 'copper', label: 'Copper', texture: require('../../assets/images/metals/copper.jpg'), hi: '#EDAE80', lo: '#8A4522', line: '#E8935E' },
  { id: 'brass', label: 'Brass', texture: require('../../assets/images/metals/brass.jpg'), hi: '#F2D283', lo: '#8F6A1E', line: '#EBC15C' },
  { id: 'steel', label: 'Steel', texture: require('../../assets/images/metals/steel.jpg'), hi: '#E6E9EE', lo: '#6A717B', line: '#D9DDE3' },
] as const satisfies readonly { id: string; label: string; texture: ImageSourcePropType; hi: string; lo: string; line: string }[];

export type MetalId = (typeof METALS)[number]['id'];
export type Metal = (typeof METALS)[number];
export const DEFAULT_METAL: MetalId = 'damascus';
export const metalById = (id: string | null | undefined): Metal => METALS.find((m) => m.id === id) ?? METALS.find((m) => m.id === DEFAULT_METAL)!;
