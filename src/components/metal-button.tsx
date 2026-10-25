/**
 * Round buttons cut from the chosen metal (Damascus, mokume, timascus...): a
 * polished rim, the textured face, a domed highlight and a soft shadow.
 * Used for the Spin button and the tab icons.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/constants/icons';
import { metalById } from '@/constants/metals';
import { lift } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMetalId } from '@/lib/preferences';

const GLYPH_SHADOW = { textShadowColor: '#000C', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } } as const;

/** The metal disc itself. `lit` brightens it (the selected tab). */
export function MetalDisc({ size, height = size, lit = true, ring, turning, children }: { size: number; height?: number; lit?: boolean; ring?: string; turning?: boolean; children?: ReactNode }) {
  const theme = useTheme();
  const metal = metalById(useMetalId());
  const round = height === size;
  const rim = Math.max(3, Math.round(height * 0.07));
  const inner = size - rim * 2;
  const innerH = height - rim * 2;
  return (
    <View style={[{ width: size, height, borderRadius: height / 2 }, lift(theme.shadow, lit ? 3 : 2)]}>
      <LinearGradient colors={[metal.hi, metal.lo, metal.hi]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: height / 2 }]} />
      <View style={[styles.face, { width: inner, height: innerH, borderRadius: innerH / 2, top: rim, left: rim, backgroundColor: metal.lo }]}>
        <Image source={metal.texture} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['#FFFFFF4D', '#FFFFFF00', '#00000066']} locations={[0, 0.45, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
        {lit ? null : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: 0.38 }]} />}
        <View style={styles.center}>{children}</View>
      </View>
      {turning && round ? <TurningRing size={size - rim * 2 - 8} offset={rim + 4} /> : null}
      {ring ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: height / 2, borderWidth: 2.5, borderColor: ring }]} /> : null}
    </View>
  );
}

/** A bright arc that circles just inside the edge of the disc while something is happening. */
function TurningRing({ size, offset }: { size: number; offset: number }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const spin = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: offset, left: offset, width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: 'transparent', borderTopColor: '#FFFFFF', borderRightColor: '#FFFFFF66', transform: [{ rotate: spin }] }}
    />
  );
}

/** The glyph and label on a disc. */
export function DiscLabel({ icon, label, size }: { icon?: IconName; label?: string; size: number }) {
  return (
    <>
      {icon ? <Icon name={icon} size={size * (label ? 0.26 : 0.42)} color="#FFFFFF" /> : null}
      {label ? (
        <ThemedText type="smallBold" style={[styles.label, { fontSize: Math.max(10, size * 0.14) }]}>
          {label}
        </ThemedText>
      ) : null}
    </>
  );
}

/** Kept for places that want a plain disc with a glyph. */
export function MetalGlyph({ icon, size, lit }: { icon: IconName; size: number; lit?: boolean }) {
  return (
    <MetalDisc size={size} lit={lit}>
      <DiscLabel icon={icon} size={size} />
    </MetalDisc>
  );
}

const styles = StyleSheet.create({
  face: { position: 'absolute', overflow: 'hidden' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 1 },
  label: { color: '#FFFFFF', letterSpacing: 1.6, textTransform: 'uppercase', ...GLYPH_SHADOW },
});
