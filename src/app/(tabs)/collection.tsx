import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { GearThumb } from '@/components/gear-thumb';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Card } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/constants/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { setCollectionView, useCollectionView, type CollectionView } from '@/lib/preferences';
import { CATEGORIES, type GearItem } from '@/types/models';

type Source = 'all' | 'mine' | 'samples';
type Sort = 'category' | 'name' | 'brand' | 'newest' | 'lightest';
const SORTS: Record<Sort, string> = { category: 'Category', name: 'Name', brand: 'Brand', newest: 'Newest', lightest: 'Lightest' };
const VIEWS: Record<CollectionView, { label: string; icon: IconName; next: CollectionView }> = {
  list: { label: 'List', icon: 'list', next: 'grid' },
  grid: { label: 'Pictures', icon: 'collection', next: 'compact' },
  compact: { label: 'Compact', icon: 'filter', next: 'list' },
};

const uniq = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v && v.trim() !== ''))].sort((a, b) => a.localeCompare(b));

export default function CollectionScreen() {
  const theme = useTheme();
  const { items, maxItems, slots, ownCount, sampleCount } = useGear();
  const view = useCollectionView();
  const full = ownCount >= maxItems;
  const lockedIds = new Set(slots.map((s) => s.lockedItemId).filter(Boolean));

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);
  const [finish, setFinish] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [source, setSource] = useState<Source>('all');
  const [lockedOnly, setLockedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('category');
  const [sheet, setSheet] = useState(false);

  const categories = useMemo(() => [...CATEGORIES.filter((c) => items.some((g) => g.category === c)), ...uniq(items.map((g) => g.category)).filter((c) => !(CATEGORIES as readonly string[]).includes(c))], [items]);
  const materials = useMemo(() => uniq(items.map((g) => g.material)), [items]);
  const finishes = useMemo(() => uniq(items.map((g) => g.finish)), [items]);
  const brands = useMemo(() => uniq(items.map((g) => g.brand)), [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((g) => {
      if (category && g.category !== category) return false;
      if (material && g.material !== material) return false;
      if (finish && g.finish !== finish) return false;
      if (brand && g.brand !== brand) return false;
      if (source === 'mine' && g.isSample) return false;
      if (source === 'samples' && !g.isSample) return false;
      if (lockedOnly && !lockedIds.has(g.id)) return false;
      if (q && ![g.name, g.brand, g.model, g.category, g.material, g.finish, g.notes].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
    const by = (f: (g: GearItem) => string | number) => (a: GearItem, b: GearItem) => {
      const x = f(a);
      const y = f(b);
      return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    };
    if (sort === 'name') list.sort(by((g) => g.name));
    else if (sort === 'brand') list.sort(by((g) => `${g.brand ?? '~'} ${g.name}`));
    else if (sort === 'newest') list.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === 'lightest') list.sort(by((g) => g.weightGrams ?? 99999));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, category, material, finish, brand, source, lockedOnly, sort, slots]);

  const activeCount = [material, finish, brand].filter(Boolean).length + (source !== 'all' ? 1 : 0) + (lockedOnly ? 1 : 0) + (sort !== 'category' ? 1 : 0);
  const filtering = activeCount > 0 || !!category || query.trim() !== '';
  function clearAll() {
    setQuery('');
    setCategory(null);
    setMaterial(null);
    setFinish(null);
    setBrand(null);
    setSource('all');
    setLockedOnly(false);
    setSort('category');
  }

  // Grouped under category headings only when sorted by category.
  const groups = useMemo(() => {
    if (sort !== 'category') return [['', shown] as [string, GearItem[]]];
    const m = new Map<string, GearItem[]>();
    for (const g of shown) m.set(g.category, [...(m.get(g.category) ?? []), g]);
    return [...categories.filter((c) => m.has(c)), ...[...m.keys()].filter((c) => !categories.includes(c))].map((c) => [c, m.get(c) ?? []] as [string, GearItem[]]);
  }, [shown, sort, categories]);

  const open = (g: GearItem) => router.push({ pathname: '/gear/[id]', params: { id: g.id } });
  const detail = (g: GearItem) => [g.isSample ? 'Sample' : null, g.brand, g.material, g.finish, g.weightGrams != null ? `${g.weightGrams} g` : null].filter(Boolean).join(' · ') || 'No details yet';
  const next = VIEWS[view];

  return (
    <Screen
      title="Collection"
      tab
      action={
        <Pressable
          onPress={() => router.push('/gear/new')}
          disabled={full}
          accessibilityRole="button"
          accessibilityLabel="Add gear"
          hitSlop={8}
          style={({ pressed }) => [styles.add, { backgroundColor: theme.accent }, (pressed || full) && { opacity: 0.5 }]}>
          <Icon name="add" size={20} color={theme.onAccent} />
        </Pressable>
      }>
      <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
        {ownCount} of {maxItems} items in the free version{full ? ' — remove one to add another.' : '.'}
        {sampleCount > 0 ? ` Plus ${sampleCount} samples (Settings removes them).` : ''}
      </ThemedText>

      {items.length === 0 ? (
        <Card>
          <ThemedText>Nothing here yet. Add the gear you carry, with a photo, its material and color.</ThemedText>
          <Button label="Add gear" icon="add" onPress={() => router.push('/gear/new')} />
        </Card>
      ) : (
        <>
          <View style={styles.tools}>
            <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Icon name="search" size={16} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search name, brand, material"
                placeholderTextColor={theme.textSecondary}
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
                style={[styles.searchInput, { color: theme.text }]}
              />
            </View>
            <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={`Filters${activeCount ? `, ${activeCount} on` : ''}`} style={[styles.tool, { backgroundColor: activeCount ? theme.accent : theme.backgroundElement }]}>
              <Icon name="filter" size={18} color={activeCount ? theme.onAccent : theme.text} />
              {activeCount ? (
                <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                  {activeCount}
                </ThemedText>
              ) : null}
            </Pressable>
            <Pressable onPress={() => setCollectionView(next.next)} accessibilityRole="button" accessibilityLabel={`View: ${next.label}. Tap to change.`} style={[styles.tool, { backgroundColor: theme.backgroundElement }]}>
              <Icon name={next.icon} size={18} color={theme.text} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
            {categories.map((c) => (
              <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(category === c ? null : c)} />
            ))}
          </ScrollView>

          {filtering ? (
            <View style={styles.found}>
              <ThemedText type="small" themeColor="textSecondary">
                {shown.length} of {items.length} shown
              </ThemedText>
              <Pressable onPress={clearAll} accessibilityRole="button" hitSlop={8}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Clear
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {shown.length === 0 ? <ThemedText themeColor="textSecondary">Nothing matches. Try fewer filters.</ThemedText> : null}

          {groups.map(([name, list]) => (
            <View key={name || 'all'} style={styles.group}>
              {name ? (
                <ThemedText type="caption" themeColor="textSecondary">
                  {name} · {list.length}
                </ThemedText>
              ) : null}
              {view === 'grid' ? (
                <View style={styles.grid}>
                  {list.map((g) => (
                    <Pressable key={g.id} onPress={() => open(g)} accessibilityRole="button" accessibilityLabel={g.name} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
                      <GearThumb item={g} size={92} />
                      {lockedIds.has(g.id) ? (
                        <View style={[styles.lockBadge, { backgroundColor: theme.accent }]}>
                          <Icon name="lock" size={11} color={theme.onAccent} />
                        </View>
                      ) : null}
                      <ThemedText type="small" numberOfLines={2} style={styles.tileName}>
                        {g.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Card padded={false}>
                  {list.map((g, i) => (
                    <Pressable
                      key={g.id}
                      onPress={() => open(g)}
                      accessibilityRole="button"
                      accessibilityLabel={`${g.name}, ${[g.material, g.finish].filter(Boolean).join(', ')}`}
                      style={({ pressed }) => [view === 'compact' ? styles.rowCompact : styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                      <GearThumb item={g} size={view === 'compact' ? 30 : 44} />
                      <View style={styles.flex}>
                        <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: view === 'compact' ? 14 : 16 }}>
                          {g.name}
                        </ThemedText>
                        {view === 'compact' ? null : (
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                            {detail(g)}
                          </ThemedText>
                        )}
                      </View>
                      {lockedIds.has(g.id) ? <Icon name="lock" size={14} color={theme.accent} /> : null}
                      {g.primaryColor ? <View style={[styles.dot, { backgroundColor: g.primaryColor, borderColor: theme.border }]} /> : null}
                      <Icon name="chevron" size={14} color={theme.textSecondary} />
                    </Pressable>
                  ))}
                </Card>
              )}
            </View>
          ))}
        </>
      )}

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={styles.scrim} onPress={() => setSheet(false)} accessibilityLabel="Close filters">
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => undefined}>
            <View style={styles.sheetHead}>
              <ThemedText type="heading">Filters</ThemedText>
              <Pressable onPress={clearAll} accessibilityRole="button" hitSlop={8}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Reset
                </ThemedText>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
              <FilterRow label="Show">
                {(['all', 'mine', 'samples'] as const).map((s) => (
                  <Chip key={s} label={{ all: 'Everything', mine: 'Mine', samples: 'Samples' }[s]} selected={source === s} onPress={() => setSource(s)} />
                ))}
                <Chip label="Locked in a wheel" selected={lockedOnly} onPress={() => setLockedOnly(!lockedOnly)} />
              </FilterRow>
              {materials.length > 0 ? (
                <FilterRow label="Material">
                  {materials.map((m) => (
                    <Chip key={m} label={m} selected={material === m} onPress={() => setMaterial(material === m ? null : m)} />
                  ))}
                </FilterRow>
              ) : null}
              {finishes.length > 0 ? (
                <FilterRow label="Finish">
                  {finishes.map((m) => (
                    <Chip key={m} label={m} selected={finish === m} onPress={() => setFinish(finish === m ? null : m)} />
                  ))}
                </FilterRow>
              ) : null}
              {brands.length > 0 ? (
                <FilterRow label="Brand">
                  {brands.map((m) => (
                    <Chip key={m} label={m} selected={brand === m} onPress={() => setBrand(brand === m ? null : m)} />
                  ))}
                </FilterRow>
              ) : null}
              <FilterRow label="Sort by">
                {(Object.keys(SORTS) as Sort[]).map((k) => (
                  <Chip key={k} label={SORTS[k]} selected={sort === k} onPress={() => setSort(k)} />
                ))}
              </FilterRow>
            </ScrollView>
            <Button label={`Show ${shown.length} piece${shown.length === 1 ? '' : 's'}`} onPress={() => setSheet(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterRow}>
      <ThemedText type="caption" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 12, lineHeight: 16 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, minHeight: 44, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8 },
  tool: { minWidth: 44, height: 44, borderRadius: 22, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  chips: { flexDirection: 'row', gap: Spacing.two, paddingRight: Spacing.three },
  found: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  group: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  rowCompact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 8, paddingHorizontal: Spacing.three },
  flex: { flex: 1 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  tile: { width: '30%', alignItems: 'center', gap: 4 },
  tileName: { textAlign: 'center', fontSize: 12, lineHeight: 15 },
  lockBadge: { position: 'absolute', top: 2, right: '8%', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' },
  sheet: { maxHeight: '82%', borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.three },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetBody: { gap: Spacing.three, paddingBottom: Spacing.two },
  filterRow: { gap: Spacing.two },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
