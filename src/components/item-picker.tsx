/**
 * When a photo has several items, lets the person tap the one they mean. The
 * others blur so it's clear which is chosen. All the items were identified in
 * one request already, so choosing costs nothing extra.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Identified } from '@/lib/api';

type Dims = { width: number; height: number };

export function ItemPicker({
  uri,
  items,
  onCancel,
  onChoose,
}: {
  uri: string | null;
  items: Identified[] | null;
  onCancel: () => void;
  onChoose: (index: number, dims: Dims) => void;
}) {
  return (
    <Modal visible={!!uri && !!items} animationType="slide" onRequestClose={onCancel}>
      {uri && items ? <Picker uri={uri} items={items} onCancel={onCancel} onChoose={onChoose} /> : null}
    </Modal>
  );
}

const label = (it: Identified) => [it.brand ?? it.brandRead, it.model].filter(Boolean).join(' ') || it.category;

function Picker({ uri, items, onCancel, onChoose }: { uri: string; items: Identified[]; onCancel: () => void; onChoose: (index: number, dims: Dims) => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [dims, setDims] = useState<Dims | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // The photo, as large as fits.
  const maxW = Math.min(screenW - Spacing.three * 2, 560);
  const maxH = screenH * 0.5;
  const ratio = dims ? dims.width / dims.height : 1;
  const W = Math.min(maxW, maxH * ratio);
  const H = W / ratio;

  // A little air around each item's box.
  const rect = (it: Identified) => {
    if (!it.box) return null;
    const pad = 0.03;
    const x = Math.max(0, it.box.x - pad);
    const y = Math.max(0, it.box.y - pad);
    const w = Math.min(1 - x, it.box.w + pad * 2);
    const h = Math.min(1 - y, it.box.h + pad * 2);
    return { left: x * W, top: y * H, width: w * W, height: h * H };
  };
  const chosen = selected !== null ? rect(items[selected] as Identified) : null;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 20) + Spacing.two }]}>
      <View style={styles.top}>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button">
          <ThemedText type="small" style={styles.light}>
            Keep whole photo
          </ThemedText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <ThemedText type="smallBold" style={[styles.light, styles.title]}>
          {selected === null ? `I can see ${items.length} items. Tap the one you want.` : 'Others blurred. Use this one?'}
        </ThemedText>
        <View style={{ width: W, height: H, borderRadius: Radius.medium, overflow: 'hidden' }}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            blurRadius={selected !== null && chosen ? 28 : 0}
            onLoad={(e) => setDims({ width: e.source.width, height: e.source.height })}
            accessibilityIgnoresInvertColors
          />
          {chosen ? (
            <View style={[styles.sharp, chosen]}>
              <Image source={{ uri }} style={{ position: 'absolute', left: -chosen.left, top: -chosen.top, width: W, height: H }} contentFit="fill" accessibilityIgnoresInvertColors />
            </View>
          ) : null}
          {items.map((it, i) => {
            const r = rect(it);
            if (!r) return null;
            const on = selected === i;
            return (
              <Pressable
                key={i}
                onPress={() => setSelected(i)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Item ${i + 1}: ${label(it)}`}
                style={[styles.box, r, { borderColor: on ? theme.accent : '#FFFFFFCC', borderWidth: on ? 3 : 2 }]}>
                <View style={[styles.badge, { backgroundColor: on ? theme.accent : '#000000AA' }]}>
                  <ThemedText type="smallBold" style={{ color: on ? theme.onAccent : '#FFFFFF', fontSize: 13 }}>
                    {i + 1}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* The same choice as chips, for any item whose outline couldn't be placed. */}
        <View style={styles.chips}>
          {items.map((it, i) => (
            <Pressable
              key={i}
              onPress={() => setSelected(i)}
              accessibilityRole="button"
              style={[styles.chip, { backgroundColor: selected === i ? theme.accent : '#FFFFFF22' }]}>
              <ThemedText type="smallBold" numberOfLines={1} style={{ color: selected === i ? theme.onAccent : '#FFFFFF', fontSize: 14 }}>
                {i + 1} · {label(it)}
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
  sharp: { position: 'absolute', overflow: 'hidden', borderRadius: Radius.small },
  box: { position: 'absolute', borderRadius: Radius.small },
  badge: { position: 'absolute', top: 4, left: 4, minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: 8, borderRadius: Radius.pill, maxWidth: '100%' },
  footer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
});
