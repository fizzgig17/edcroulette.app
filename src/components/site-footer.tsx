import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SUPPORT_EMAIL } from '@/lib/env';

/** The website's footer, placed at the end of each page's scrolling content. */
export function SiteFooter() {
  const c = Colors[useColorScheme()];
  return (
    <View style={[styles.footer, { borderTopColor: c.border }]}>
      <View style={[styles.inner, styles.footerInner]}>
        <ThemedText type="small" themeColor="textSecondary">
          © {new Date().getFullYear()} EDC Roulette · {SUPPORT_EMAIL}
        </ThemedText>
        <View style={styles.nav}>
          <Link href="/privacy">
            <ThemedText type="small" themeColor="textSecondary">Privacy</ThemedText>
          </Link>
          <Link href="/terms">
            <ThemedText type="small" themeColor="textSecondary">Terms</ThemedText>
          </Link>
          <Link href="/delete-account">
            <ThemedText type="small" themeColor="textSecondary">Delete your data</ThemedText>
          </Link>
          <Link href="/support">
            <ThemedText type="small" themeColor="textSecondary">Support</ThemedText>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, flexWrap: 'wrap' },
  nav: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: Spacing.five },
  footerInner: { paddingVertical: Spacing.four },
});
