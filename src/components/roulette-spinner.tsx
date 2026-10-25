/**
 * The wheels: one vertical wheel per slot, up to six. Locked wheels never turn
 * and always land on their locked piece. Unlocked wheels land on a random piece
 * of their category, or on a set that goes well together when the spin style is
 * "Coordinated" (an AI picks; see lib/api.ts). They stop in a random order with soft
 * tick sounds, and the result is recorded as today's carry.
 *
 * Every wheel is a square window onto its drum: the piece in the middle with a
 * sliver of the one above and below. Three across (all six sideways on a phone),
 * the same on every device, just bigger on a tablet. Press and hold a wheel and
 * they all wiggle like home-screen icons: tap one to change what it spins, drag
 * to reorder, tap the x to remove, tap the + to add one (repeats are allowed).
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { GearThumb } from '@/components/gear-thumb';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { metalById } from '@/constants/metals';
import { Button } from '@/components/ui/button';
import { lift, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ensureAiConsent } from '@/lib/ai-consent';
import { pickCoordinated } from '@/lib/api';
import { useGear, type SlotDraft } from '@/lib/gear';
import { MIN_SLOTS } from '@/lib/limits';
import { select, success, tap } from '@/lib/haptics';
import { useLayoutMode } from '@/lib/layout-mode';
import { setScrollLocked } from '@/lib/scroll-lock';
import { useMetalId, useSpinStyle } from '@/lib/preferences';
import { CATEGORIES, DEFAULT_SLOT_CATEGORIES } from '@/types/models';
import { useTourTarget } from '@/lib/tour';
import { landSound, startSpinSound, stopAllSounds, warmUpSounds } from '@/lib/sounds';
import type { GearItem, SlotConfig, SpinPick } from '@/types/models';

const BASE_MS = 2200;
const GAP = 10; // between wheels, sideways and down
const LABEL_H = 26; // the category name and lock above each window
const BEZEL = 4; // the metal trim around a window
const PLUS_ID = 999; // the empty slot shown while editing
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
const TICK_ROWS = 10; // the fewest rows a wheel travels
const ROWS_PER_MS = 0.0047; // about the same speed on every wheel
/** Each wheel's own speed for one spin: close to the others, never exactly the same. */
const speedFor = () => 0.85 + Math.random() * 0.3;
/** How long one wheel turns: a random place in the stopping order, each with its own friction, so they never stop in lockstep. */
const turnMs = (index: number) => (BASE_MS + index * STAGGER_MS) * (0.88 + Math.random() * 0.24);

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
  top,
  thumb,
  font,
}: {
  item: GearItem;
  index: number;
  count: number;
  pos: SharedValue<number>;
  rowHeight: number;
  /** Where the row sits in the window when it is on the payline. */
  top: number;
  thumb: number;
  font: number;
}) {
  const theme = useTheme();
  const style = useAnimatedStyle(() => {
    const half = count / 2;
    // Rows from the payline: 0 at the centre, negative above, positive below.
    const rel = ((((index - pos.value + half) % count) + count) % count) - half;
    const a = Math.abs(rel);
    return {
      opacity: interpolate(a, [0, 1, 1.7], [1, 0.5, 0], Extrapolation.CLAMP),
      transform: [{ translateY: rel * rowHeight }, { scale: interpolate(a, [0, 1], [1, 0.9], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={[styles.row, styles.rowTile, { height: rowHeight, top }, style]}>
      <GearThumb item={item} size={thumb} />
      <ThemedText numberOfLines={2} style={[styles.center, { color: theme.reelText, fontSize: font, lineHeight: font + 2, fontWeight: '600' }]}>
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
  durationMs,
  speed,
  size,
  editing,
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
  /** How long this wheel turns this spin (it differs from wheel to wheel). */
  durationMs: number;
  /** This wheel's speed for this spin, close to 1. */
  speed: number;
  /** Width of the wheel, trim included (px). The window is square. */
  size: number;
  /** Wiggling: the lock is hidden while wheels are being rearranged. */
  editing: boolean;
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
    // Every wheel turns at about the same speed, each a little different: the longer it runs, the further it goes.
    const rows = Math.max(TICK_ROWS, Math.round(durationMs * ROWS_PER_MS * speed));
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
  const canLock = !busy && !editing && (isLocked || !!shown);
  // The window is square: the piece on the payline in the middle, a sliver of its neighbours above and below.
  const win = size - BEZEL * 2;
  const peek = Math.round(win * 0.13);
  const rowHeight = win - peek * 2;
  const thumb = Math.round(rowHeight * 0.5);
  const font = Math.max(10, Math.round(win * 0.1));

  return (
    <View style={{ width: size }}>
      <View style={styles.labelRow}>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.labelText}>
          {slot.category}
        </ThemedText>
        {!editing ? (
          <Pressable
            onPress={() => onToggleLock(slot.slotIndex, isLocked ? null : shown)}
            disabled={!canLock}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isLocked ? `Unlock ${slot.category}` : `Lock ${shown?.name ?? slot.category}`}
            style={({ pressed }) => [styles.lockHit, !canLock && { opacity: 0.4 }, pressed && { opacity: 0.6 }]}>
            <Icon name={isLocked ? 'lock' : 'unlock'} size={18} color={isLocked ? theme.accent : theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.bezel, { padding: BEZEL }, lift(theme.shadow, 3)]}>
        {/* The trim is cut from the chosen metal. */}
        <View style={styles.bezelMetal}>
          <Image source={metal.texture} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={['#FFFFFF59', '#FFFFFF00', '#00000073']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
        </View>
        <View
          style={[styles.window, { width: win, height: win, backgroundColor: theme.reel }]}
          accessibilityLabel={`${slot.category} wheel: ${shown?.name ?? 'empty'}${isLocked ? ', locked' : ''}`}>
          {ring.map((item, i) => (
            <ReelRow key={`${i}:${item.id}`} item={item} index={i} count={count} pos={pos} rowHeight={rowHeight} top={peek} thumb={thumb} font={font} />
          ))}
          {ring.length === 0 ? (
            <View style={[styles.row, styles.rowTile, { height: rowHeight, top: peek }]}>
              <ThemedText style={[styles.center, { color: theme.reelText, opacity: 0.7, fontSize: font, lineHeight: font + 3 }]}>
                {`No ${slot.category.toLowerCase()} yet`}
              </ThemedText>
            </View>
          ) : null}
          {/* The drum curves away at the top and bottom, with a lit band across the middle. */}
          <LinearGradient pointerEvents="none" colors={[theme.reel, theme.reel + 'E6', theme.reel + '00']} style={[styles.shade, { top: 0, height: peek + rowHeight * 0.15 }]} />
          <LinearGradient pointerEvents="none" colors={[theme.reel + '00', theme.reel + 'E6', theme.reel]} style={[styles.shade, { bottom: 0, height: peek + rowHeight * 0.15 }]} />
          <LinearGradient pointerEvents="none" colors={['#FFFFFF00', '#FFFFFF1C', '#FFFFFF00']} style={[styles.shade, { top: peek, height: rowHeight }]} />
          <View pointerEvents="none" style={[styles.line, { top: peek, backgroundColor: metal.line }]} />
          <View pointerEvents="none" style={[styles.line, { top: peek + rowHeight - 1.5, backgroundColor: metal.line }]} />
          <View pointerEvents="none" style={[styles.pointer, styles.pointerL, { top: win / 2 - 7, borderLeftColor: metal.line }]} />
          <View pointerEvents="none" style={[styles.pointer, styles.pointerR, { top: win / 2 - 7, borderRightColor: metal.line }]} />
          {/* Inner edge, and a diagonal glint on the glass. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: Radius.medium, borderWidth: 1, borderColor: '#000000AA' }]} />
          <LinearGradient pointerEvents="none" colors={['#FFFFFF33', '#FFFFFF08', '#FFFFFF00']} locations={[0, 0.35, 0.6]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: Radius.medium }]} />
        </View>
        {isLocked ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: Radius.large, borderWidth: 3, borderColor: theme.accent }]} /> : null}
      </View>
    </View>
  );
}

/**
 * Where a wheel sits on the grid: `cols` across, a short last row centred.
 * Used both to place wheels and to work out where a dragged one is hovering.
 */
function cellPosition(index: number, total: number, cols: number, size: number) {
  const row = Math.floor(index / cols);
  const inRow = Math.min(cols, total - row * cols);
  const offset = ((cols - inRow) * (size + GAP)) / 2;
  return { x: (index % cols) * (size + GAP) + offset, y: row * (size + LABEL_H + GAP) };
}

/**
 * One wheel's place on the grid. Holds the wiggle, the x, and the gestures: press and hold
 * starts editing; while editing, tap changes the wheel and dragging moves it.
 */
function Cell({
  id,
  index,
  total,
  last,
  cols,
  size,
  editing,
  plus,
  canRemove,
  canHold,
  children,
  onHold,
  onTap,
  onRemove,
  onDragStart,
  onDragMove,
  onDrop,
}: {
  id: number;
  index: number;
  total: number;
  /** Index of the last real wheel (the + slot, when shown, comes after it). */
  last: number;
  cols: number;
  size: number;
  editing: boolean;
  /** The empty slot shown while editing, to add a wheel. */
  plus?: boolean;
  canRemove: boolean;
  canHold: boolean;
  children: ReactNode;
  onHold: () => void;
  onTap: (id: number) => void;
  onRemove: (id: number) => void;
  onDragStart: (id: number) => void;
  onDragMove: (id: number, to: number) => void;
  onDrop: (id: number, to: number) => void;
}) {
  const theme = useTheme();
  const target = cellPosition(index, total, cols, size);
  const x = useSharedValue(target.x);
  const y = useSharedValue(target.y);
  const lift = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const wig = useSharedValue(0);
  const lastIndex = useSharedValue(index);
  // The slot this wheel belongs in right now, readable from the gesture even when it was set up a render ago.
  const slotX = useSharedValue(target.x);
  const slotY = useSharedValue(target.y);
  const first = useRef(true);
  slotX.value = target.x;
  slotY.value = target.y;

  // Slide to a new place when the order changes (not the one being dragged, which follows the finger).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (lift.value) return;
    x.value = withTiming(target.x, { duration: 200 });
    y.value = withTiming(target.y, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.x, target.y]);

  // Wiggle like a home-screen icon, each wheel a little out of step.
  useEffect(() => {
    if (editing && !plus) {
      wig.value = -1;
      wig.value = withDelay((id % 3) * 45, withRepeat(withTiming(1, { duration: 120 }), -1, true));
    } else {
      cancelAnimation(wig);
      wig.value = withTiming(0, { duration: 120 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, plus]);

  const cellH = size + LABEL_H;

  const hold = Gesture.LongPress()
    .minDuration(450)
    .enabled(!editing && canHold && !plus)
    .onStart(() => {
      scheduleOnRN(onHold);
    });
  const press = Gesture.Tap()
    .enabled(editing)
    .onEnd((_e, ok) => {
      if (ok) scheduleOnRN(onTap, id);
    });
  const drag = Gesture.Pan()
    .enabled(editing && !plus)
    .minDistance(8)
    .onStart(() => {
      dragX.value = x.value;
      dragY.value = y.value;
      lastIndex.value = index;
      lift.value = 1;
      scheduleOnRN(onDragStart, id);
    })
    .onUpdate((e) => {
      dragX.value = x.value + e.translationX;
      dragY.value = y.value + e.translationY;
      const col = Math.max(0, Math.min(cols - 1, Math.round(dragX.value / (size + GAP))));
      const row = Math.max(0, Math.round(dragY.value / (cellH + GAP)));
      const to = Math.max(0, Math.min(last, row * cols + col));
      if (to !== lastIndex.value) {
        lastIndex.value = to;
        scheduleOnRN(onDragMove, id, to);
      }
    })
    .onFinalize(() => {
      // Runs when the finger lifts, and also if the gesture is cancelled: either way the wheel is dropped where it hovers.
      if (!lift.value) return;
      x.value = dragX.value;
      y.value = dragY.value;
      lift.value = 0;
      x.value = withTiming(slotX.value, { duration: 180 });
      y.value = withTiming(slotY.value, { duration: 180 });
      scheduleOnRN(onDrop, id, lastIndex.value);
    });
  const gesture = Gesture.Race(hold, drag, press);

  const style = useAnimatedStyle(() => ({
    left: lift.value ? dragX.value : x.value,
    top: lift.value ? dragY.value : y.value,
    zIndex: lift.value ? 10 : 1,
    transform: [{ rotate: `${wig.value * 1.5}deg` }, { scale: lift.value ? 1.07 : 1 }],
  }));

  return (
    <Animated.View style={[styles.cell, { width: size, height: cellH }, style]}>
      <GestureDetector gesture={gesture}>
        <Animated.View collapsable={false} style={styles.flex}>
          {children}
        </Animated.View>
      </GestureDetector>
      {editing && !plus && canRemove ? (
        <Pressable
          onPress={() => onRemove(id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove this wheel"
          style={[styles.remove, { backgroundColor: theme.text, borderColor: theme.background }]}>
          <Icon name="close" size={11} color={theme.background} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/** Choose what a wheel spins. Categories you have nothing in yet are still allowed. */
function CategoryPicker({
  visible,
  title,
  current,
  counts,
  onChoose,
  onClose,
}: {
  visible: boolean;
  title: string;
  current: string | null;
  counts: Map<string, number>;
  onChoose: (category: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => undefined}>
          <ThemedText type="heading">{title}</ThemedText>
          <View style={styles.choices}>
            {CATEGORIES.map((c) => {
              const on = current === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => onChoose(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [styles.choice, { backgroundColor: on ? theme.accent : theme.backgroundElement, borderColor: on ? theme.accent : theme.border }, pressed && { opacity: 0.7 }]}>
                  <ThemedText type="smallBold" style={{ color: on ? theme.onAccent : theme.text }}>
                    {c}
                    <ThemedText type="small" style={{ color: on ? theme.onAccent : theme.textSecondary }}>{`  ${counts.get(c) ?? 0}`}</ThemedText>
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            You can have the same category on more than one wheel.
          </ThemedText>
        </Pressable>
      </Pressable>
    </Modal>
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
  const { landscape, big } = useLayoutMode();
  // Big windows (iPad, open foldable) always show every wheel, at one size, in the middle.
  const [boxWidth, setBoxWidth] = useState(0);
  const wheelsRef = useTourTarget('wheels');
  const { items, slots, itemById, setLock, recordSpin, lastSpin } = useGear();
  const spinStyle = useSpinStyle();

  const { saveSlots, maxSlots } = useGear();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const orderRef = useRef<number[]>([]);
  const savingOrder = useRef('');
  const [picker, setPicker] = useState<{ mode: 'change'; slotIndex: number } | { mode: 'add' } | null>(null);
  const [fullWidth, setFullWidth] = useState(0);
  const { width: windowWidth } = useWindowDimensions();

  // Three across, two down; sideways on a phone all six fit in one row. The same on every device, just bigger on a big window.
  const count = slots.length;
  const canAdd = editing && count < maxSlots;
  const total = count + (canAdd ? 1 : 0);
  const cols = landscape && !big ? Math.max(1, Math.min(6, total)) : 3;
  const rows = Math.max(1, Math.ceil(total / cols));
  const avail = boxWidth || fullWidth || windowWidth - Spacing.three * 2;
  const maxSize = big ? 190 : landscape ? 132 : 150;
  const size = Math.max(84, Math.min(maxSize, Math.floor((avail - GAP * (cols - 1)) / cols)));
  const gridHeight = rows * (size + LABEL_H) + (rows - 1) * GAP;

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
  const [durations, setDurations] = useState<Record<number, number>>({});
  const [speeds, setSpeeds] = useState<Record<number, number>>({});
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

  const spin = useCallback(async () => {
    if (phase === 'spinning' || phase === 'choosing') return;
    setEditing(false);
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
    const taken = new Set<string>();
    slots.forEach((s) => {
      const locked = lockedBySlot.get(s.slotIndex) ?? null;
      const list = candidates.get(s.slotIndex) ?? [];
      const coordinatedPick = coordinated?.get(s.slotIndex);
      const coordinatedItem = coordinatedPick ? (list.find((g) => g.id === coordinatedPick) ?? null) : null;
      // Two wheels of the same category don't land on the same piece when there is another to choose.
      const chosen = locked ?? coordinatedItem ?? pickRandom(list.filter((g) => !taken.has(g.id))) ?? pickRandom(list);
      if (chosen) taken.add(chosen.id);
      next[s.slotIndex] = chosen;
      picks.push({ slotIndex: s.slotIndex, category: s.category, itemId: chosen?.id ?? null, locked: !!locked });
      // Locked or empty wheels pick without turning.
      if (!locked && chosen && list.length > 1) moving.push(s.slotIndex);
    });
    pending.current = new Set(moving);
    const times: Record<number, number> = {};
    // Each turning wheel gets a random place in the stopping order, not left to right.
    const places = shuffle(moving.map((_, k) => k));
    moving.forEach((slotIndex, k) => {
      times[slotIndex] = turnMs(places[k] ?? k);
    });
    setDurations(times);
    setSpeeds(Object.fromEntries(moving.map((m) => [m, speedFor()])));
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
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => {
        pending.current.clear();
        setSnap((n) => n + 1);
        stopAllSounds();
        void finish();
      }, Math.max(...moving.map((m) => times[m] ?? 0)) + SETTLE_MS + 1800),
    ];
  }, [phase, spinStyle, items.length, slots, lockedBySlot, candidates, finish]);

  // Tapping the button while the wheels turn lands them on this spin's result right away.
  const stop = useCallback(() => {
    if (phase !== 'spinning') return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    pending.current.clear();
    stopAllSounds();
    setSnap((n) => n + 1);
    landSound();
    void finish();
  }, [phase, finish]);

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

  const spinningNow = phase === 'spinning';
  const label = spinningNow ? 'Stop' : 'Spin';
  const caption = allLocked ? 'All wheels locked' : spinStyle === 'coordinated' ? 'Picks a matching set' : undefined;
  const spinRef = useRef(spin);
  spinRef.current = spin;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    onControl({
      label,
      caption,
      icon: spinStyle === 'coordinated' ? 'sparkle' : 'spin',
      busy,
      disabled: empty || phase === 'choosing',
      onPress: () => (spinningNow ? stopRef.current() : void spinRef.current()),
    });
  }, [label, caption, spinStyle, busy, empty, phase, spinningNow, onControl]);

  // --- Rearranging the wheels ------------------------------------------------------------
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of items) m.set(g.category, (m.get(g.category) ?? 0) + 1);
    return m;
  }, [items]);
  const draftOf = (list: SlotConfig[]): SlotDraft[] => list.map((s) => ({ category: s.category, lockedItemId: s.lockedItemId, from: s.slotIndex }));
  const apply = useCallback(
    async (next: SlotDraft[]) => {
      const r = await saveSlots(next);
      if (!r.ok) Alert.alert('Wheels', r.error);
    },
    [saveSlots],
  );
  // Saves the wheels in the order they now sit in, if that differs from the saved one.
  const commitOrder = useCallback(() => {
    const o = orderRef.current;
    const cur = slotsRef.current;
    if (o.length !== cur.length || o.every((id, i) => id === i)) return;
    const next = o.map((id) => cur[id]).filter((s): s is SlotConfig => !!s);
    const sig = next.map((s) => s.slotIndex).join(',');
    if (savingOrder.current === sig) return;
    savingOrder.current = sig;
    void apply(draftOf(next)).finally(() => {
      savingOrder.current = '';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply]);
  const onDrop = useCallback(
    (id: number, to: number) => {
      // Make sure the dropped wheel is where it was hovering, then save.
      const o = [...orderRef.current];
      const from = o.indexOf(id);
      if (from >= 0 && to >= 0 && to < o.length && from !== to) {
        o.splice(from, 1);
        o.splice(to, 0, id);
        orderRef.current = o;
        setOrder(o);
      }
      commitOrder();
    },
    [commitOrder],
  );
  // Whenever the wheels change, the editing order starts over from them.
  useEffect(() => {
    const o = slots.map((_, i) => i);
    orderRef.current = o;
    setOrder(o);
  }, [slots]);
  useEffect(() => () => setScrollLocked(false), []);
  const startEditing = useCallback(() => {
    tap();
    setEditing(true);
    setScrollLocked(true);
  }, []);
  const stopEditing = useCallback(() => {
    commitOrder();
    setEditing(false);
    setScrollLocked(false);
    setPicker(null);
  }, [commitOrder]);
  // Leaving the Spin screen, or starting a spin, ends editing.
  useEffect(() => {
    if (busy && editing) stopEditing();
  }, [busy, editing, stopEditing]);

  const onMove = useCallback((id: number, to: number) => {
    const o = [...orderRef.current];
    const from = o.indexOf(id);
    if (from < 0 || from === to) return;
    o.splice(from, 1);
    o.splice(to, 0, id);
    orderRef.current = o;
    setOrder(o);
    select();
  }, []);
  const onRemove = useCallback(
    (id: number) => {
      select();
      void apply(draftOf(slotsRef.current.filter((s) => s.slotIndex !== id)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply],
  );
  const resetWheels = () => {
    Alert.alert('Reset wheels?', 'Go back to the four starting wheels: Knife, Flashlight, Pen and Multi-tool. Locks are cleared. Your collection is not touched.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          select();
          void apply(DEFAULT_SLOT_CATEGORIES.map((category) => ({ category, lockedItemId: null })));
        },
      },
    ]);
  };
  const onTapCell = useCallback((id: number) => {
    select();
    setPicker(id === PLUS_ID ? { mode: 'add' } : { mode: 'change', slotIndex: id });
  }, []);
  const choose = (category: string) => {
    const mode = picker;
    setPicker(null);
    if (!mode) return;
    select();
    const cur = draftOf(slotsRef.current);
    void apply(mode.mode === 'add' ? [...cur, { category, lockedItemId: null }] : cur.map((d) => (d.from === mode.slotIndex ? { ...d, category } : d)));
  };
  const pickerCurrent = picker?.mode === 'change' ? (slots.find((s) => s.slotIndex === picker.slotIndex)?.category ?? null) : null;

  return (
    <View ref={wheelsRef} collapsable={false} style={styles.machine} onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}>
      <View style={{ height: gridHeight, width: cols * size + (cols - 1) * GAP, alignSelf: 'center' }}>
        {slots.map((s) => {
          const locked = lockedBySlot.get(s.slotIndex) ?? null;
          const list = candidates.get(s.slotIndex) ?? [];
          const shown = locked ?? landed[s.slotIndex] ?? restingFromLastSpin.get(s.slotIndex) ?? list[0] ?? null;
          const at = editing ? order.indexOf(s.slotIndex) : s.slotIndex;
          return (
            <Cell
              key={s.slotIndex}
              id={s.slotIndex}
              index={at < 0 ? s.slotIndex : at}
              total={total}
              last={count - 1}
              cols={cols}
              size={size}
              editing={editing}
              canRemove={count > MIN_SLOTS}
              canHold={!busy}
              onHold={startEditing}
              onTap={onTapCell}
              onRemove={onRemove}
              onDragStart={select}
              onDragMove={onMove}
              onDrop={onDrop}>
              <Reel
                slot={s}
                candidates={list}
                locked={locked}
                shown={shown}
                target={targets[s.slotIndex] ?? null}
                spinToken={token}
                snapToken={snap}
                durationMs={durations[s.slotIndex] ?? BASE_MS + s.slotIndex * STAGGER_MS}
                speed={speeds[s.slotIndex] ?? 1}
                size={size}
                editing={editing}
                busy={busy}
                onSettled={settled}
                onPlan={planned}
                onToggleLock={toggleLock}
              />
            </Cell>
          );
        })}
        {canAdd ? (
          <Cell id={PLUS_ID} index={count} total={total} last={count - 1} cols={cols} size={size} editing plus canRemove={false} canHold={false} onHold={startEditing} onTap={onTapCell} onRemove={onRemove} onDragStart={select} onDragMove={onMove} onDrop={onDrop}>
            <View style={{ width: size }}>
              <View style={styles.labelRow}>
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.labelText}>
                  Add a wheel
                </ThemedText>
              </View>
              <View style={[styles.plus, { width: size, height: size, borderColor: theme.border }]}>
                <Icon name="add" size={Math.round(size * 0.3)} color={theme.textSecondary} />
              </View>
            </View>
          </Cell>
        ) : null}
      </View>

      {editing ? (
        <View style={styles.editBar}>
          <ThemedText type="small" themeColor="textSecondary" style={[styles.flex, { fontSize: 12, lineHeight: 16 }]}>
            Tap a wheel to change what it spins. Drag to reorder, or tap the x to remove it.
          </ThemedText>
          <Pressable onPress={resetWheels} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reset wheels to the starting four">
            <ThemedText type="small" style={{ color: theme.accent }}>
              Reset
            </ThemedText>
          </Pressable>
          <Pressable onPress={stopEditing} accessibilityRole="button" accessibilityLabel="Done editing wheels" style={[styles.done, { backgroundColor: theme.accent }]}>
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              Done
            </ThemedText>
          </Pressable>
        </View>
      ) : !empty ? (
        <ThemedText type="caption" themeColor="textSecondary" style={[styles.center, styles.tiny]}>
          Press and hold a wheel to change, reorder or remove it
        </ThemedText>
      ) : null}
      <CategoryPicker
        visible={!!picker}
        title={picker?.mode === 'add' ? 'Add a wheel' : 'What does this wheel spin?'}
        current={pickerCurrent}
        counts={counts}
        onChoose={choose}
        onClose={() => setPicker(null)}
      />

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
  cell: { position: 'absolute' },
  labelRow: { height: LABEL_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  lockHit: { width: 40, height: 36, marginRight: -10, marginVertical: -6, alignItems: 'center', justifyContent: 'center' },
  labelText: { flex: 1, fontSize: 10, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  rowTile: { paddingHorizontal: 5, gap: 3 },
  remove: { position: 'absolute', left: -6, top: LABEL_H - 8, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  plus: { borderRadius: Radius.large, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  editBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  done: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: '#000000B3', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  sheet: { width: '100%', maxWidth: 440, borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.four, gap: Spacing.three },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  choice: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
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
