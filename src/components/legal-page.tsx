import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { Platform, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { LEGAL_UPDATED, type Section } from '@/content/legal';

/** A text page shared by the website and the app (privacy, terms, support, deleting data). */
export function LegalPage({ title, intro, sections, dated = true, path, summary }: { title: string; intro?: string; sections: Section[]; dated?: boolean; path?: string; summary?: string }) {
  const web = Platform.OS === 'web';
  return (
    <Screen title={title} showTitle={web} readable>
      {web ? (
        <Head>
          <title>{`${title} — EDC Roulette`}</title>
          {summary ? <meta name="description" content={summary} /> : null}
          <meta property="og:title" content={`${title} — EDC Roulette`} />
          {summary ? <meta property="og:description" content={summary} /> : null}
          {path ? <meta property="og:url" content={`https://edcroulette.app${path}`} /> : null}
          {path ? <link rel="canonical" href={`https://edcroulette.app${path}`} /> : null}
          <meta name="twitter:title" content={`${title} — EDC Roulette`} />
        </Head>
      ) : null}
      <Stack.Screen options={{ headerShown: !web, title, headerBackTitle: 'Back' }} />
      {dated ? (
        <ThemedText type="small" themeColor="textSecondary">
          Last updated {LEGAL_UPDATED}
        </ThemedText>
      ) : null}
      {intro ? <ThemedText>{intro}</ThemedText> : null}
      {sections.map((s) => (
        <View key={s.title} style={styles.section}>
          <ThemedText type="smallBold" accessibilityRole="header" style={{ fontSize: 16 }}>
            {s.title}
          </ThemedText>
          {s.body.map((p) => (
            <ThemedText key={p} type="small" themeColor="textSecondary" style={{ fontSize: 15, lineHeight: 22 }}>
              {p}
            </ThemedText>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ section: { gap: Spacing.two } });
