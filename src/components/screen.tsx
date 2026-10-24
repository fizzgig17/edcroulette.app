import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SiteFooter } from '@/components/site-footer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, ReadableWidth, Spacing } from '@/constants/theme';
import { IS_DEV_BUILD } from '@/lib/env';

type ScreenProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Set false for screens that show a native header instead. */
  showTitle?: boolean;
  /** Shown at the right end of the title row. */
  action?: ReactNode;
  /** Text pages: a narrower column so lines stay short. */
  readable?: boolean;
  /** Tab screens leave room for the tab bar. */
  tab?: boolean;
  /** Floats above the bottom of the screen. */
  footer?: ReactNode;
};

/** Standard scrollable screen shell. */
export function Screen({ title, subtitle, children, showTitle = true, action, readable, tab, footer }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <ThemedView style={styles.container}>
      {/* The dev banner already covers the status-bar area. */}
      <SafeAreaView style={styles.flex} edges={showTitle && !IS_DEV_BUILD ? ['top'] : []}>
        <ScrollView
          contentContainerStyle={[styles.content, readable && { maxWidth: ReadableWidth }, tab && { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets>
          {showTitle && (
            <View style={styles.titleRow}>
              <ThemedText type="subtitle" accessibilityRole="header" style={styles.flex}>
                {title}
              </ThemedText>
              {action}
            </View>
          )}
          {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
          {children}
          {Platform.OS === 'web' ? <SiteFooter /> : null}
        </ScrollView>
        {footer}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
