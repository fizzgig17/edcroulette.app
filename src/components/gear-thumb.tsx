import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { CutoutImage } from '@/components/cutout-image';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { sampleImage } from '@/content/sample-images';
import { photoUri } from '@/lib/photos';
import { useCutoutBg, useCutoutLook, usePhotoStyle } from '@/lib/preferences';
import type { GearItem } from '@/types/models';

/** The gear's photo, or a disc in its color with the first letter of its name. */
export function GearThumb({ item, size = 44 }: { item: (Pick<GearItem, 'name' | 'imageUri' | 'primaryColor'> & Partial<Pick<GearItem, 'cutout' | 'photoStyle'>> & { isSample?: boolean }) | null; size?: number }) {
  const theme = useTheme();
  const defaultStyle = usePhotoStyle();
  const look = useCutoutLook();
  const cutBg = useCutoutBg();
  const box = { width: size, height: size, borderRadius: size * 0.28 };
  // Sample pieces loaded by an earlier version have no stored drawing: find it by name.
  const drawn = sampleImage(item?.imageUri) ?? (item?.isSample && !item.imageUri ? sampleImage(`sample:${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`) : null);
  if (drawn) return <Image source={drawn} style={box} contentFit="cover" accessibilityIgnoresInvertColors />;
  const uri = photoUri(item?.imageUri);
  // A piece with a clean outline can be shown cut out on a plain background (its own choice, else the default in Settings).
  if (uri && item?.cutout && (item.photoStyle ?? defaultStyle) === 'cutout') return <CutoutImage uri={uri} cutout={item.cutout} size={size} look={look} bg={cutBg} />;
  if (uri) {
    return <Image source={{ uri }} style={[box, { backgroundColor: theme.backgroundElement }]} contentFit="cover" accessibilityIgnoresInvertColors />;
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
