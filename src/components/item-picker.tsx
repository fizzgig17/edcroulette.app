/**
 * When a photo has several items, lets the person tap the one they mean. Each
 * item is outlined along its edge; once one is chosen, everything outside that
 * outline blurs. All the items were identified in one request already, so
 * choosing costs nothing extra. Items already added from this photo stay blurred.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OutlinedPhoto } from '@/components/outlined-photo';
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

  const title =
    selected !== null
      ? 'Other items blurred. Use this one?'
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
        <OutlinedPhoto
          uri={uri}
          width={W}
          height={H}
          items={items}
          remaining={remaining}
          selected={selected}
          onSelect={setSelected}
          added={done}
          onLoad={setDims}
        />

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
        {done.length > 0 ? <Button label="Done" variant="secondary" onPress={onCancel} style={styles.doneButton} /> : null}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: 8, borderRadius: Radius.pill, maxWidth: '100%' },
  footer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.two },
  doneButton: { alignSelf: 'stretch' },
});
