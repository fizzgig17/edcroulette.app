/**
 * The tab bar is our own: three metal discs (Spin, Collection, Settings) and,
 * docked at the right end, the round Spin button. Built on expo-router's
 * headless tabs so routing, deep links and history work as usual.
 */
import { router, usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiscLabel, MetalDisc } from '@/components/metal-button';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { lift, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tap } from '@/lib/haptics';
import { SpinDockProvider, useSpinDock } from '@/lib/spin-dock';

const TAB = 44;

const MetalTab = forwardRef<View, TabTriggerSlotProps & { icon: IconName; label: string }>(function MetalTab({ icon, label, isFocused, onPress, ...rest }, ref) {
  const theme = useTheme();
  return (
    <Pressable
      ref={ref}
      {...rest}
      onPress={(e) => {
        tap();
        onPress?.(e);
      }}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
      <MetalDisc size={TAB} lit={!!isFocused} ring={isFocused ? theme.accent : undefined}>
        <DiscLabel icon={icon} size={TAB} />
      </MetalDisc>
      <ThemedText type="caption" style={[styles.tabLabel, { color: isFocused ? theme.accent : theme.textSecondary }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
});

function SpinDock() {
  const { control, scrollToTop } = useSpinDock();
  const pathname = usePathname();
  const onSpinTab = pathname === '/' || pathname === '/index';
  const off = !control || control.disabled || control.busy;
  return (
    <Pressable
      disabled={off}
      onPress={() => {
        tap();
        if (!onSpinTab) router.navigate('/');
        scrollToTop();
        control?.onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={control?.label ?? 'Spin'}
      accessibilityState={{ disabled: off, busy: !!control?.busy }}
      style={({ pressed }) => [off && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.96 }] }]}>
      <MetalDisc size={84} turning={!!control?.busy}>
        <DiscLabel icon={control?.icon === 'sparkle' ? 'sparkle' : undefined} label="Spin" size={84} />
      </MetalDisc>
    </Pressable>
  );
}

function Bar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <View pointerEvents="box-none" style={[styles.barWrap, { bottom: Math.max(insets.bottom, 12) - 4, paddingHorizontal: width > 700 ? width * 0.2 : Spacing.three }]}>
      <View style={styles.row} pointerEvents="box-none">
        <View style={[styles.pill, lift(theme.shadow, 3), { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TabTrigger name="index" asChild>
            <MetalTab icon="spin" label="Spin" />
          </TabTrigger>
          <TabTrigger name="collection" asChild>
            <MetalTab icon="collection" label="Collection" />
          </TabTrigger>
          <TabTrigger name="settings" asChild>
            <MetalTab icon="settings" label="Settings" />
          </TabTrigger>
        </View>
        <SpinDock />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <SpinDockProvider>
      <Tabs>
        <TabSlot />
        <Bar />
        {/* Declares the routes; the visible bar is the one above. */}
        <TabList style={styles.hidden}>
          <TabTrigger name="index" href="/" />
          <TabTrigger name="collection" href="/collection" />
          <TabTrigger name="settings" href="/settings" />
        </TabList>
      </Tabs>
    </SpinDockProvider>
  );
}

const styles = StyleSheet.create({
  barWrap: { position: 'absolute', left: 0, right: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  pill: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 8, paddingHorizontal: Spacing.two, borderRadius: 36, borderWidth: StyleSheet.hairlineWidth },
  tab: { alignItems: 'center', gap: 3, minWidth: 64 },
  tabLabel: { fontSize: 10, lineHeight: 12, letterSpacing: 0.4 },
  hidden: { display: 'none' },
});
