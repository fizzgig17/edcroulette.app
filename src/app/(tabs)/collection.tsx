import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { GearThumb } from '@/components/gear-thumb';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { CATEGORIES, type GearItem } from '@/types/models';

export default function CollectionScreen() {
  const theme = useTheme();
  const { items, maxItems, slots } = useGear();
  const full = items.length >= maxItems;
  const lockedIds = new Set(slots.map((s) => s.lockedItemId).filter(Boolean));

  // Known categories first, in their usual order, then anything else.
  const groups = new Map<string, GearItem[]>();
  for (const c of CATEGORIES) groups.set(c, []);
  for (const g of items) groups.set(g.category, [...(groups.get(g.category) ?? []), g]);

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
      <ThemedText type="small" themeColor="textSecondary">
        {items.length} of {maxItems} items in the free version{full ? ' — remove one to add another.' : '.'}
      </ThemedText>

      {items.length === 0 ? (
        <Card>
          <ThemedText>Nothing here yet. Add the gear you carry, with a photo, its material and color.</ThemedText>
          <Button label="Add gear" icon="add" onPress={() => router.push('/gear/new')} />
        </Card>
      ) : null}

      {[...groups.entries()]
        .filter(([, list]) => list.length > 0)
        .map(([category, list]) => (
          <View key={category} style={styles.group}>
            <ThemedText type="caption" themeColor="textSecondary">
              {category} · {list.length}
            </ThemedText>
            <Card padded={false}>
              {list.map((g, i) => (
                <Pressable
                  key={g.id}
                  onPress={() => router.push({ pathname: '/gear/[id]', params: { id: g.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.name}, ${[g.material, g.finish].filter(Boolean).join(', ')}`}
                  style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                  <GearThumb item={g} />
                  <View style={styles.flex}>
                    <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 16 }}>
                      {g.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {[g.material, g.finish, g.weightGrams != null ? `${g.weightGrams} g` : null].filter(Boolean).join(' · ') || 'No details yet'}
                    </ThemedText>
                  </View>
                  {lockedIds.has(g.id) ? <Icon name="lock" size={14} color={theme.accent} /> : null}
                  {g.primaryColor ? <View style={[styles.dot, { backgroundColor: g.primaryColor, borderColor: theme.border }]} /> : null}
                  <Icon name="chevron" size={14} color={theme.textSecondary} />
                </Pressable>
              ))}
            </Card>
          </View>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  group: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  flex: { flex: 1 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
});
