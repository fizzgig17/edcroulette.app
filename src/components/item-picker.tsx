/**
 * When a photo has several items, lets the person tap the one they mean. Each
 * item is outlined along its edge; once one is chosen, everything outside that
 * outline blurs. All the items were identified in one request already, so
 * choosing costs nothing extra. Items already added from this photo stay blurred.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Identified } from '@/lib/api';

type Dims = { width: number; height: number };

export function ItemPicker({
  uri,
  items,
  done,
  onCancel,
  onChoose,
}: {
  uri: string | null;
  items: Identified[] | null;
  /** Indexes of the items already added from this photo. */
  done: number[];
  onCancel: () => void;
  onChoose: (index: number, dims: Dims) => void;
}) {
  return (
    <Modal visible={!!uri && !!items} animationType="slide" onRequestClose={onCancel}>
      {uri && items ? <Picker uri={uri} items={items} done={done} onCancel={onCancel} onChoose={onChoose} /> : null}
    </Modal>
  );
}

const label = (it: Identified) => [it.brand ?? it.brandRead, it.model].filter(Boolean).join(' ') || it.category;

/** A smooth closed curve through the points (Catmull-Rom turned into Béziers), in pixels. */
function smoothPath(points: [number, number][], W: number, H: number): string {
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
function outlineOf(it: Identified, W: number, H: number): string | null {
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

function Picker({ uri, items, done, onCancel, onChoose }: { uri: string; items: Identified[]; done: number[]; onCancel: () => void; onChoose: (index: number, dims: Dims) => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [dims, setDims] = useState<Dims | null>(null);
  const remaining = items.map((_, i) => i).filter((i) => !done.includes(i));
  // With one item left there's nothing to choose between.
  const [selected, setSelected] = useState<number | null>(remaining.length === 1 && done.length > 0 ? (remaining[0] ?? null) : null);

  // The photo, as large as fits.
  const maxW = Math.min(screenW - Spacing.three * 2, 560);
  const maxH = screenH * 0.5;
  const ratio = dims ? dims.width / dims.height : 1;
  const W = Math.min(maxW, maxH * ratio);
  const H = W / ratio;

  const paths = new Map<number, string>();
  for (const i of remaining) {
    const d = outlineOf(items[i] as Identified, W, H);
    if (d) paths.set(i, d);
  }
  // What stays sharp: the chosen item; or, once something's been added from this photo, every item left.
  const sharp = selected !== null ? [selected] : done.length > 0 ? remaining : [];
  const blurred = sharp.length > 0 && sharp.some((i) => paths.has(i));

  const title =
    selected !== null
      ? 'Others blurred. Use this one?'
      : done.length > 0
        ? `${remaining.length} more ${remaining.length === 1 ? 'item' : 'items'}. Tap the next one.`
        : `I can see ${items.length} items. Tap the one you want.`;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 20) + Spacing.two }]}>
      <View style={styles.top}>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button">
          <ThemedText type="small" style={styles.light}>
            {done.length > 0 ? 'Done' : 'Keep whole photo'}
          </ThemedText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <ThemedText type="smallBold" style={[styles.light, styles.title]}>
          {title}
        </ThemedText>
        <View style={{ width: W, height: H, borderRadius: Radius.medium, overflow: 'hidden' }}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            blurRadius={blurred ? 28 : 0}
            onLoad={(e) => setDims({ width: e.source.width, height: e.source.height })}
            accessibilityIgnoresInvertColors
          />
          {dims ? (
            <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
              {blurred ? (
                <>
                  <Defs>
                    <ClipPath id="sharp">
                      {sharp.map((i) => (paths.has(i) ? <Path key={i} d={paths.get(i)!} /> : null))}
                    </ClipPath>
                  </Defs>
                  <SvgImage href={{ uri }} x={0} y={0} width={W} height={H} preserveAspectRatio="none" clipPath="url(#sharp)" />
                </>
              ) : null}
              {remaining.map((i) => {
                const d = paths.get(i);
                if (!d) return null;
                const on = selected === i;
                return (
                  <Path
                    key={i}
                    d={d}
                    fill="rgba(255,255,255,0.01)"
                    stroke={on ? theme.accent : '#FFFFFFD9'}
                    strokeWidth={on ? 3.5 : 2.5}
                    strokeLinejoin="round"
                    onPress={() => setSelected(i)}
                  />
                );
              })}
            </Svg>
          ) : null}
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
        </View>

        {/* The same choice as chips, for any item whose outline couldn't be placed. */}
        <View style={styles.chips}>
          {remaining.map((i) => (
            <Pressable
              key={i}
              onPress={() => setSelected(i)}
              accessibilityRole="button"
              style={[styles.chip, { backgroundColor: selected === i ? theme.accent : '#FFFFFF22' }]}>
              <ThemedText type="smallBold" numberOfLines={1} style={{ color: selected === i ? theme.onAccent : '#FFFFFF', fontSize: 14 }}>
                {i + 1} · {label(items[i] as Identified)}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]}>
        <Button label="Use this item" icon="check" big disabled={selected === null || !dims} onPress={() => selected !== null && dims && onChoose(selected, dims)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0D10' },
  top: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  light: { color: '#FFFFFF', fontSize: 16 },
  title: { fontSize: 16, textAlign: 'center' },
  body: { alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  badge: { position: 'absolute', minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: 8, borderRadius: Radius.pill, maxWidth: '100%' },
  footer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
});
