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
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

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
import { landSound, SLOW_MS, slowSound, startSpinSound, stopAllSounds, stopSound, warmUpSounds } from '@/lib/sounds';
import type { GearItem, SlotConfig, SpinPick } from '@/types/models';

const VISIBLE_ROWS = 3; // one above the payline, the payline, one below
const LOOPS = 4; // passes over the category per spin
const BASE_MS = 1500;
const STAGGER_MS = 380;

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

/** The item `offset` places away from `current` in the category, wrapping round. */
function neighbour(list: readonly GearItem[], current: GearItem | null, offset: number): GearItem | null {
  if (!list.length) return null;
  const i = current ? Math.max(0, list.findIndex((g) => g.id === current.id)) : 0;
  return list[(i + offset + list.length * 2) % list.length] ?? null;
}

const idleStrip = (list: readonly GearItem[], current: GearItem | null) => [neighbour(list, current, -1), current, neighbour(list, current, 1)];

// ---------------------------------------------------------------------------
// One wheel
// ---------------------------------------------------------------------------
function Reel({
  slot,
  candidates,
  locked,
  shown,
  target,
  spinToken,
  durationMs,
  rowHeight,
  wide,
  busy,
  onSettled,
  onToggleLock,
}: {
  slot: SlotConfig;
  candidates: GearItem[];
  locked: GearItem | null;
  shown: GearItem | null;
  target: GearItem | null;
  spinToken: number;
  durationMs: number;
  rowHeight: number;
  /** Sideways: thumbnail beside the name instead of above it. */
  wide: boolean;
  busy: boolean;
  onSettled: (slotIndex: number) => void;
  onToggleLock: (slotIndex: number, item: GearItem | null) => void;
}) {
  const theme = useTheme();
  const metal = metalById(useMetalId());
  // The pieces and their scroll position live in one state value, so a new strip
  // always arrives with a fresh position (resetting them separately could leave
  // the window scrolled past a short strip, which showed as a blank wheel).
  const [reel, setReel] = useState<{ id: number; strip: (GearItem | null)[]; y: Animated.Value; go: number }>(() => ({
    id: 0,
    strip: idleStrip(candidates, shown),
    y: new Animated.Value(0),
    go: 0,
  }));
  const { strip, y } = reel;
  const lastToken = useRef(spinToken);
  const animating = useRef(false);
  const stopAtRef = useRef(0);

  // What the window is showing, so a refresh that changes nothing (coming back to
  // the app, say) never rebuilds the wheel.
  const candSig = candidates.map((g) => `${g.id}:${g.name}:${g.imageUri ?? ''}`).join('|');
  const centerRef = useRef<string | null>(shown?.id ?? null);
  const sigRef = useRef(candSig);

  // Follow collection and lock changes while standing still.
  useEffect(() => {
    if (animating.current || lastToken.current !== spinToken) return;
    if (centerRef.current === (shown?.id ?? null) && sigRef.current === candSig) return;
    centerRef.current = shown?.id ?? null;
    sigRef.current = candSig;
    setReel((r) => ({ id: r.id + 1, strip: idleStrip(candidates, shown), y: new Animated.Value(0), go: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candSig, shown?.id, spinToken]);

  // Run the turn once the new strip is on screen.
  useEffect(() => {
    if (!reel.go) return;
    const anim = Animated.timing(reel.y, {
      toValue: -(stopAtRef.current - 1) * rowHeight,
      duration: durationMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      animating.current = false;
      if (finished) {
        select();
        onSettled(slot.slotIndex);
      }
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel.go]);

  useEffect(() => {
    if (lastToken.current === spinToken) return;
    lastToken.current = spinToken;
    if (locked || !target || candidates.length === 0) return;

    const s: (GearItem | null)[] = idleStrip(candidates, shown);
    for (let i = 0; i < LOOPS; i += 1) s.push(...shuffle(candidates));
    // The last three rows are exactly what the wheel shows at rest, so landing never shifts anything.
    s.push(neighbour(candidates, target, -1), target, neighbour(candidates, target, 1));
    stopAtRef.current = s.length - 2;
    centerRef.current = target.id;
    sigRef.current = candSig;
    animating.current = true;
    // The strip stays where it stops; the next change swaps in a fresh one.
    setReel((r) => ({ id: r.id + 1, strip: s, y: new Animated.Value(0), go: r.go + 1 }));
    return undefined;
    // Only a new token starts a spin; everything else is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

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
          <Animated.View key={reel.id} style={{ transform: [{ translateY: y }] }}>
            {strip.map((item, i) => (
              <View key={i} style={[styles.row, { height: rowHeight }, wide && styles.rowWide, strip.length <= 3 && i !== 1 && styles.dim]}>
                {item ? (
                  <>
                    <GearThumb item={item} size={thumb} />
                    <ThemedText
                      numberOfLines={2}
                      style={[wide ? styles.nameWide : styles.center, { color: theme.reelText, fontSize: 13, lineHeight: 16, fontWeight: '600' }]}>
                      {item.name}
                    </ThemedText>
                  </>
                ) : i === 1 ? (
                  <ThemedText style={[styles.center, { color: theme.reelText, opacity: 0.7, fontSize: 13, lineHeight: 17 }]}>
                    {`No ${slot.category.toLowerCase()} yet`}
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </Animated.View>
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
        accessibilityRole="button"
        accessibilityLabel={isLocked ? `Unlock ${slot.category}` : `Lock ${shown?.name ?? slot.category}`}
        style={({ pressed }) => [styles.lock, { backgroundColor: isLocked ? theme.accent : theme.surface, borderColor: isLocked ? theme.accent : theme.border }, !canLock && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
        <Icon name={isLocked ? 'lock' : 'unlock'} size={14} color={isLocked ? theme.onAccent : theme.text} />
        {wide ? null : (
          <ThemedText type="smallBold" style={{ color: isLocked ? theme.onAccent : theme.text, fontSize: 12 }}>
            {isLocked ? 'Locked' : 'Lock'}
          </ThemedText>
        )}
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
  const [targets, setTargets] = useState<Record<number, GearItem | null>>({});
  // What each wheel is showing at rest. It changes only when that wheel lands, so a spin never flashes its result first.
  const [landed, setLanded] = useState<Record<number, GearItem | null>>({});
  const targetsRef = useRef<Record<number, GearItem | null>>({});
  const [why, setWhy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pending = useRef(new Set<number>());
  const picksRef = useRef<SpinPick[]>([]);
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
      if (!locked && chosen && index < visibleCount) moving.push(s.slotIndex);
    });
    pending.current = new Set(moving);
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

    // Sounds: ticks while turning, slowing as the last wheel eases to a stop.
    const longest = BASE_MS + Math.max(0, slots.findIndex((s) => s.slotIndex === moving[moving.length - 1])) * STAGGER_MS;
    startSpinSound();
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(slowSound, Math.max(0, longest - SLOW_MS))];
  }, [phase, spinStyle, items.length, slots, lockedBySlot, candidates, visibleCount, finish]);

  const settled = useCallback(
    (slotIndex: number) => {
      setLanded((prev) => ({ ...prev, [slotIndex]: targetsRef.current[slotIndex] ?? null }));
      pending.current.delete(slotIndex);
      if (pending.current.size === 0) {
        landSound();
        void finish();
      } else {
        stopSound();
      }
    },
    [finish],
  );

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
              durationMs={BASE_MS + i * STAGGER_MS}
              rowHeight={rowHeight}
              wide={landscape}
              busy={busy}
              onSettled={settled}
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
  line: { position: 'absolute', left: 0, right: 0, height: 1.5, opacity: 0.9 },
  pointer: { position: 'absolute', width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  pointerL: { left: 0, borderLeftWidth: 9 },
  pointerR: { right: 0, borderRightWidth: 9 },
  row: { alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingHorizontal: 14 },
  rowWide: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: 16 },
  nameWide: { flex: 1 },
  dim: { opacity: 0.45, transform: [{ scale: 0.86 }] },
  shade: { position: 'absolute', left: 0, right: 0 },
  lock: { flexDirection: 'row', gap: Spacing.one, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  center: { textAlign: 'center' },
  tiny: { fontSize: 10, lineHeight: 12, letterSpacing: 0.6 },
  order: { marginBottom: -Spacing.one },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, borderRadius: Radius.pill, borderWidth: 1 },
  chipText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  why: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth },
});
