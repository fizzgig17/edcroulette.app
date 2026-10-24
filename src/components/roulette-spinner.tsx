/**
 * The wheels: one vertical wheel per slot, up to six. Locked wheels never turn
 * and always land on their locked piece. Unlocked wheels land on a random piece
 * of their category, or on a set that goes well together when the spin style is
 * "Coordinated" (an AI picks; see lib/api.ts). They stop left to right with soft
 * tick sounds, and the result is recorded as today's carry.
 *
 * Portrait shows the first three wheels; sideways shows them all. Wheels that
 * aren't on screen still pick a piece (it appears in Today's carry), they just
 * don't turn. The order strip lets the person drag wheels into a new order.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { GearThumb } from '@/components/gear-thumb';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { metalById } from '@/constants/metals';
import { lift, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ensureAiConsent } from '@/lib/ai-consent';
import { pickCoordinated } from '@/lib/api';
import { useGear } from '@/lib/gear';
import { select, success } from '@/lib/haptics';
import { PORTRAIT_WHEELS } from '@/lib/limits';
import { useMetalId, useSpinStyle } from '@/lib/preferences';
import { landSound, startSpinSound, stopAllSounds, warmUpSounds } from '@/lib/sounds';
import type { GearItem, SlotConfig, SpinPick } from '@/types/models';

const VISIBLE_ROWS = 3; // one above the payline, the payline, one below
const BASE_MS = 2200;
const STAGGER_MS = 500;

type Phase = 'idle' | 'choosing' | 'spinning' | 'done';

const pickRandom = <T,>(list: readonly T[]): T | null => (list.length ? list[Math.floor(Math.random() * list.length)] ?? null : null);

function shuffle<T>(list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

// ---------------------------------------------------------------------------
// One wheel
//
// A wheel is a ring of rows on a drum. One number, `pos` (in rows), says which
// row is at the payline; every row works out where it sits from that number on
// the UI thread, wrapping round the ring. Nothing is ever swapped, remounted or
// reset while the wheel turns, which is what used to leave wheels blank or
// make them catch at the end. A tick plays each time a row passes the payline.
// ---------------------------------------------------------------------------
const MAX_RING = 36; // rows kept on a drum; bigger collections show a sample
export const OVERSHOOT = 0.16; // rows past the stop before it settles back, like a detent
export const SETTLE_MS = 240;
const TICK_ROWS = 10; // rows the first wheel travels; later wheels travel further

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The pieces on the drum: the whole category, or a sample that always keeps `must`. */
function makeRing(list: readonly GearItem[], must: (GearItem | null)[]): GearItem[] {
  if (list.length <= MAX_RING) return [...list];
  const keep = new Set(must.filter((g): g is GearItem => !!g).map((g) => g.id));
  const rest = shuffle(list.filter((g) => !keep.has(g.id))).slice(0, MAX_RING - keep.size);
  const ids = new Set([...keep, ...rest.map((g) => g.id)]);
  return list.filter((g) => ids.has(g.id));
}

/** A drum needs at least four rows to look continuous; tiny categories repeat. */
function expand(ring: GearItem[]): GearItem[] {
  if (ring.length < 2 || ring.length >= 4) return ring;
  const out: GearItem[] = [];
  while (out.length < 4) out.push(...ring);
  return out;
}

const ringSignature = (ring: readonly GearItem[]) => ring.map((g) => `${g.id}:${g.name}:${g.imageUri ?? ''}`).join('|');

function ReelRow({
  item,
  index,
  count,
  pos,
  rowHeight,
  thumb,
  wide,
}: {
  item: GearItem;
  index: number;
  count: number;
  pos: SharedValue<number>;
  rowHeight: number;
  thumb: number;
  wide: boolean;
}) {
  const theme = useTheme();
  const style = useAnimatedStyle(() => {
    const half = count / 2;
    // Rows from the payline: 0 at the centre, negative above, positive below.
    const rel = ((((index - pos.value + half) % count) + count) % count) - half;
    const a = Math.abs(rel);
    return {
      opacity: interpolate(a, [0, 1, 1.7], [1, 0.5, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: rel * rowHeight },
        // Rows curve away by shrinking a little; true 3D tilt made the gold pointers flicker.
        { scaleY: interpolate(a, [0, 1.5], [1, 0.8], Extrapolation.CLAMP) },
        { scale: interpolate(a, [0, 1], [1, 0.9], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.row, { height: rowHeight, top: rowHeight }, wide && styles.rowWide, style]}>
      <GearThumb item={item} size={thumb} />
      <ThemedText
        numberOfLines={2}
        style={[wide ? styles.nameWide : styles.center, { color: theme.reelText, fontSize: 13, lineHeight: 16, fontWeight: '600' }]}>
        {item.name}
      </ThemedText>
    </Animated.View>
  );
}

function Reel({
  slot,
  candidates,
  locked,
  shown,
  target,
  spinToken,
  snapToken,
  order,
  durationMs,
  rowHeight,
  wide,
  busy,
  onSettled,
  onPlan,
  onToggleLock,
}: {
  slot: SlotConfig;
  candidates: GearItem[];
  locked: GearItem | null;
  shown: GearItem | null;
  target: GearItem | null;
  spinToken: number;
  /** Bumped when a spin has to end right now (turning the phone, a stuck animation). */
  snapToken: number;
  /** Position among the visible wheels: later wheels turn longer. */
  order: number;
  durationMs: number;
  rowHeight: number;
  /** Sideways: thumbnail beside the name instead of above it. */
  wide: boolean;
  busy: boolean;
  onSettled: (slotIndex: number) => void;
  /** Tells the screen how far this wheel will turn, so the sound can follow it. */
  onPlan: (slotIndex: number, rows: number, durationMs: number) => void;
  onToggleLock: (slotIndex: number, item: GearItem | null) => void;
}) {
  const theme = useTheme();
  const metal = metalById(useMetalId());

  const [ring, setRing] = useState<GearItem[]>(() => expand(makeRing(candidates, [shown])));
  const count = Math.max(1, ring.length);
  const pos = useSharedValue(Math.max(0, ring.findIndex((g) => g.id === shown?.id)));
  const [plan, setPlan] = useState({ id: 0, end: 0 });

  const animating = useRef(false);
  const lastToken = useRef(spinToken);
  const lastSnap = useRef(snapToken);
  const endRef = useRef(0);
  const ringSig = useRef(ringSignature(ring));
  const candSig = candidates.map((g) => `${g.id}:${g.name}:${g.imageUri ?? ''}`).join('|');
  const candSigRef = useRef(candSig);

  // Standing still: follow lock and collection changes by jumping to the right row.
  useEffect(() => {
    if (animating.current) return;
    const sameSet = candSigRef.current === candSig;
    const holdsShown = ring.some((g) => g.id === shown?.id);
    let next = ring;
    if (!sameSet || (shown && !holdsShown)) {
      next = expand(makeRing(candidates, [shown]));
      candSigRef.current = candSig;
    }
    const sig = ringSignature(next);
    const changed = sig !== ringSig.current;
    if (changed) {
      ringSig.current = sig;
      setRing(next);
    }
    const idx = Math.max(0, next.findIndex((g) => g.id === shown?.id));
    if (changed || mod(Math.round(pos.value), Math.max(1, next.length)) !== idx) pos.value = idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candSig, shown?.id]);

  // A new token starts a spin: choose where to stop, then turn.
  useEffect(() => {
    if (lastToken.current === spinToken) return;
    lastToken.current = spinToken;
    if (locked || !target || candidates.length < 2) return;

    const next = expand(makeRing(candidates, [shown, target]));
    const sig = ringSignature(next);
    const changed = sig !== ringSig.current;
    const m = next.length;
    if (changed) {
      ringSig.current = sig;
      candSigRef.current = candSig;
      setRing(next);
      pos.value = Math.max(0, next.findIndex((g) => g.id === shown?.id));
    }
    const base = Math.round(pos.value);
    const to = Math.max(0, next.findIndex((g) => g.id === target.id));
    const delta = mod(to - mod(base, m), m);
    const rows = TICK_ROWS + order * 3;
    const extra = delta >= rows ? 0 : m * Math.ceil((rows - delta) / m);
    endRef.current = base + delta + extra;
    onPlan(slot.slotIndex, delta + extra, durationMs);
    animating.current = true;
    setPlan((p) => ({ id: p.id + 1, end: endRef.current }));
    // Only a new token starts a spin; everything else is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  const done = () => {
    animating.current = false;
    select();
    onSettled(slot.slotIndex);
  };

  // The turn itself. It runs once the (possibly new) ring is on screen.
  useEffect(() => {
    if (!plan.id) return undefined;
    pos.value = withSequence(
      withTiming(plan.end + OVERSHOOT, { duration: durationMs, easing: Easing.out(Easing.quad) }),
      withTiming(plan.end, { duration: SETTLE_MS, easing: Easing.inOut(Easing.quad) }, (finished) => {
        if (finished) scheduleOnRN(done);
      }),
    );
    return () => cancelAnimation(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);

  // End a turn immediately (the phone turned, or the animation never reported back).
  useEffect(() => {
    if (lastSnap.current === snapToken) return;
    lastSnap.current = snapToken;
    if (!animating.current) return;
    cancelAnimation(pos);
    pos.value = endRef.current;
    animating.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapToken]);

  const isLocked = !!locked;
  const canLock = !busy && (isLocked || !!shown);
  const thumb = Math.round(rowHeight * (wide ? 0.6 : 0.4));

  return (
    <View style={styles.reelCol}>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.center}>
        {slot.category}
      </ThemedText>
      <View style={[styles.bezel, lift(theme.shadow, 3)]}>
        {/* The trim is cut from the chosen metal. */}
        <View style={styles.bezelMetal}>
          <Image source={metal.texture} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={['#FFFFFF59', '#FFFFFF00', '#00000073']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
        </View>
        <View
          style={[styles.window, { height: rowHeight * VISIBLE_ROWS, backgroundColor: theme.reel }]}
          accessibilityLabel={`${slot.category} wheel: ${shown?.name ?? 'empty'}${isLocked ? ', locked' : ''}`}>
          {ring.map((item, i) => (
            <ReelRow key={`${i}:${item.id}`} item={item} index={i} count={count} pos={pos} rowHeight={rowHeight} thumb={thumb} wide={wide} />
          ))}
          {ring.length === 0 ? (
            <View style={[styles.row, { height: rowHeight, top: rowHeight }]}>
              <ThemedText style={[styles.center, { color: theme.reelText, opacity: 0.7, fontSize: 13, lineHeight: 17 }]}>
                {`No ${slot.category.toLowerCase()} yet`}
              </ThemedText>
            </View>
          ) : null}
          {/* The drum curves away at the top and bottom, with a lit band across the middle. */}
          <LinearGradient pointerEvents="none" colors={[theme.reel, theme.reel + 'E6', theme.reel + '00']} style={[styles.shade, { top: 0, height: rowHeight * 0.95 }]} />
          <LinearGradient pointerEvents="none" colors={[theme.reel + '00', theme.reel + 'E6', theme.reel]} style={[styles.shade, { bottom: 0, height: rowHeight * 0.95 }]} />
          <LinearGradient pointerEvents="none" colors={['#FFFFFF00', '#FFFFFF1C', '#FFFFFF00']} style={[styles.shade, { top: rowHeight, height: rowHeight }]} />
          <View pointerEvents="none" style={[styles.line, { top: rowHeight, backgroundColor: metal.line }]} />
          <View pointerEvents="none" style={[styles.line, { top: rowHeight * 2 - 1.5, backgroundColor: metal.line }]} />
          <View pointerEvents="none" style={[styles.pointer, styles.pointerL, { top: rowHeight * 1.5 - 7, borderLeftColor: metal.line }]} />
          <View pointerEvents="none" style={[styles.pointer, styles.pointerR, { top: rowHeight * 1.5 - 7, borderRightColor: metal.line }]} />
          {/* Inner edge, and a diagonal glint on the glass. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: Radius.medium, borderWidth: 1, borderColor: '#000000AA' }]} />
          <LinearGradient pointerEvents="none" colors={['#FFFFFF33', '#FFFFFF08', '#FFFFFF00']} locations={[0, 0.35, 0.6]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: Radius.medium }]} />
        </View>
        {isLocked ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: Radius.large, borderWidth: 3, borderColor: theme.accent }]} /> : null}
      </View>
      <Pressable
        onPress={() => onToggleLock(slot.slotIndex, isLocked ? null : shown)}
        disabled={!canLock}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={isLocked ? `Unlock ${slot.category}` : `Lock ${shown?.name ?? slot.category}`}
        style={({ pressed }) => [styles.lock, !canLock && { opacity: 0.4 }, pressed && { opacity: 0.6 }]}>
        <Icon name={isLocked ? 'lock' : 'unlock'} size={20} color={isLocked ? theme.accent : theme.text} />
        <ThemedText type="smallBold" style={{ color: isLocked ? theme.accent : theme.textSecondary, fontSize: 11, lineHeight: 13 }}>
          {isLocked ? 'Locked' : 'Lock'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The wheels
// ---------------------------------------------------------------------------
export interface SpinControl {
  label: string;
  caption?: string;
  icon: 'spin' | 'sparkle';
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}

export function RouletteSpinner({ onControl }: { onControl: (c: SpinControl) => void }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const { items, slots, itemById, setLock, recordSpin, lastSpin } = useGear();
  const spinStyle = useSpinStyle();

  const visibleCount = landscape ? slots.length : Math.min(slots.length, PORTRAIT_WHEELS);
  const hiddenCount = slots.length - visibleCount;
  const rowHeight = landscape ? Math.max(56, Math.min(68, Math.round((height - 250) / VISIBLE_ROWS))) : 100;

  const candidates = useMemo(() => {
    const m = new Map<number, GearItem[]>();
    for (const s of slots) m.set(s.slotIndex, items.filter((g) => g.category === s.category));
    return m;
  }, [slots, items]);

  // A lock only counts while the item still exists and still fits the slot.
  const lockedBySlot = useMemo(() => {
    const m = new Map<number, GearItem | null>();
    for (const s of slots) {
      const g = itemById(s.lockedItemId);
      m.set(s.slotIndex, g && g.category === s.category ? g : null);
    }
    return m;
  }, [slots, itemById]);

  // What each wheel shows at rest: its lock, else the last spin's pick, else the first item.
  const restingFromLastSpin = useMemo(() => {
    const m = new Map<number, GearItem | null>();
    for (const p of lastSpin?.picks ?? []) m.set(p.slotIndex, itemById(p.itemId));
    return m;
  }, [lastSpin, itemById]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [token, setToken] = useState(0);
  const [snap, setSnap] = useState(0);
  const [targets, setTargets] = useState<Record<number, GearItem | null>>({});
  // What each wheel is showing at rest. It changes only when that wheel lands, so a spin never flashes its result first.
  const [landed, setLanded] = useState<Record<number, GearItem | null>>({});
  const targetsRef = useRef<Record<number, GearItem | null>>({});
  const [why, setWhy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pending = useRef(new Set<number>());
  const picksRef = useRef<SpinPick[]>([]);
  const plans = useRef(new Map<number, { rows: number; durationMs: number }>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    warmUpSounds();
    return () => {
      timers.current.forEach(clearTimeout);
      stopAllSounds();
    };
  }, []);

  // Wheels reordered or changed: the old stopping places no longer line up.
  const slotSig = slots.map((s) => s.category).join('|');
  useEffect(() => {
    setTargets({});
    setLanded({});
  }, [slotSig]);

  const finish = useCallback(async () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLanded((prev) => ({ ...prev, ...targetsRef.current }));
    setPhase('done');
    success();
    await recordSpin(picksRef.current);
  }, [recordSpin]);

  // Turning the phone mid-spin changes which wheels are on screen: just land.
  const spinning = phase === 'spinning';
  useEffect(() => {
    if (spinning) {
      pending.current.clear();
      stopAllSounds();
      setSnap((n) => n + 1);
      void finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount]);

  const spin = useCallback(async () => {
    if (phase === 'spinning' || phase === 'choosing') return;
    stopAllSounds();
    setWhy(null);
    setNote(null);

    // Coordinated: ask the AI for a set that goes together; fall back to random.
    let coordinated: Map<number, string> | null = null;
    if (spinStyle === 'coordinated' && items.length > 0) {
      setPhase('choosing');
      if (await ensureAiConsent('set')) {
        const res = await pickCoordinated(
          slots.map((s) => ({
            slot: s.slotIndex,
            category: s.category,
            locked: lockedBySlot.get(s.slotIndex)?.id,
            options: (candidates.get(s.slotIndex) ?? []).map((g) => ({
              id: g.id,
              name: g.name,
              brand: g.brand,
              model: g.model,
              material: g.material,
              finish: g.finish,
              color: g.primaryColor,
            })),
          })),
        );
        if (res.ok) {
          coordinated = new Map(res.picks.map((p) => [p.slot, p.id]));
          setWhy(res.why || null);
        } else {
          setNote("Couldn't coordinate a set just now, so this one is random.");
        }
      } else {
        setNote('AI help is off, so this spin is random. You can change that in Settings.');
      }
    }

    const next: Record<number, GearItem | null> = {};
    const picks: SpinPick[] = [];
    const moving: number[] = [];
    slots.forEach((s, index) => {
      const locked = lockedBySlot.get(s.slotIndex) ?? null;
      const list = candidates.get(s.slotIndex) ?? [];
      const coordinatedPick = coordinated?.get(s.slotIndex);
      const coordinatedItem = coordinatedPick ? (list.find((g) => g.id === coordinatedPick) ?? null) : null;
      const chosen = locked ?? coordinatedItem ?? pickRandom(list);
      next[s.slotIndex] = chosen;
      picks.push({ slotIndex: s.slotIndex, category: s.category, itemId: chosen?.id ?? null, locked: !!locked });
      // Wheels off screen (portrait) and locked or empty wheels pick without turning.
      if (!locked && chosen && list.length > 1 && index < visibleCount) moving.push(s.slotIndex);
    });
    pending.current = new Set(moving);
    plans.current.clear();
    picksRef.current = picks;
    targetsRef.current = next;
    setTargets(next);
    if (moving.length === 0) {
      landSound();
      void finish();
      return;
    }
    setPhase('spinning');
    setToken((t) => t + 1);

    // The wheels tick as they turn. If one never reports back (the app was
    // backgrounded, say), land everything once the longest turn should be over.
    const lastIndex = Math.max(0, slots.findIndex((s) => s.slotIndex === moving[moving.length - 1]));
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => {
        pending.current.clear();
        setSnap((n) => n + 1);
        stopAllSounds();
        void finish();
      }, BASE_MS + lastIndex * STAGGER_MS + 1800),
    ];
  }, [phase, spinStyle, items.length, slots, lockedBySlot, candidates, visibleCount, finish]);

  const settled = useCallback(
    (slotIndex: number) => {
      setLanded((prev) => ({ ...prev, [slotIndex]: targetsRef.current[slotIndex] ?? null }));
      pending.current.delete(slotIndex);
      if (pending.current.size === 0) {
        landSound();
        void finish();
      }
    },
    [finish],
  );

  // Once every turning wheel has said how far it goes, play the spin's soundtrack in one go.
  const planned = useCallback((slotIndex: number, rows: number, durationMs: number) => {
    plans.current.set(slotIndex, { rows, durationMs });
    if (plans.current.size === pending.current.size) {
      const runs = [...plans.current.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
      startSpinSound(runs, OVERSHOOT, SETTLE_MS);
    }
  }, []);

  const toggleLock = useCallback((slotIndex: number, item: GearItem | null) => void setLock(slotIndex, item?.id ?? null), [setLock]);

  const allLocked = slots.length > 0 && slots.every((s) => lockedBySlot.get(s.slotIndex));
  const empty = items.length === 0;
  const busy = phase === 'spinning' || phase === 'choosing';

  const label = 'Spin';
  const caption = allLocked ? 'All wheels locked' : spinStyle === 'coordinated' ? 'Picks a matching set' : undefined;
  const spinRef = useRef(spin);
  spinRef.current = spin;
  useEffect(() => {
    onControl({ label, caption, icon: spinStyle === 'coordinated' ? 'sparkle' : 'spin', busy, disabled: empty || busy, onPress: () => void spinRef.current() });
  }, [label, caption, spinStyle, busy, empty, onControl]);

  return (
    <View style={styles.machine}>
      {hiddenCount > 0 ? (
        <ThemedText type="caption" themeColor="textSecondary" style={[styles.center, styles.tiny]}>
          {hiddenCount === 1 ? '1 more wheel' : `${hiddenCount} more wheels`} when sideways
        </ThemedText>
      ) : null}

      <View style={styles.reels}>
        {slots.slice(0, visibleCount).map((s, i) => {
          const locked = lockedBySlot.get(s.slotIndex) ?? null;
          const list = candidates.get(s.slotIndex) ?? [];
          const shown = locked ?? landed[s.slotIndex] ?? restingFromLastSpin.get(s.slotIndex) ?? list[0] ?? null;
          return (
            <Reel
              key={s.slotIndex}
              slot={s}
              candidates={list}
              locked={locked}
              shown={shown}
              target={targets[s.slotIndex] ?? null}
              spinToken={token}
              snapToken={snap}
              order={i}
              durationMs={BASE_MS + i * STAGGER_MS}
              rowHeight={rowHeight}
              wide={landscape}
              busy={busy}
              onSettled={settled}
              onPlan={planned}
              onToggleLock={toggleLock}
            />
          );
        })}
      </View>

      {why && phase === 'done' ? (
        <View style={[styles.why, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
          <Icon name="sparkle" size={14} color={theme.accent} />
          <ThemedText type="small" style={[styles.flex, { fontSize: 12, lineHeight: 16 }]}>
            {why}
          </ThemedText>
        </View>
      ) : null}
      {note && !busy ? (
        <ThemedText type="small" themeColor="textSecondary" style={[styles.center, { fontSize: 12, lineHeight: 16 }]}>
          {note}
        </ThemedText>
      ) : null}
      {empty ? (
        <ThemedText type="caption" themeColor="textSecondary" style={[styles.center, styles.tiny]}>
          Add some gear in the Collection tab to start spinning.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  machine: { gap: Spacing.three },
  flex: { flex: 1 },
  reels: { flexDirection: 'row', gap: Spacing.two },
  reelCol: { flex: 1, gap: Spacing.two, alignItems: 'stretch' },
  bezel: { borderRadius: Radius.large, padding: 5 },
  bezelMetal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: Radius.large, overflow: 'hidden' },
  window: { borderRadius: Radius.medium, overflow: 'hidden' },
  line: { position: 'absolute', zIndex: 3, left: 0, right: 0, height: 1.5, opacity: 0.9 },
  pointer: { position: 'absolute', zIndex: 3, width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  pointerL: { left: 0, borderLeftWidth: 9 },
  pointerR: { right: 0, borderRightWidth: 9 },
  row: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingHorizontal: 14 },
  rowWide: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: 16 },
  nameWide: { flex: 1 },
  dim: { opacity: 0.45, transform: [{ scale: 0.86 }] },
  shade: { position: 'absolute', left: 0, right: 0 },
  lock: { alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 2 },
  center: { textAlign: 'center' },
  tiny: { fontSize: 10, lineHeight: 12, letterSpacing: 0.6 },
  order: { marginBottom: -Spacing.one },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, borderRadius: Radius.pill, borderWidth: 1 },
  chipText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  why: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth },
});
