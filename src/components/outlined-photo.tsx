/**
 * A photo with each item outlined along its edge (tap one to choose it). When
 * something is chosen, or items are already added, everything outside the
 * sharp outlines is blurred. Used by the app's item picker and the website demo.
 */
import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Identified } from '@/lib/api';

/** A smooth closed curve through the points (Catmull-Rom turned into Béziers), in pixels. */
export function smoothPath(points: [number, number][], W: number, H: number): string {
  const p = points.map(([x, y]) => [x * W, y * H] as const);
  const n = p.length;
  let d = `M ${p[0]![0].toFixed(1)} ${p[0]![1].toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = p[(i - 1 + n) % n]!;
    const p1 = p[i]!;
    const p2 = p[(i + 1) % n]!;
    const p3 = p[(i + 2) % n]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

/** The item's outline, or (if it has none) a rounded rectangle round its box. */
export function outlineOf(it: Identified, W: number, H: number): string | null {
  if (it.outline && it.outline.length >= 6) return smoothPath(it.outline, W, H);
  if (!it.box) return null;
  const { x, y, w, h } = it.box;
  const r = 0.03;
  return smoothPath(
    [
      [x, y + r],
      [x + w / 2, y],
      [x + w, y + r],
      [x + w, y + h - r],
      [x + w / 2, y + h],
      [x, y + h - r],
    ],
    W,
    H,
  );
}

export function OutlinedPhoto({
  uri,
  width: W,
  height: H,
  items,
  remaining,
  selected,
  onSelect,
  sharpWhenNothingChosen = false,
  onLoad,
  children,
}: {
  uri: string;
  width: number;
  height: number;
  items: Identified[];
  /** Indexes of the items that can still be chosen. */
  remaining: number[];
  selected: number | null;
  onSelect: (index: number) => void;
  /** Blur everything but the remaining items even before one is chosen (some are already added). */
  sharpWhenNothingChosen?: boolean;
  onLoad?: (size: { width: number; height: number }) => void;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const paths = new Map<number, string>();
  for (const i of remaining) {
    const d = outlineOf(items[i] as Identified, W, H);
    if (d) paths.set(i, d);
  }
  const sharp = selected !== null ? [selected] : sharpWhenNothingChosen ? remaining : [];
  const blurred = sharp.length > 0 && sharp.some((i) => paths.has(i));

  return (
    <View style={{ width: W, height: H, borderRadius: Radius.medium, overflow: 'hidden' }}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        blurRadius={blurred ? 28 : 0}
        onLoad={(e) => onLoad?.({ width: e.source.width, height: e.source.height })}
        accessibilityIgnoresInvertColors
      />
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        {blurred ? (
          <>
            <Defs>
              <ClipPath id="sharp">{sharp.map((i) => (paths.has(i) ? <Path key={i} d={paths.get(i)!} /> : null))}</ClipPath>
            </Defs>
            <SvgImage href={{ uri }} x={0} y={0} width={W} height={H} preserveAspectRatio="none" clipPath="url(#sharp)" />
          </>
        ) : null}
        {remaining.map((i) => {
          const d = paths.get(i);
          if (!d) return null;
          const on = selected === i;
          return <Path key={i} d={d} fill="rgba(255,255,255,0.01)" stroke={on ? theme.accent : '#FFFFFFD9'} strokeWidth={on ? 3.5 : 2.5} strokeLinejoin="round" onPress={() => onSelect(i)} />;
        })}
      </Svg>
      {/* Number badges at the top-left of each item. */}
      {remaining.map((i) => {
        const it = items[i] as Identified;
        const top = it.outline && it.outline.length ? Math.min(...it.outline.map((p) => p[1])) : (it.box?.y ?? 0);
        const left = it.outline && it.outline.length ? Math.min(...it.outline.map((p) => p[0])) : (it.box?.x ?? 0);
        const on = selected === i;
        return (
          <View key={i} pointerEvents="none" style={[styles.badge, { left: Math.max(4, left * W), top: Math.max(4, top * H), backgroundColor: on ? theme.accent : '#000000AA' }]}>
            <ThemedText type="smallBold" style={{ color: on ? theme.onAccent : '#FFFFFF', fontSize: 13 }}>
              {i + 1}
            </ThemedText>
          </View>
        );
      })}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
