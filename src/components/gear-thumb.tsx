import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { GearItem } from '@/types/models';

/** The gear's photo, or a disc in its color with the first letter of its name. */
export function GearThumb({ item, size = 44 }: { item: Pick<GearItem, 'name' | 'imageUri' | 'primaryColor'> | null; size?: number }) {
  const theme = useTheme();
  const box = { width: size, height: size, borderRadius: size * 0.28 };
  if (item?.imageUri) {
    return <Image source={{ uri: item.imageUri }} style={[box, { backgroundColor: theme.backgroundElement }]} contentFit="cover" accessibilityIgnoresInvertColors />;
  }
  const bg = item?.primaryColor ?? theme.backgroundSelected;
  return (
    <View style={[box, styles.center, { backgroundColor: bg, borderColor: theme.border }]}>
      <ThemedText style={{ color: readableOn(bg), fontSize: size * 0.42, lineHeight: size * 0.5, fontWeight: 800 }}>
        {item ? item.name.trim().charAt(0).toUpperCase() : '–'}
      </ThemedText>
    </View>
  );
}

/** Black or white text, whichever reads better on a '#RRGGBB' background. */
export function readableOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#16191E' : '#FFFFFF';
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
