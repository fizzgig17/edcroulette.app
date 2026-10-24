import { SymbolView } from 'expo-symbols';

import { Icons, type IconName } from '@/constants/icons';

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return <SymbolView name={Icons[name]} size={size} tintColor={color} />;
}
