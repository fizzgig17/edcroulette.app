import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { GearThumb } from '@/components/gear-thumb';
import { RouletteSpinner } from '@/components/roulette-spinner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { useSpinDock } from '@/lib/spin-dock';

function when(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Today at ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

export default function SpinScreen() {
  const theme = useTheme();
  const { items, lastSpin, itemById, loading } = useGear();
  const { width, height } = useWindowDimensions();
  // Portrait is just the wheels: adding gear happens in the Collection tab.
  const landscape = width > height;
  const { setControl } = useSpinDock();

  return (
    <Screen title="EDC Roulette" tab hideTitle>
      {landscape && !loading && items.length === 0 ? (
        <Card>
          <ThemedText type="heading">Start your collection</ThemedText>
          <ThemedText themeColor="textSecondary">
            Add the knives, lights, pens and tools you carry. Each wheel spins through one category and picks today's piece. Lock anything you're definitely carrying.
          </ThemedText>
          <Button label="Add your first piece" icon="add" onPress={() => router.push('/gear/new')} />
        </Card>
      ) : null}

      <RouletteSpinner onControl={setControl} />

      {lastSpin ? (
        <View style={styles.result}>
          <View style={styles.resultHead}>
            <ThemedText type="heading">Today's carry</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {when(lastSpin.spunAt)}
            </ThemedText>
          </View>
          {lastSpin.picks.map((p) => {
            const g = itemById(p.itemId);
            return (
              <Card key={p.slotIndex}>
                <View style={styles.pick}>
                  <GearThumb item={g} size={52} />
                  <View style={styles.flex}>
                    <View style={styles.inline}>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {p.category}
                      </ThemedText>
                      {p.locked ? <Icon name="lock" size={11} color={theme.accent} /> : null}
                    </View>
                    <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 16 }}>
                      {g?.name ?? (p.itemId ? 'Removed from collection' : `No ${p.category.toLowerCase()} yet`)}
                    </ThemedText>
                    {g ? (
                      <View style={styles.inline}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {[g.material, g.finish].filter(Boolean).join(' · ') || 'Material not set'}
                        </ThemedText>
                        {g.primaryColor ? (
                          <>
                            <View style={[styles.dot, { backgroundColor: g.primaryColor, borderColor: theme.border }]} />
                            <ThemedText type="code" themeColor="textSecondary">
                              {g.primaryColor}
                            </ThemedText>
                          </>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  result: { gap: Spacing.two },
  resultHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, marginLeft: Spacing.one },
});
