/**
 * The iPad's layout: Spin, Collection and Settings share one screen instead of three tabs.
 *
 * Upright: the wheels and today's carry across the top half; below, Collection on the left and
 * Settings on the right. Sideways: the wheels and today's carry on the left; on the right,
 * Collection and then Settings. Each pane scrolls on its own, and the Spin button stays docked
 * at the bottom right (see the tab layout).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CollectionScreen from '@/app/(tabs)/collection';
import SettingsScreen from '@/app/(tabs)/settings';
import { SpinContent } from '@/components/spin-content';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { IS_DEV_BUILD } from '@/lib/env';
import { PaneContext } from '@/lib/pane';
import { useSpinDock } from '@/lib/spin-dock';

function Pane({ children, flex = 1, centered, topSignal }: { children: ReactNode; flex?: number; centered?: boolean; topSignal?: number }) {
  const [width, setWidth] = useState(0);
  const [overlay, setOverlay] = useState<ReactNode>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (topSignal) scroll.current?.scrollTo({ y: 0, animated: true });
  }, [topSignal]);
  const value = useMemo(() => ({ width: Math.max(0, width - Spacing.three * 2), setOverlay, setScrollEnabled }), [width]);
  return (
    <View style={[styles.pane, { flex }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <PaneContext.Provider value={value}>
        <ScrollView ref={scroll} scrollEnabled={scrollEnabled} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={[styles.column, centered && styles.centered]}>{children}</View>
        </ScrollView>
        {overlay}
      </PaneContext.Provider>
    </View>
  );
}

/** Sideways, the right-hand side shows Collection or Settings, one at a time. */
function SideTabs() {
  const theme = useTheme();
  const [tab, setTab] = useState<'collection' | 'settings'>('collection');
  return (
    <View style={styles.side}>
      <View style={[styles.tabs, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]} accessibilityRole="tablist">
        {(['collection', 'settings'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            style={[styles.tab, tab === t && { backgroundColor: theme.surface }]}>
            <ThemedText type="smallBold" style={{ color: tab === t ? theme.accent : theme.textSecondary }}>
              {t === 'collection' ? 'Collection' : 'Settings'}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      {/* Both stay mounted, so filters and scroll positions survive switching. */}
      <View style={[styles.side, tab !== 'collection' && styles.hidden]}>
        <Pane>
          <CollectionScreen />
        </Pane>
      </View>
      <View style={[styles.side, tab !== 'settings' && styles.hidden]}>
        <Pane>
          <SettingsScreen />
        </Pane>
      </View>
    </View>
  );
}

export function Dashboard() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { topSignal } = useSpinDock();
  const landscape = width > height;
  const line = { backgroundColor: theme.border };
  return (
    <ThemedView style={[styles.root, { paddingTop: IS_DEV_BUILD ? 0 : insets.top }]}>
      {landscape ? (
        <View style={styles.row}>
          <Pane flex={1.15} centered topSignal={topSignal}>
            <SpinContent />
          </Pane>
          <View style={[styles.vline, line]} />
          <SideTabs />
        </View>
      ) : (
        <View style={styles.col}>
          <Pane centered topSignal={topSignal}>
            <SpinContent />
          </Pane>
          <View style={[styles.hline, line]} />
          <View style={styles.row}>
            <Pane>
              <CollectionScreen />
            </Pane>
            <View style={[styles.vline, line]} />
            <Pane>
              <SettingsScreen />
            </Pane>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  col: { flex: 1 },
  pane: { minWidth: 0 },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  column: { gap: Spacing.three, width: '100%' },
  centered: { maxWidth: 760, alignSelf: 'center' },
  side: { flex: 1 },
  hidden: { display: 'none' },
  tabs: { flexDirection: 'row', margin: Spacing.three, marginBottom: 0, padding: 3, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, gap: 3 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.small },
  vline: { width: StyleSheet.hairlineWidth },
  hline: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
