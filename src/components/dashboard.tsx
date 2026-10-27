/**
 * The iPad's layout: Spin, Collection and Settings share one screen instead of three tabs.
 *
 * Upright: the wheels and today's carry across the top half; below, Collection on the left and
 * Settings on the right. Sideways: the wheels and today's carry on the left half; on the right half,
 * Collection and Settings (one at a time). Each pane scrolls on its own, and the Spin button stays docked
 * at the bottom right (see the tab layout).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CollectionScreen from '@/app/(tabs)/collection';
import SettingsScreen from '@/app/(tabs)/settings';
import { SpinContent } from '@/components/spin-content';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { metalById } from '@/constants/metals';
import { IS_DEV_BUILD } from '@/lib/env';
import { useMetalId } from '@/lib/preferences';
import { PaneContext } from '@/lib/pane';
import { usePullRefresh } from '@/components/pull-refresh';
import { requestCollapse } from '@/lib/collapse';
import { usePullSpin, useSpinDock } from '@/lib/spin-dock';
import { useTour, useTourTarget } from '@/lib/tour';

function Pane({ children, flex = 1, basis, centered, topSignal, fit, framed = true, onRefresh }: { children: ReactNode; flex?: number; basis?: number; centered?: boolean; topSignal?: number; fit?: boolean; framed?: boolean; onRefresh?: () => void }) {
  const theme = useTheme();
  const metal = metalById(useMetalId());
  const [width, setWidth] = useState(0);
  const [overlay, setOverlay] = useState<ReactNode>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (topSignal) scroll.current?.scrollTo({ y: 0, animated: true });
  }, [topSignal]);
  // Pulling a pane down: its own action (the Spin pane), or the one the screen inside it asked for.
  const childRefresh = useRef<(() => void) | null>(null);
  const [canRefresh, setCanRefresh] = useState(false);
  const setRefresh = useCallback((fn: (() => void) | null) => {
    childRefresh.current = fn;
    setCanRefresh(!!fn);
  }, []);
  const refreshControl = usePullRefresh(onRefresh || canRefresh ? () => (onRefresh ?? childRefresh.current)?.() : null);
  const value = useMemo(() => ({ width: Math.max(0, width - Spacing.three * 2), setOverlay, setScrollEnabled, setRefresh }), [width, setRefresh]);
  return (
    <View style={[styles.pane, fit ? styles.fit : basis ? { width: basis, flexBasis: basis, flexGrow: 0, flexShrink: 0 } : { flex }, framed && [styles.frame, { borderColor: `${metal.line}80`, backgroundColor: theme.background }]]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <PaneContext.Provider value={value}>
        <ScrollView ref={scroll} style={fit ? styles.fitScroll : undefined} alwaysBounceVertical={false} scrollEnabled={scrollEnabled} refreshControl={refreshControl} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={[styles.column, centered && styles.centered]}>{children}</View>
        </ScrollView>
        {overlay}
      </PaneContext.Provider>
    </View>
  );
}

/** Sideways, the right-hand side shows Collection or Settings, one at a time. */
function SideTabs({ basis }: { basis: number }) {
  const theme = useTheme();
  const metal = metalById(useMetalId());
  const [tab, setTab] = useState<'collection' | 'settings'>('collection');
  const { signal } = useTour();
  const collectionTab = useTourTarget('tab-collection');
  const settingsTab = useTourTarget('tab-settings');
  return (
    <View style={[styles.side, { width: basis, flexBasis: basis, flexGrow: 0, flexShrink: 0 }, styles.frame, { borderColor: `${metal.line}80`, backgroundColor: theme.background }]}>
      <View style={[styles.tabs, { backgroundColor: theme.backgroundElement, borderColor: `${metal.line}66` }]} accessibilityRole="tablist">
        {(['collection', 'settings'] as const).map((t) => {
          const on = tab === t;
          return (
            <Pressable key={t} ref={t === 'collection' ? collectionTab : settingsTab} collapsable={false} onPress={() => { setTab(t); signal(`tab-${t}`); if (t === 'settings') requestCollapse(); }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={({ pressed }) => [styles.tab, pressed && { opacity: 0.8 }]}>
              {on ? (
                <>
                  <LinearGradient colors={[metal.hi, metal.lo, metal.hi]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: Radius.small }]} />
                  <LinearGradient colors={['#FFFFFF40', '#FFFFFF00', '#00000059']} locations={[0, 0.45, 1]} style={[StyleSheet.absoluteFill, { borderRadius: Radius.small }]} />
                </>
              ) : null}
              <ThemedText type="smallBold" style={on ? styles.tabOn : { color: theme.textSecondary }}>
                {t === 'collection' ? 'Collection' : 'Settings'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {/* Both stay mounted, so filters and scroll positions survive switching. */}
      <View style={[styles.side, tab !== 'collection' && styles.hidden]}>
        <Pane framed={false}>
          <CollectionScreen />
        </Pane>
      </View>
      <View style={[styles.side, tab !== 'settings' && styles.hidden]}>
        <Pane framed={false}>
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
  const pullSpin = usePullSpin();
  const landscape = width > height;
  // Sideways, the two halves are exactly equal: the window less the padding and the gap between them.
  const half = Math.floor((width - Spacing.two * 3) / 2);
  return (
    <ThemedView style={[styles.root, { paddingTop: IS_DEV_BUILD ? 0 : insets.top, backgroundColor: theme.backgroundElement }]}>
      {landscape ? (
        <View style={styles.row}>
          <Pane centered topSignal={topSignal} basis={half} onRefresh={pullSpin}>
            <SpinContent />
          </Pane>
          <SideTabs basis={half} />
        </View>
      ) : (
        <View style={styles.col}>
          {/* The top section is as tall as the wheels and today's carry need, so it doesn't scroll after a spin. */}
          <Pane centered fit onRefresh={pullSpin}>
            <SpinContent />
          </Pane>
          <View style={[styles.row, styles.bottom]}>
            <Pane>
              <CollectionScreen />
            </Pane>
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
  root: { flex: 1, padding: Spacing.two },
  row: { flex: 1, flexDirection: 'row', gap: Spacing.two },
  col: { flex: 1, gap: Spacing.two },
  bottom: { minHeight: 260 },
  pane: { minWidth: 0 },
  fit: { flexShrink: 1, minHeight: 0 },
  fitScroll: { flexGrow: 0 },
  frame: { borderWidth: 1.5, borderRadius: Radius.large, overflow: 'hidden' },
  tabOn: { color: '#FFFFFF' },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  column: { gap: Spacing.three, width: '100%' },
  centered: { maxWidth: 900, alignSelf: 'center' },
  side: { flex: 1 },
  hidden: { display: 'none' },
  tabs: { flexDirection: 'row', margin: Spacing.three, marginBottom: 0, padding: 3, borderRadius: Radius.medium, borderWidth: 1, gap: 3 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: Radius.small, overflow: 'hidden' },
});
