import Head from 'expo-router/head';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { router } from 'expo-router';

import { GearThumb } from '@/components/gear-thumb';
import { PhotoDemo } from '@/components/photo-demo';
import { RouletteSpinner } from '@/components/roulette-spinner';
import { SpinButton } from '@/components/spin-button';
import { SiteFooter } from '@/components/site-footer';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/field';
import { METALS } from '@/constants/metals';
import { IS_DEV_BUILD, SUPPORT_EMAIL } from '@/lib/env';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { GearProvider, useGear } from '@/lib/gear';
import { setMetalId, useMetalId } from '@/lib/preferences';
import { SpinDockProvider, useSpinDock } from '@/lib/spin-dock';
import { TourProvider } from '@/lib/tour';

const FEATURES = [
  { title: 'Your whole rotation', body: 'Add every knife, light, pen, watch and tool with a photo, brand, material, finish and color. Categories fold away, so a big collection stays easy to scan.' },
  { title: 'Spin for today', body: 'One tall wheel per category. They stop one by one at their own speed, each on a random piece from your collection. Tap Stop to land them early, or just pull the Spin page down.' },
  { title: 'Lock the keepers', body: 'Already know you are carrying that knife? Lock it and spin the rest.' },
  { title: 'Wheels your way', body: 'Add, remove and reorder up to six wheels, and choose what each one covers. On tablets and open foldables the wheels stay tall.' },
  { title: 'A photo that finds the item', body: 'Put several things in one photo. Your phone finds and outlines each one on its own, with no AI and no internet. Tap the one you want and the others blur.' },
  { title: 'Cutout photos', body: 'Show each piece cut out and set at an angle on a plain background, so the whole collection looks alike. Choose the angle and background in Settings, and fine-tune any single piece.' },
  { title: 'Quick, tidy entry', body: 'Pick category, brand, material, finish and color from short lists. The phone even guesses the kind of item from the photo, without sending anything anywhere.' },
  { title: 'Pick your metal', body: 'The Spin button and wheel trim are cut from Damascus, Mokume gane, Timascus, Titanium, Zirconium, Copper, Brass or Steel. On iPhone and iPad the home screen icon can match.' },
  { title: 'Optional AI help', body: 'Identify the one item you picked from its photo, or let a spin pick a set that goes together. It is off until you say yes, and nothing is stored.' },
  { title: 'Phone, iPad and foldables', body: 'Wheels, collection and settings share one screen on tablets and open foldables, and fold down to a phone layout.' },
  { title: 'Sound and touch, your way', body: 'Spin sounds and the little haptic taps each have a switch in Settings, so it can be as quiet as you like.' },
  { title: 'A guided tour', body: 'The first time you open it, a short tour has you try a spin and shows where everything is. Replay it any time from Settings.' },
  { title: 'Private by default', body: 'The free version keeps everything on your phone. No account needed, no ads, no tracking.' },
];

function MetalStrip() {
  const theme = useTheme();
  const current = useMetalId();
  return (
    <View style={styles.metals} accessibilityRole="radiogroup" accessibilityLabel="The eight metals">
      {METALS.map((m) => {
        const on = m.id === current;
        return (
          <Pressable key={m.id} onPress={() => setMetalId(m.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={m.label} style={styles.metal}>
            <Image source={m.texture} contentFit="cover" style={[styles.metalSwatch, { borderColor: on ? theme.accent : theme.border, borderWidth: on ? 3 : 1 }]} />
            <ThemedText type="small" themeColor={on ? undefined : 'textSecondary'} style={[styles.center, on && { color: theme.accent, fontWeight: '700' }]} numberOfLines={1}>
              {m.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The real wheels, with the sample gear: spin them right on the page. Nothing is saved. */
function LiveWheels() {
  // The site is pre-built: draw the wheels in the browser only, so sizes come from the real window.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <View style={styles.liveHolder} />;
  return (
    <GestureHandlerRootView style={styles.live}>
      <TourProvider>
        <SpinDockProvider>
          <GearProvider>
            <LiveInner />
          </GearProvider>
        </SpinDockProvider>
      </TourProvider>
    </GestureHandlerRootView>
  );
}

function LiveInner() {
  const theme = useTheme();
  const { setControl } = useSpinDock();
  const { lastSpin, itemById } = useGear();
  return (
    <View style={styles.liveInner}>
      <RouletteSpinner onControl={setControl} />
      <View style={styles.spinRow}>
        <SpinButton size={240} height={64} inline />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        These are the app's real wheels with sample gear. Tap Spin.
      </ThemedText>
      {lastSpin ? (
        <View style={styles.carry}>
          {lastSpin.picks.map((p) => {
            const g = itemById(p.itemId);
            return g ? (
              <View key={p.slotIndex} style={[styles.carryItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <GearThumb item={g} size={36} />
                <View style={styles.flex}>
                  <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                    {p.category}
                  </ThemedText>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {g.name}
                  </ThemedText>
                </View>
              </View>
            ) : null;
          })}
        </View>
      ) : null}
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

        <LiveWheels />

        <View style={styles.metalBlock}>
          <ThemedText type="heading" style={styles.center}>
            Cut from real metal patterns
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={[styles.center, styles.lead]}>
            Tap a metal for the Spin button and the trim around the wheels above.
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
  liveHolder: { minHeight: 420 },
  live: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  liveInner: { gap: Spacing.three },
  carry: { gap: Spacing.two },
  carryItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  spinRow: { alignItems: 'center' },
  metalBlock: { gap: Spacing.three, alignItems: 'center' },
  metals: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'center', maxWidth: 560 },
  metal: { width: 96, alignItems: 'center', gap: 6 },
  metalSwatch: { width: 64, height: 64, borderRadius: 32, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  cell: { flexGrow: 1, flexBasis: 360 },
});
