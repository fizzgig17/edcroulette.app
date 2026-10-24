/**
 * A photo with each item outlined along its edge (tap one to choose it). When
 * one is chosen, the other items (not the background) are blurred. Used by the app's item picker and the website demo.
 */
import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Identified } from '@/lib/api';

type Pt = [number, number];

/** The convex hull of the points (monotone chain): drops the wobble a hand-traced outline has. */
function hull(points: Pt[]): Pt[] {
  const s = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(s), ...half([...s].reverse())];
}

/** A closed shape with softly rounded corners, in pixels. */
function roundedPath(p: Pt[], r: number): string {
  const n = p.length;
  let d = '';
  for (let i = 0; i < n; i += 1) {
    const prev = p[(i - 1 + n) % n]!;
    const cur = p[i]!;
    const next = p[(i + 1) % n]!;
    const toPrev = Math.hypot(prev[0] - cur[0], prev[1] - cur[1]) || 1;
    const toNext = Math.hypot(next[0] - cur[0], next[1] - cur[1]) || 1;
    const a = Math.min(r, toPrev / 2);
    const b = Math.min(r, toNext / 2);
    const s = [cur[0] + ((prev[0] - cur[0]) / toPrev) * a, cur[1] + ((prev[1] - cur[1]) / toPrev) * a];
    const e = [cur[0] + ((next[0] - cur[0]) / toNext) * b, cur[1] + ((next[1] - cur[1]) / toNext) * b];
    d += `${i === 0 ? 'M' : 'L'} ${s[0]!.toFixed(1)} ${s[1]!.toFixed(1)} Q ${cur[0].toFixed(1)} ${cur[1].toFixed(1)} ${e[0]!.toFixed(1)} ${e[1]!.toFixed(1)} `;
  }
  return `${d}Z`;
}

/** The item's outline: a clean, rounded shape hugging it, or (with no outline) a rounded box. */
export function outlineOf(it: Identified, W: number, H: number): string | null {
  const px = (pts: Pt[]) => pts.map(([x, y]) => [x * W, y * H] as Pt);
  if (it.outline && it.outline.length >= 6) {
    const h = hull(px(it.outline as Pt[]));
    if (h.length >= 3) return roundedPath(h, Math.max(6, Math.min(W, H) * 0.03));
  }
  if (!it.box) return null;
  const { x, y, w, h } = it.box;
  return roundedPath(px([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), Math.max(8, Math.min(W, H) * 0.04));
}

export function OutlinedPhoto({
  uri,
  width: W,
  height: H,
  items,
  remaining,
  selected,
  onSelect,
  added = [],
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
  /** Items already added from this photo: blurred while nothing is chosen. */
  added?: number[];
  onLoad?: (size: { width: number; height: number }) => void;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const paths = new Map<number, string>();
  items.forEach((it, i) => {
    const d = outlineOf(it, W, H);
    if (d) paths.set(i, d);
  });
  // The items to blur: every other item once one is chosen, else the ones already added.
  const hide = (selected !== null ? items.map((_, i) => i).filter((i) => i !== selected) : added).filter((i) => paths.has(i));
  const blurred = hide.length > 0;
  const hidePaths = hide.map((i) => paths.get(i)!).join(' ');

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
              {/* Everything except the blurred items: the whole picture with those shapes cut out. */}
              <ClipPath id="sharp">
                <Path d={`M 0 0 H ${W} V ${H} H 0 Z ${hidePaths}`} clipRule="evenodd" />
              </ClipPath>
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
