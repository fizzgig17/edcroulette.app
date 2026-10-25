import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { metalById } from '@/constants/metals';
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
  /** What the bubble points at. */
  target?: TourTargetId;
  /** The tour moves on by itself when the person does this. */
  expect?: 'spin' | 'tab-collection' | 'tab-settings';
};

const STEPS: Step[] = [
  { id: 'welcome', title: 'Welcome to EDC Roulette', body: 'Keep a list of the things you carry, then let the wheels pick today’s everyday carry. This takes about a minute.', route: '/' },
  { id: 'wheels', title: 'Your wheels', body: 'Each square is a wheel for one category: knife, flashlight, pen and so on. Tap the lock above a wheel to keep what’s on it. Press and hold a wheel and they all wiggle: tap one to change what it spins, drag to reorder, tap the x to remove it, or tap + to add another.', route: '/', target: 'wheels' },
  { id: 'spin', title: 'Try a spin', body: 'Tap Spin. The wheels stop at different times, and tapping Stop lands them right away.', route: '/', target: 'spin', expect: 'spin' },
  { id: 'kit', title: 'Today’s carry', body: 'Your result lands here and is remembered. Tap any piece to see its details.', route: '/', target: 'kit' },
  { id: 'tab-collection', title: 'Open your collection', body: 'Tap Collection to see everything you own.', target: 'tab-collection', expect: 'tab-collection' },
  { id: 'collection', title: 'Your collection', body: 'Tap + to add a piece, with a photo if you like. Search and filter by category, swipe a piece left to delete it (you can undo), or press and hold to select several.', route: '/collection' },
  { id: 'tab-settings', title: 'Now Settings', body: 'Tap Settings to make the app yours.', target: 'tab-settings', expect: 'tab-settings' },
  { id: 'settings', title: 'Make it yours', body: 'Pick the metal for the Spin button and wheel trim, and turn sound on or off.', route: '/settings' },
  { id: 'ai', title: 'Optional AI help', body: 'AI help is off until you say yes. Turn it on in Settings to identify a piece from its photo, get brand suggestions, or have a spin pick a set that goes together.', route: '/settings' },
  { id: 'done', title: 'You’re set', body: 'Replay this tour any time from Settings: Show the tour again.', route: '/' },
];

type Rect = { x: number; y: number; width: number; height: number };
const PAD = 8;
const ARROW = 16;
const BUBBLE = 'rgba(46, 48, 54, 0.92)';

/** Starts itself once on a first run, and draws the tour whenever it's active. */
export function TourOverlay() {
  const metal = metalById(useMetalId());
  const { width, height } = useWindowDimensions();
  const { dashboard } = useLayoutMode();
  const { loading, items, addSamples, lastSpin } = useGear();
  const { active, start, stop, measure, event } = useTour();
  const seen = useTourSeen();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [usedSamples, setUsedSamples] = useState(false);
  const step = STEPS[index] ?? STEPS[0];
  const baseline = useRef({ spun: 0, event: 0 });

  // First run: wait for the data, then begin.
  useEffect(() => {
    if (loading || seen || active) return undefined;
    const t = setTimeout(() => {
      setIndex(0);
      start();
    }, 900);
    return () => clearTimeout(t);
  }, [loading, seen, active, start]);

  // Each step: show its tab (phones), then find what it points at. The bubble stays hidden until it knows where to go.
  useEffect(() => {
    if (!active) return undefined;
    setRect(null);
    baseline.current = { spun: lastSpin?.spunAt ?? 0, event: event.n };
    if (step.route && !dashboard) router.navigate(step.route);
    if (!step.target) {
      setReady(true);
      return undefined;
    }
    setReady(false);
    const target = step.target;
    let cancelled = false;
    let tries = 0;
    const attempt = async () => {
      const r = await measure(target);
      if (cancelled) return;
      if (r || tries >= 6) {
        setRect(r);
        setReady(true);
      } else {
        tries += 1;
        timer = setTimeout(attempt, 250);
      }
    };
    let timer = setTimeout(attempt, step.route && !dashboard ? 450 : 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, dashboard, measure]);

  // The person did what the step asked: move on.
  useEffect(() => {
    if (!active || !step.expect) return undefined;
    const did = step.expect === 'spin' ? (lastSpin?.spunAt ?? 0) !== baseline.current.spun : event.n !== baseline.current.event && event.name === step.expect;
    if (!did) return undefined;
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, STEPS.length - 1)), step.expect === 'spin' ? 900 : 350);
    return () => clearTimeout(t);
  }, [active, step, lastSpin?.spunAt, event]);

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
  const bubbleW = Math.min(330, width - Spacing.three * 2);
  const hole = rect ? { x: rect.x - PAD, y: rect.y - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 } : null;
  const below = hole ? height - (hole.y + hole.h) >= hole.y : true;
  const cx = hole ? hole.x + hole.w / 2 : width / 2;
  const left = Math.max(Spacing.three, Math.min(cx - bubbleW / 2, width - Spacing.three - bubbleW));
  const arrowLeft = Math.max(18, Math.min(cx - left - ARROW / 2, bubbleW - 18 - ARROW));
  const place = hole ? (below ? { top: hole.y + hole.h + ARROW * 0.7 } : { bottom: height - hole.y + ARROW * 0.7 }) : { top: height * 0.28 };
  const body = step.id === 'done' && usedSamples ? 'The sample gear can be removed any time in Settings. Replay this tour from Settings: Show the tour again.' : step.body;
  const dim = hole ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.7)';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {hole ? (
        <>
          <View style={[styles.dim, { backgroundColor: dim, top: 0, left: 0, right: 0, height: Math.max(0, hole.y) }]} />
          <View style={[styles.dim, { backgroundColor: dim, top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.dim, { backgroundColor: dim, top: hole.y, left: 0, width: Math.max(0, hole.x), height: hole.h }]} />
          <View style={[styles.dim, { backgroundColor: dim, top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }]} />
          <View pointerEvents="none" style={{ position: 'absolute', top: hole.y, left: hole.x, width: hole.w, height: hole.h, borderRadius: Radius.large, borderWidth: 2, borderColor: metal.line }} />
        </>
      ) : (
        <View style={[styles.dim, StyleSheet.absoluteFill, { backgroundColor: dim }]} />
      )}
      <View style={[styles.bubble, place, { left, width: bubbleW, opacity: ready ? 1 : 0 }]} pointerEvents={ready ? 'auto' : 'none'}>
        {hole ? <View style={[styles.arrow, below ? { top: -ARROW / 2 + 1 } : { bottom: -ARROW / 2 + 1 }, { left: arrowLeft }]} /> : null}
        <ThemedText type="small" style={styles.kicker}>
          {first ? 'Quick tour' : `Step ${index} of ${STEPS.length - 1}`}
        </ThemedText>
        <ThemedText type="heading" style={styles.white}>
          {step.title}
        </ThemedText>
        <ThemedText style={styles.soft}>{body}</ThemedText>
        {first ? (
          <View style={styles.stack}>
            {items.length === 0 ? (
              <>
                <Pill label={busy ? 'Loading…' : 'Try it with sample gear'} primary onPress={() => void begin(true)} disabled={busy} />
                <Pill label="Start with an empty collection" onPress={() => void begin(false)} disabled={busy} />
              </>
            ) : (
              <Pill label="Start the tour" primary onPress={() => setIndex(1)} />
            )}
            <Pressable onPress={finish} accessibilityRole="button" hitSlop={8}>
              <ThemedText type="small" style={styles.skip}>
                Skip the tour
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            <Pressable onPress={finish} accessibilityRole="button" hitSlop={8} style={last ? styles.hidden : undefined}>
              <ThemedText type="small" style={styles.skip}>
                Skip
              </ThemedText>
            </Pressable>
            <View style={styles.spacer} />
            {index > 1 ? <Pill label="Back" onPress={() => setIndex(index - 1)} /> : null}
            <Pill label={last ? 'Done' : step.expect ? 'Skip step' : 'Next'} primary={!step.expect} onPress={() => (last ? finish() : setIndex(index + 1))} />
          </View>
        )}
      </View>
    </View>
  );
}

function Pill({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.pill, primary ? styles.pillPrimary : styles.pillPlain, pressed && { opacity: 0.8 }, disabled && { opacity: 0.5 }]}>
      <ThemedText type="smallBold" style={primary ? styles.pillPrimaryText : styles.white}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute' },
  bubble: { position: 'absolute', gap: Spacing.two, padding: Spacing.three, borderRadius: 20, backgroundColor: BUBBLE, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
  arrow: { position: 'absolute', width: ARROW, height: ARROW, backgroundColor: BUBBLE, transform: [{ rotate: '45deg' }], borderRadius: 3 },
  kicker: { color: 'rgba(255,255,255,0.6)' },
  white: { color: '#FFFFFF' },
  soft: { color: 'rgba(255,255,255,0.86)' },
  skip: { color: 'rgba(255,255,255,0.6)', textDecorationLine: 'underline' },
  stack: { gap: Spacing.two, alignItems: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  spacer: { flex: 1 },
  hidden: { opacity: 0 },
  pill: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center' },
  pillPlain: { backgroundColor: 'rgba(255,255,255,0.14)' },
  pillPrimary: { backgroundColor: '#FFFFFF' },
  pillPrimaryText: { color: '#1B1D22' },
});
