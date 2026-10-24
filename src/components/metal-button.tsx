/**
 * The round Spin button: a domed disc of the chosen metal (Damascus, mokume,
 * timascus...), with a polished rim, a soft highlight and a drop shadow.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/constants/icons';
import { metalById } from '@/constants/metals';
import { lift } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tap } from '@/lib/haptics';
import { useMetalId } from '@/lib/preferences';

export function MetalButton({
  label,
  caption,
  icon,
  busy,
  disabled,
  onPress,
  size = 104,
}: {
  label: string;
  caption?: string;
  icon: IconName;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
  size?: number;
}) {
  const theme = useTheme();
  const metal = metalById(useMetalId());
  const inner = size - 14;
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          tap();
          onPress();
        }}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled, busy: !!busy }}
        style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2 }, lift(theme.shadow, 3), disabled && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.96 }] }]}>
        {/* Polished rim */}
        <LinearGradient colors={[metal.hi, metal.lo, metal.hi]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
        {/* The metal face */}
        <View style={[styles.face, { width: inner, height: inner, borderRadius: inner / 2, top: 7, left: 7, backgroundColor: metal.lo }]}>
          <Image source={metal.texture} style={StyleSheet.absoluteFill} contentFit="cover" />
          {/* Dome: light from the top left, shade to the bottom right */}
          <LinearGradient colors={['#FFFFFF59', '#FFFFFF00', '#00000066']} locations={[0, 0.45, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.center}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Icon name={icon} size={size * 0.26} color="#FFFFFF" />}
            <ThemedText type="smallBold" style={styles.label}>
              {label}
            </ThemedText>
          </View>
        </View>
      </Pressable>
      {caption ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          {caption}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  face: { position: 'absolute', overflow: 'hidden' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { color: '#FFFFFF', fontSize: 15, textShadowColor: '#000C', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  caption: { textAlign: 'center' },
});
