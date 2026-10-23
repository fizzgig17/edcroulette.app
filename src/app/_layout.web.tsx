// The website's root (edcroulette.app). It shows the landing page and the
// policy pages; the collection itself lives in the phone app (the phone's
// database isn't used on the web).
import { DarkTheme, DefaultTheme, Link, Stack, ThemeProvider } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { DevBanner } from '@/components/dev-banner';
import { ThemedText } from '@/components/themed-text';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SUPPORT_EMAIL } from '@/lib/env';

function SiteHeader() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  return (
    <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.background }]}>
      <View style={styles.inner}>
        <Link href="/" style={styles.brand} accessibilityLabel="EDC Roulette home">
          <Image source={require('@/../assets/images/icon.png')} style={styles.logo} />
          <ThemedText type="heading">EDC Roulette</ThemedText>
        </Link>
        <View style={styles.nav}>
          <Link href="/support">
            <ThemedText type="link">Support</ThemedText>
          </Link>
          <Link href="/privacy">
            <ThemedText type="link">Privacy</ThemedText>
          </Link>
        </View>
      </View>
    </View>
  );
}

function SiteFooter() {
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

export default function SiteLayout() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const nav = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: c.background, card: c.background, primary: c.accent, text: c.text, border: c.border } }}>
      <View style={{ flex: 1, backgroundColor: c.background, minHeight: '100%' as unknown as number }}>
        <DevBanner />
        <SiteHeader />
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />
        </View>
        <SiteFooter />
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, flexWrap: 'wrap' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  logo: { width: 36, height: 36, borderRadius: 9 },
  nav: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
  footerInner: { paddingVertical: Spacing.four },
});
