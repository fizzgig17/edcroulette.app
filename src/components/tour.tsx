import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { metalById } from '@/constants/metals';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { useLayoutMode } from '@/lib/layout-mode';
import { setTourSeen, useMetalId, useTourSeen } from '@/lib/preferences';
import { useTour, type TourTargetId } from '@/lib/tour';

type Step = {
  id: string;
  title: string;
  body: string;
  /** Tab to show first (phones; the iPad dashboard shows everything at once). */
  route?: '/' | '/collection' | '/settings';
  target?: TourTargetId;
};

const STEPS: Step[] = [
  { id: 'welcome', title: 'Welcome to EDC Roulette', body: 'Keep a list of the things you carry, then let the wheels pick today’s everyday carry. This takes about a minute.', route: '/' },
  { id: 'wheels', title: 'Your wheels', body: 'Each wheel is a category: knife, flashlight, pen and so on. A spin picks one piece from your collection for every wheel. Tap Lock under a wheel to keep what’s on it.', route: '/', target: 'wheels' },
  { id: 'spin', title: 'Spin', body: 'Tap Spin to turn the wheels. They stop at different times. Tap Stop to land them right away.', route: '/', target: 'spin' },
  { id: 'kit', title: 'Today’s carry', body: 'Your result shows up here, and your last spin is remembered. Tap a piece to see its details.', route: '/', target: 'kit' },
  { id: 'collection', title: 'Your collection', body: 'Everything you own lives here. Tap + to add a piece, with a photo if you like. Search and filter by category, swipe a piece left to delete it (you can undo), or press and hold to select several.', route: '/collection' },
  { id: 'settings', title: 'Make it yours', body: 'In Settings you can add, remove and reorder wheels and change what each one covers. You can also pick the metal for the Spin button and wheel trim, and turn sound on or off.', route: '/settings' },
  { id: 'ai', title: 'Optional AI help', body: 'AI help is off until you say yes. Turn it on in Settings to identify a piece from its photo, get brand suggestions, or have a spin pick a set that goes together.', route: '/settings' },
  { id: 'done', title: 'You’re set', body: 'Replay this tour any time from Settings: Show the tour again.', route: '/' },
];

type Rect = { x: number; y: number; width: number; height: number };
const PAD = 8;
const DIM = '#000000B8';

/** Starts itself once on a first run, and draws the tour whenever it's active. */
export function TourOverlay() {
  const theme = useTheme();
  const metal = metalById(useMetalId());
  const { width, height } = useWindowDimensions();
  const { dashboard } = useLayoutMode();
  const { loading, items, addSamples } = useGear();
  const { active, start, stop, measure } = useTour();
  const seen = useTourSeen();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [usedSamples, setUsedSamples] = useState(false);
  const step = STEPS[index] ?? STEPS[0];

  // First run: wait for the data, then begin.
  useEffect(() => {
    if (loading || seen || active) return undefined;
    const t = setTimeout(() => {
      setIndex(0);
      start();
    }, 900);
    return () => clearTimeout(t);
  }, [loading, seen, active, start]);

  // Each step: show its tab (phones), then find what it points at.
  useEffect(() => {
    if (!active) return undefined;
    setRect(null);
    if (step.route && !dashboard) router.navigate(step.route);
    if (!step.target) return undefined;
    const target = step.target;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await measure(target);
      if (!cancelled) setRect(r);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [active, index, step, dashboard, measure]);

  function finish() {
    setTourSeen(true);
    stop();
    setIndex(0);
    setUsedSamples(false);
    if (!dashboard) router.navigate('/');
  }

  async function begin(withSamples: boolean) {
    if (withSamples) {
      setBusy(true);
      try {
        await addSamples();
        setUsedSamples(true);
      } finally {
        setBusy(false);
      }
    }
    setIndex(1);
  }

  if (!active) return null;

  const first = index === 0;
  const last = index === STEPS.length - 1;
  const cardW = Math.min(380, width - Spacing.three * 2);
  const hole = rect ? { x: rect.x - PAD, y: rect.y - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 } : null;
  // The tip goes under the spotlight if there is room, otherwise above it, otherwise in the middle.
  const room = hole ? { below: height - (hole.y + hole.h), above: hole.y } : null;
  const cardStyle =
    hole && room
      ? room.below >= 230
        ? { top: hole.y + hole.h + Spacing.two }
        : room.above >= 230
          ? { bottom: height - hole.y + Spacing.two }
          : { bottom: Spacing.four }
      : { top: height * 0.22 };
  const body = step.id === 'done' && usedSamples ? 'The sample gear can be removed any time in Settings. Replay this tour from Settings: Show the tour again.' : step.body;

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={finish}>
      <View style={StyleSheet.absoluteFill}>
        {hole ? (
          <>
            <View style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(0, hole.y) }]} />
            <View style={[styles.dim, { top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }]} />
            <View style={[styles.dim, { top: hole.y, left: 0, width: Math.max(0, hole.x), height: hole.h }]} />
            <View style={[styles.dim, { top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }]} />
            <View pointerEvents="none" style={{ position: 'absolute', top: hole.y, left: hole.x, width: hole.w, height: hole.h, borderRadius: Radius.large, borderWidth: 2, borderColor: metal.line }} />
          </>
        ) : (
          <View style={[styles.dim, StyleSheet.absoluteFill]} />
        )}
        <View style={[styles.card, cardStyle, { width: cardW, backgroundColor: theme.background, borderColor: `${metal.line}99` }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {first ? 'Quick tour' : `Step ${index} of ${STEPS.length - 1}`}
          </ThemedText>
          <ThemedText type="heading">{step.title}</ThemedText>
          <ThemedText themeColor="textSecondary">{body}</ThemedText>
          {first ? (
            <>
              {items.length === 0 ? (
                <>
                  <Button label={busy ? 'Loading…' : 'Try it with sample gear'} icon="sparkle" onPress={() => void begin(true)} disabled={busy} />
                  <Button label="Start with an empty collection" variant="secondary" onPress={() => void begin(false)} disabled={busy} />
                </>
              ) : (
                <Button label="Start the tour" onPress={() => setIndex(1)} />
              )}
              <Button label="Skip" variant="secondary" onPress={finish} />
            </>
          ) : (
            <View style={styles.row}>
              {last ? null : <Button label="Skip" variant="secondary" onPress={finish} />}
              <Button label={last ? 'Done' : 'Next'} onPress={() => (last ? finish() : setIndex(index + 1))} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  card: { position: 'absolute', alignSelf: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.large, borderWidth: 1.5 },
  row: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'flex-end' },
});
