import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { GearThumb } from '@/components/gear-thumb';
import { RouletteSpinner } from '@/components/roulette-spinner';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import type { GearItem } from '@/types/models';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { useLayoutMode } from '@/lib/layout-mode';
import { useSpinDock } from '@/lib/spin-dock';

function when(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Today at ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

/**
 * Lays the picks out in as few rows as fit: sideways up to three across (four is
 * two and two, five is three and two), upright two across. A short last row
 * stretches to fill the width.
 */
function rowsOf<T>(picks: T[], landscape: boolean): T[][] {
  const n = picks.length;
  const cols = landscape ? (n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3) : Math.min(2, Math.max(1, n));
  const rows: T[][] = [];
  for (let i = 0; i < n; i += cols) rows.push(picks.slice(i, i + cols));
  return rows;
}

export function SpinContent() {
  const theme = useTheme();
  const { items, lastSpin, itemById, loading, addSamples } = useGear();
  const { big, landscape } = useLayoutMode();
  const { setControl } = useSpinDock();
  // Wide windows and sideways phones lay the kit out in more columns.
  const wideKit = big || landscape;
  const [open, setOpen] = useState<GearItem | null>(null);
  const hasCarry = !!lastSpin && lastSpin.picks.some((p) => !!itemById(p.itemId));
  const emptyCard = !loading && items.length === 0 ? (
        <Card>
          <ThemedText type="heading">Start your collection</ThemedText>
          <ThemedText themeColor="textSecondary">
            Add the knives, lights, pens and tools you carry. Each wheel spins through one category and picks today's piece. Lock anything you're definitely carrying.
          </ThemedText>
          <Button label="Add your first piece" icon="add" onPress={() => router.push('/gear/new')} />
          <Button label="Or try it with sample gear" icon="sparkle" variant="secondary" onPress={() => void addSamples()} />
        </Card>
      ) : null;
  return (
    <>
      {wideKit ? emptyCard : null}
      <RouletteSpinner onControl={setControl} />
      {wideKit ? null : emptyCard}

      {lastSpin && hasCarry ? (
        <View style={styles.result}>
          <View style={styles.resultHead}>
            <ThemedText type="heading">Today's carry</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {when(lastSpin.spunAt)}
            </ThemedText>
          </View>
          <View style={styles.grid}>
            {rowsOf(lastSpin.picks, wideKit).map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((p) => {
              const g = itemById(p.itemId);
              return (
                <Pressable
                  key={p.slotIndex}
                  disabled={!g}
                  onPress={() => setOpen(g)}
                  accessibilityRole="button"
                  accessibilityLabel={g ? `${p.category}: ${g.name}. Show details` : p.category}
                  style={({ pressed }) => [styles.block, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && { opacity: 0.75 }]}>
                  <View style={styles.blockTop}>
                    <GearThumb item={g} size={40} />
                    <View style={styles.flex}>
                      <View style={styles.inline}>
                        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.tinyCaps}>
                          {p.category}
                        </ThemedText>
                        {p.locked ? <Icon name="lock" size={10} color={theme.accent} /> : null}
                      </View>
                    </View>
                  </View>
                  <ThemedText type="smallBold" numberOfLines={2} style={styles.blockName}>
                    {g?.name ?? (p.itemId ? 'Removed from collection' : `No ${p.category.toLowerCase()} yet`)}
                  </ThemedText>
                  {g ? (
                    <View style={styles.inline}>
                      {g.primaryColor ? <View style={[styles.dot, { backgroundColor: g.primaryColor, borderColor: theme.border }]} /> : null}
                      <ThemedText themeColor="textSecondary" numberOfLines={1} style={styles.blockDetail}>
                        {[g.material, g.finish].filter(Boolean).join(' · ') || 'Material not set'}
                      </ThemedText>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
              </View>
            ))}
          </View>
        </View>
      ) : !loading && !emptyCard ? (
        <View style={styles.result}>
          <ThemedText type="heading">Today's carry</ThemedText>
          <ThemedText themeColor="textSecondary">
            {lastSpin ? 'Nothing picked: the pieces from your last spin are no longer in your collection. Spin again to choose.' : "Nothing spun yet. Spin to pick today's carry."}
          </ThemedText>
        </View>
      ) : null}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(null)} accessibilityLabel="Close">
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => {}}>
            <Pressable onPress={() => setOpen(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={[styles.close, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Icon name="close" size={18} color={theme.text} />
            </Pressable>
            {open ? (
              <>
                <View style={styles.hero}>
                  <GearThumb item={open} size={132} />
                </View>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.tinyCaps}>
                  {open.category}
                </ThemedText>
                <ThemedText type="subtitle" style={{ fontSize: 24, lineHeight: 30 }}>
                  {open.name}
                </ThemedText>
                <View style={styles.facts}>
                  {[
                    ['Brand', open.brand],
                    ['Model', open.model],
                    ['Material', open.material],
                    ['Finish', open.finish],
                    ['Color', open.primaryColor],
                    ['Weight', open.weightGrams ? `${open.weightGrams} g` : null],
                  ]
                    .filter(([, v]) => !!v)
                    .map(([k, v]) => (
                      <View key={k as string} style={[styles.fact, { backgroundColor: theme.background, borderColor: theme.border }]}>
                        <ThemedText themeColor="textSecondary" style={styles.factLabel}>
                          {k}
                        </ThemedText>
                        <View style={styles.inline}>
                          {k === 'Color' ? <View style={[styles.dot, { backgroundColor: v as string, borderColor: theme.border, marginLeft: 0 }]} /> : null}
                          <ThemedText type="smallBold" style={{ fontSize: 13 }}>
                            {v}
                          </ThemedText>
                        </View>
                      </View>
                    ))}
                </View>
                {open.notes ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {open.notes}
                  </ThemedText>
                ) : null}
                <Button
                  label="Open in collection"
                  onPress={() => {
                    const id = open.id;
                    setOpen(null);
                    router.push({ pathname: '/gear/[id]', params: { id } });
                  }}
                />
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  result: { gap: Spacing.two },
  resultHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  grid: { gap: Spacing.two },
  gridRow: { flexDirection: 'row', gap: Spacing.two },
  block: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.two, gap: 6 },
  blockTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  blockName: { fontSize: 14, lineHeight: 18 },
  blockDetail: { fontSize: 11, lineHeight: 14, flexShrink: 1 },
  tinyCaps: { fontSize: 10, lineHeight: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  scrim: { flex: 1, backgroundColor: '#000000B3', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  sheet: { width: '100%', maxWidth: 440, borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.four, gap: Spacing.two },
  close: { position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  hero: { alignItems: 'center', paddingVertical: Spacing.two },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginVertical: Spacing.one },
  fact: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.small, paddingHorizontal: 10, paddingVertical: 6, gap: 1 },
  factLabel: { fontSize: 10, lineHeight: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
});
