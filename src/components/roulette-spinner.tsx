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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DragReorder } from '@/components/drag-reorder';
import { GearThumb } from '@/components/gear-thumb';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ensureAiConsent } from '@/lib/ai-consent';
import { pickCoordinated } from '@/lib/api';
import { useGear } from '@/lib/gear';
import { select, success } from '@/lib/haptics';
import { PORTRAIT_WHEELS } from '@/lib/limits';
import { useSpinStyle } from '@/lib/preferences';
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
  // The pieces and their scroll position live in one state value, so a new strip
  // always arrives with a fresh position (resetting them separately could leave
  // the window scrolled past a short strip, which showed as a blank wheel).
  const [reel, setReel] = useState<{ strip: (GearItem | null)[]; y: Animated.Value; go: number }>(() => ({
    strip: idleStrip(candidates, shown),
    y: new Animated.Value(0),
    go: 0,
  }));
  const { strip, y } = reel;
  const lastToken = useRef(spinToken);
  const animating = useRef(false);
  const stopAtRef = useRef(0);

  // Follow collection and lock changes while standing still.
  useEffect(() => {
    if (!animating.current && lastToken.current === spinToken) {
      setReel({ strip: idleStrip(candidates, shown), y: new Animated.Value(0), go: 0 });
    }
  }, [candidates, shown, spinToken]);

  // Run the turn once the new strip is on screen.
  useEffect(() => {
    if (!reel.go) return;
    const anim = Animated.timing(reel.y, {
      toValue: -(stopAtRef.current - 1) * rowHeight,
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
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
    s.push(target, neighbour(candidates, target, 1));
    stopAtRef.current = s.length - 2;
    animating.current = true;
    // The strip stays where it stops; the next change swaps in a fresh one.
    setReel((r) => ({ strip: s, y: new Animated.Value(0), go: r.go + 1 }));
    return undefined;
    // Only a new token starts a spin; everything else is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  const isLocked = !!locked;
  const canLock = !busy && (isLocked || !!shown);
  const fade = theme.reel + 'B3';
  const thumb = Math.round(rowHeight * (wide ? 0.6 : 0.4));

  return (
    <View style={styles.reelCol}>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.center}>
        {slot.category}
      </ThemedText>
      <View
        style={[styles.window, { height: rowHeight * VISIBLE_ROWS, backgroundColor: theme.reel, borderColor: isLocked ? theme.accent : theme.border }]}
        accessibilityLabel={`${slot.category} wheel: ${shown?.name ?? 'empty'}${isLocked ? ', locked' : ''}`}>
        <Animated.View style={{ transform: [{ translateY: y }] }}>
          {strip.map((item, i) => (
            <View key={i} style={[styles.row, { height: rowHeight }, wide && styles.rowWide, strip.length <= 3 && i !== 1 && styles.dim]}>
              {item ? (
                <>
                  <GearThumb item={item} size={thumb} />
                  <ThemedText
                    numberOfLines={2}
                    style={[wide ? styles.nameWide : styles.center, { color: theme.reelText, fontSize: wide ? 13 : 14, lineHeight: wide ? 16 : 18, fontWeight: '600' }]}>
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
        {/* Soft fade above and below, and the line the pieces land on. */}
        <View pointerEvents="none" style={[styles.shade, { top: 0, height: rowHeight * 0.8, backgroundColor: fade }]} />
        <View pointerEvents="none" style={[styles.shade, { bottom: 0, height: rowHeight * 0.8, backgroundColor: fade }]} />
        <View pointerEvents="none" style={[styles.payline, { top: rowHeight, height: rowHeight, borderColor: theme.accent }]} />
      </View>
      <Pressable
        onPress={() => onToggleLock(slot.slotIndex, isLocked ? null : shown)}
        disabled={!canLock}
        accessibilityRole="button"
        accessibilityLabel={isLocked ? `Unlock ${slot.category}` : `Lock ${shown?.name ?? slot.category}`}
        style={({ pressed }) => [styles.lock, { backgroundColor: isLocked ? theme.accent : theme.backgroundElement }, !canLock && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
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
// The order strip: drag a wheel's grip to move it
// ---------------------------------------------------------------------------
function WheelOrder({ slots, visibleCount, disabled }: { slots: SlotConfig[]; visibleCount: number; disabled: boolean }) {
  const theme = useTheme();
  const { saveSlots } = useGear();
  return (
    <View style={[styles.order, disabled && { opacity: 0.5 }]} pointerEvents={disabled ? 'none' : 'auto'}>
      <DragReorder
        items={slots}
        keyOf={(s) => String(s.slotIndex)}
        direction="row"
        itemSize={44}
        gap={6}
        onReorder={(next) => void saveSlots(next.map((s) => ({ category: s.category, lockedItemId: s.lockedItemId, from: s.slotIndex })))}
        renderItem={(s, i, grip) => {
          const onScreen = i < visibleCount;
          return (
            <View
              {...grip}
              accessibilityRole="adjustable"
              accessibilityLabel={`Wheel ${i + 1}, ${s.category}. Drag to reorder.`}
              style={[styles.chip, { backgroundColor: onScreen ? theme.backgroundElement : 'transparent', borderColor: onScreen ? theme.border : theme.textSecondary, borderStyle: onScreen ? 'solid' : 'dashed' }]}>
              <Icon name="grip" size={12} color={theme.textSecondary} />
              <ThemedText type="small" numberOfLines={1} style={[styles.chipText, { color: onScreen ? theme.text : theme.textSecondary }]}>
                {slots.length > 4 ? String(i + 1) : s.category}
              </ThemedText>
            </View>
          );
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The wheels
// ---------------------------------------------------------------------------
export function RouletteSpinner() {
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
  useEffect(() => setTargets({}), [slotSig]);

  const finish = useCallback(async () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
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

  return (
    <View style={styles.machine}>
      {slots.length > 1 ? <WheelOrder slots={slots} visibleCount={visibleCount} disabled={busy} /> : null}
      {hiddenCount > 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {hiddenCount === 1 ? 'The last wheel picks' : `The last ${hiddenCount} wheels pick`} without turning in portrait. Turn your phone sideways to see them all.
        </ThemedText>
      ) : null}

      <View style={styles.reels}>
        {slots.slice(0, visibleCount).map((s, i) => {
          const locked = lockedBySlot.get(s.slotIndex) ?? null;
          const list = candidates.get(s.slotIndex) ?? [];
          const shown = locked ?? targets[s.slotIndex] ?? restingFromLastSpin.get(s.slotIndex) ?? list[0] ?? null;
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

      <Button
        big
        icon={spinStyle === 'coordinated' ? 'sparkle' : 'spin'}
        label={phase === 'choosing' ? 'Choosing a set…' : phase === 'spinning' ? 'Spinning…' : allLocked ? 'All wheels locked' : spinStyle === 'coordinated' ? 'Spin a matching set' : 'Spin'}
        onPress={() => void spin()}
        disabled={empty || busy}
      />
      {why && phase === 'done' ? (
        <View style={[styles.why, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
          <Icon name="sparkle" size={14} color={theme.accent} />
          <ThemedText type="small" style={styles.flex}>
            {why}
          </ThemedText>
        </View>
      ) : null}
      {note && !busy ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {note}
        </ThemedText>
      ) : null}
      {empty ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
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
  window: { borderRadius: Radius.medium, borderWidth: 1.5, overflow: 'hidden' },
  row: { alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingHorizontal: Spacing.one },
  rowWide: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.two },
  nameWide: { flex: 1 },
  dim: { opacity: 0.4 },
  shade: { position: 'absolute', left: 0, right: 0 },
  payline: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1.5, borderBottomWidth: 1.5 },
  lock: { flexDirection: 'row', gap: Spacing.one, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: Radius.pill },
  center: { textAlign: 'center' },
  order: { marginBottom: -Spacing.one },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, borderRadius: Radius.pill, borderWidth: 1 },
  chipText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  why: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth },
});
