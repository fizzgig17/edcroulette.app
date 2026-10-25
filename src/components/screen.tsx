import { useEffect, useRef, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SiteFooter } from '@/components/site-footer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, ReadableWidth, Spacing } from '@/constants/theme';
import { IS_DEV_BUILD } from '@/lib/env';
import { usePane } from '@/lib/pane';

type ScreenProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Keeps the status-bar spacing but leaves out the big title (the Spin tab). */
  hideTitle?: boolean;
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
  /** Scrolls to the top whenever this number changes. */
  topSignal?: number;
  /** Set false to hold the page still (while something on it is being dragged). */
  scrollEnabled?: boolean;
  /** Uses the whole width of the screen instead of a centered column (the Spin screen sideways). */
  fullWidth?: boolean;
};

/** Standard scrollable screen shell. */
export function Screen({ title, subtitle, children, showTitle = true, hideTitle, action, readable, tab, footer, topSignal, scrollEnabled = true, fullWidth }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const pane = usePane();
  const embedded = !!pane;
  // Wider windows (an unfolded Fold, an iPad) get a wider column.
  const wide = useWindowDimensions().width >= 840;
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (topSignal) scroll.current?.scrollTo({ y: 0, animated: true });
  }, [topSignal]);
  // In a pane, a floating footer (like Undo) is shown over the pane instead of at the end of the content.
  const setOverlay = pane?.setOverlay;
  const setPaneScroll = pane?.setScrollEnabled;
  useEffect(() => {
    if (!setPaneScroll) return undefined;
    setPaneScroll(scrollEnabled);
    return () => setPaneScroll(true);
  }, [setPaneScroll, scrollEnabled]);
  useEffect(() => {
    if (!setOverlay) return undefined;
    setOverlay(footer ?? null);
    return () => setOverlay(null);
  }, [setOverlay, footer]);
  if (embedded) {
    // Inside an iPad pane: the pane scrolls, so this is just the title and the content.
    return (
      <View style={styles.paneContent}>
        {showTitle && !hideTitle && (
          <View style={styles.titleRow}>
            <ThemedText type="subtitle" accessibilityRole="header" style={styles.flex}>
              {title}
            </ThemedText>
            {action}
          </View>
        )}
        {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
        {children}
      </View>
    );
  }
  return (
    <ThemedView style={styles.container}>
      {/* The dev banner already covers the status-bar area. */}
      <SafeAreaView style={styles.flex} edges={showTitle && !IS_DEV_BUILD ? ['top'] : []}>
        <ScrollView
          ref={scroll}
          scrollEnabled={scrollEnabled}
          contentContainerStyle={[styles.content, wide && !readable && { maxWidth: 1040 }, readable && { maxWidth: ReadableWidth }, fullWidth && { maxWidth: undefined, paddingLeft: Math.max(insets.left, 0) + Spacing.three, paddingRight: Math.max(insets.right, 0) + Spacing.three }, tab && { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets>
          {showTitle && !hideTitle && (
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
  paneContent: { gap: Spacing.three, width: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
