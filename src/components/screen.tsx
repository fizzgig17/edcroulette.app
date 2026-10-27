import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SiteFooter } from '@/components/site-footer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, ReadableWidth, Spacing } from '@/constants/theme';
import { IS_DEV_BUILD } from '@/lib/env';
import { usePane } from '@/lib/pane';
import { usePullRefresh } from '@/components/pull-refresh';
import { RevealContext } from '@/lib/reveal';
import { useScrollLocked } from '@/lib/scroll-lock';

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
  /** Pulling the page down runs this (like pull to refresh). */
  onRefresh?: () => void;
  /** A bar that stays put above the scrolling content (Cancel and the title on the add screen). */
  header?: ReactNode;
};

/** Standard scrollable screen shell. */
export function Screen({ title, subtitle, children, showTitle = true, hideTitle, action, readable, tab, footer, topSignal, scrollEnabled: scrollWanted = true, fullWidth, onRefresh, header }: ScreenProps) {
  const scrollEnabled = scrollWanted && !useScrollLocked();
  const insets = useSafeAreaInsets();
  const pane = usePane();
  const embedded = !!pane;
  // Wider windows (an unfolded Fold, an iPad) get a wider column.
  const wide = useWindowDimensions().width >= 840;
  const scroll = useRef<ScrollView>(null);
  // Where the keyboard is, and how far the page is scrolled, so a box being typed in can be put just above the keyboard.
  const scrollY = useRef(0);
  const keyboard = useRef({ top: 0, height: 0 });
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      keyboard.current = { top: e.endCoordinates.screenY, height: e.endCoordinates.height };
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboard.current = { top: 0, height: 0 };
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const reveal = useCallback((target: View) => {
    // Give the keyboard a moment to come up (or move), then measure.
    setTimeout(() => {
      const k = keyboard.current;
      if (k.height === 0) return;
      target.measureInWindow((_x, y, _w, h) => {
        const delta = y + h + 16 - k.top;
        scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + delta), animated: true });
      });
    }, 320);
  }, []);
  useEffect(() => {
    if (topSignal) scroll.current?.scrollTo({ y: 0, animated: true });
  }, [topSignal]);
  // In a pane, a floating footer (like Undo) is shown over the pane instead of at the end of the content.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const hasRefresh = !!onRefresh;
  const refreshControl = usePullRefresh(embedded || !hasRefresh ? null : () => onRefreshRef.current?.());
  const setPaneRefresh = pane?.setRefresh;
  useEffect(() => {
    if (!setPaneRefresh || !hasRefresh) return undefined;
    setPaneRefresh(() => onRefreshRef.current?.());
    return () => setPaneRefresh(null);
  }, [setPaneRefresh, hasRefresh]);
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
        {header}
        <ScrollView
          ref={scroll}
          scrollEnabled={scrollEnabled}
          refreshControl={refreshControl}
          contentContainerStyle={[styles.content, wide && !readable && { maxWidth: 1040 }, readable && { maxWidth: ReadableWidth }, fullWidth && { maxWidth: undefined, paddingLeft: Math.max(insets.left, 0) + Spacing.three, paddingRight: Math.max(insets.right, 0) + Spacing.three }, tab && { paddingBottom: insets.bottom + 120 }, Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: keyboardHeight + Spacing.four }]}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets>
          <RevealContext.Provider value={reveal}>
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
          </RevealContext.Provider>
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
