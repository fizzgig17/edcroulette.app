import Head from 'expo-router/head';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { router } from 'expo-router';

import { PhotoDemo } from '@/components/photo-demo';
import { SiteFooter } from '@/components/site-footer';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/field';
import { METALS, metalById } from '@/constants/metals';
import { IS_DEV_BUILD, SUPPORT_EMAIL } from '@/lib/env';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SAMPLE = [
  { slot: 'Knife', name: 'Titanium framelock', detail: 'Titanium · Stonewashed', color: '#8A8D91', locked: true },
  { slot: 'Flashlight', name: 'Copper 18350 light', detail: 'Copper · Patina', color: '#B87333', locked: false },
  { slot: 'Pen', name: 'Brass bolt-action', detail: 'Brass · Raw', color: '#B5A642', locked: false },
];

const FEATURES = [
  { title: 'Your whole rotation', body: 'Add every knife, light, pen, watch and tool with a photo, brand, material, finish and color.' },
  { title: 'Spin for today', body: 'One wheel per category. They stop one by one at their own speed, each on a random piece from your collection. Tap Stop to land them early.' },
  { title: 'Lock the keepers', body: 'Already know you are carrying that knife? Lock it and spin the rest.' },
  { title: 'Wheels your way', body: 'Add, remove and reorder up to six wheels, and choose what each one covers.' },
  { title: 'Pick your metal', body: 'The Spin button and wheel trim are cut from Damascus, Mokume gane, Timascus, Titanium, Zirconium, Copper, Brass or Steel. On iPhone and iPad the home screen icon can match.' },
  { title: 'Optional AI help', body: 'Identify a piece from its photo, or let a spin pick a set that goes together. It is off until you say yes, and nothing is stored.' },
  { title: 'Phone, iPad and foldables', body: 'Wheels, collection and settings share one screen on tablets and open foldables, and fold down to a phone layout.' },
  { title: 'A guided tour', body: 'The first time you open it, a short tour has you try a spin and shows where everything is. Replay it any time from Settings.' },
  { title: 'Private by default', body: 'The free version keeps everything on your phone. No account needed, no ads, no tracking.' },
];

function MetalStrip() {
  const theme = useTheme();
  return (
    <View style={styles.metals} accessibilityLabel="The eight metals">
      {METALS.map((m) => (
        <View key={m.id} style={styles.metal}>
          <Image source={m.texture} contentFit="cover" style={[styles.metalSwatch, { borderColor: theme.border }]} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.center} numberOfLines={1}>
            {m.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** Dev site only: the newest Android test build, put there by the Android build. */
function AndroidDownload() {
  const [built, setBuilt] = useState<string | null>(null);
  useEffect(() => {
    fetch('/downloads/latest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { version?: string; built?: string } | null) => {
        if (j?.version) setBuilt(`Version ${j.version}${j.built ? `, built ${new Date(j.built).toLocaleString()}` : ''}`);
      })
      .catch(() => {});
  }, []);
  return (
    <Card>
      <ThemedText type="heading">Android test build</ThemedText>
      <ThemedText themeColor="textSecondary">
        The newest Android build of the dev app (test data, not the real app). Open this page on your Android phone and install it; Android will ask to allow installs from your browser the first time.
      </ThemedText>
      {built ? <ThemedText type="small" themeColor="textSecondary">{built}</ThemedText> : null}
      <Button label="Download the APK" onPress={() => void Linking.openURL('/downloads/edc-roulette-dev.apk')} />
    </Card>
  );
}

export default function Landing() {
  const theme = useTheme();
  const metal = metalById('timascus');
  return (
    <ScrollView>
      <View style={styles.page}>
        <Head>
          <title>EDC Roulette — spin for today's carry</title>
          <meta name="description" content="A slot-machine randomizer for your everyday-carry gear: lock what you're carrying, spin for the rest." />
          <meta property="og:title" content="EDC Roulette" />
          <meta property="og:description" content="Spin for today's everyday carry." />
          <meta property="og:image" content="/og-image.png" />
        </Head>

        <View style={styles.hero}>
          <Image source={require('@/../assets/images/icons/mixed.png')} style={styles.icon} accessibilityLabel="EDC Roulette icon" />
          <ThemedText type="title" style={styles.center}>
            Spin for today's carry
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={[styles.center, styles.lead]}>
            EDC Roulette picks your everyday-carry combo from your own collection. Lock the pieces you're definitely carrying, spin for the rest.
          </ThemedText>
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              In testing on iPhone, iPad and Android
            </ThemedText>
          </View>
        </View>

        <Card>
          <ThemedText type="heading">Want to try it?</ThemedText>
          <ThemedText themeColor="textSecondary">
            EDC Roulette is in testing and isn’t in the stores yet. Email {SUPPORT_EMAIL} with your name and the email address on your Apple ID (iPhone and iPad) or your Google account (Android), and you’ll be sent an invite.
          </ThemedText>
          <View style={styles.actions}>
            <Button label="Email to join the testers" onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('EDC Roulette testing')}`)} />
            <Button label="Read the manual" variant="secondary" onPress={() => router.push('/manual')} />
          </View>
        </Card>

        <View style={[styles.machine, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityLabel="Example spin">
          {SAMPLE.map((s) => (
            <View key={s.slot} style={styles.reelCol}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
                {s.slot}
              </ThemedText>
              <View style={[styles.reel, { backgroundColor: theme.reel, borderColor: metal.line }]}>
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

        <View style={styles.spinRow}>
          <View style={styles.pill} accessibilityLabel="The Spin button">
            <Image source={metal.texture} contentFit="cover" style={StyleSheet.absoluteFill} />
            <ThemedText type="smallBold" style={styles.pillText}>
              SPIN
            </ThemedText>
          </View>
        </View>

        <View style={styles.metalBlock}>
          <ThemedText type="heading" style={styles.center}>
            Cut from real metal patterns
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={[styles.center, styles.lead]}>
            Choose the metal for the Spin button and the trim around the wheels.
          </ThemedText>
          <MetalStrip />
        </View>

        <PhotoDemo />

        {IS_DEV_BUILD ? <AndroidDownload /> : null}

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
      <SiteFooter />
    </ScrollView>
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  spinRow: { alignItems: 'center', marginTop: -Spacing.three },
  pill: { width: 240, height: 64, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' },
  pillText: { color: '#FFFFFF', fontSize: 20, letterSpacing: 5, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  metalBlock: { gap: Spacing.three, alignItems: 'center' },
  metals: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'center', maxWidth: 560 },
  metal: { width: 84, alignItems: 'center', gap: 6 },
  metalSwatch: { width: 64, height: 64, borderRadius: 32, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  cell: { flexGrow: 1, flexBasis: 360 },
});
