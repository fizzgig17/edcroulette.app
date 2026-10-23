import Head from 'expo-router/head';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/field';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SAMPLE = [
  { slot: 'Knife', name: 'Titanium framelock', detail: 'Titanium · Stonewashed', color: '#8A8D91', locked: true },
  { slot: 'Flashlight', name: 'Copper 18350 light', detail: 'Copper · Patina', color: '#B87333', locked: false },
  { slot: 'Pen', name: 'Brass bolt-action', detail: 'Brass · Raw', color: '#B5A642', locked: false },
];

const FEATURES = [
  { title: 'Your whole rotation', body: 'Add every knife, light, pen and tool with a photo, material, finish and color.' },
  { title: 'Spin for today', body: 'One reel per slot. Each lands on a random piece from that category.' },
  { title: 'Lock the keepers', body: 'Already know you are carrying that knife? Lock it and spin the rest.' },
  { title: 'Private by default', body: 'The free version keeps everything on your phone. No account needed.' },
];

export default function Landing() {
  const theme = useTheme();
  return (
    <View style={styles.page}>
      <Head>
        <title>EDC Roulette — spin for today's carry</title>
        <meta name="description" content="A slot-machine randomizer for your everyday-carry gear: lock what you're carrying, spin for the rest." />
        <meta property="og:title" content="EDC Roulette" />
        <meta property="og:description" content="Spin for today's everyday carry." />
        <meta property="og:image" content="/og-image.png" />
      </Head>

      <View style={styles.hero}>
        <Image source={require('@/../assets/images/icon.png')} style={styles.icon} accessibilityLabel="EDC Roulette icon" />
        <ThemedText type="title" style={styles.center}>
          Spin for today's carry
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={[styles.center, styles.lead]}>
          EDC Roulette picks your everyday-carry combo from your own collection. Lock the pieces you're definitely carrying, spin for the rest.
        </ThemedText>
        <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            Coming soon to iPhone and Android
          </ThemedText>
        </View>
      </View>

      <View style={[styles.machine, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityLabel="Example spin">
        {SAMPLE.map((s) => (
          <View key={s.slot} style={styles.reelCol}>
            <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
              {s.slot}
            </ThemedText>
            <View style={[styles.reel, { backgroundColor: theme.reel, borderColor: s.locked ? theme.accent : theme.border }]}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <ThemedText type="smallBold" style={[styles.center, { color: theme.reelText }]}>
                {s.name}
              </ThemedText>
              <ThemedText type="small" style={[styles.center, { color: theme.textSecondary, fontSize: 12 }]}>
                {s.detail}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" style={[styles.center, { color: s.locked ? theme.accent : theme.textSecondary, fontSize: 12 }]}>
              {s.locked ? 'Locked' : 'Spun'}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.cell}>
            <Card>
              <ThemedText type="heading">{f.title}</ThemedText>
              <ThemedText themeColor="textSecondary">{f.body}</ThemedText>
            </Card>
          </View>
        ))}
      </View>

      <Card>
        <ThemedText type="heading">Premium is on the way</ThemedText>
        <ThemedText themeColor="textSecondary">
          Unlimited gear and slots, cloud backup across devices, EDC Friends to see each other's collections, and a web dashboard to manage your collection from a computer.
        </ThemedText>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.three, paddingVertical: Spacing.five, gap: Spacing.five },
  hero: { alignItems: 'center', gap: Spacing.three },
  icon: { width: 112, height: 112, borderRadius: 26 },
  center: { textAlign: 'center' },
  lead: { maxWidth: 560, fontSize: 18, lineHeight: 28 },
  badge: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.pill },
  machine: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, maxWidth: 560, width: '100%', alignSelf: 'center' },
  reelCol: { flex: 1, gap: Spacing.two },
  reel: { height: 170, borderRadius: Radius.medium, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.two },
  swatch: { width: 40, height: 40, borderRadius: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  cell: { flexGrow: 1, flexBasis: 280 },
});
