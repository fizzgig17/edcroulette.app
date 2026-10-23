/**
 * The slot machine: one vertical reel per slot. Reels whose slot is locked
 * never spin and always land on the locked item. Unlocked reels pick a random
 * item from that slot's category, spin through a shuffled strip and stop left
 * to right. When the last one stops, the picks are recorded as today's carry.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { GearThumb } from '@/components/gear-thumb';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { select, success } from '@/lib/haptics';
import type { GearItem, SlotConfig, SpinPick } from '@/types/models';

const ROW = 84;
const VISIBLE_ROWS = 3; // one above the payline, the payline, one below
const LOOPS = 4; // passes over the category per spin
const BASE_MS = 1500;
const STAGGER_MS = 420;

type Phase = 'idle' | 'spinning' | 'done';

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
// One reel
// ---------------------------------------------------------------------------
function Reel({
  slot,
  candidates,
  locked,
  shown,
  target,
  spinToken,
  durationMs,
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
  busy: boolean;
  onSettled: (slotIndex: number) => void;
  onToggleLock: (slotIndex: number, item: GearItem | null) => void;
}) {
  const theme = useTheme();
  const y = useRef(new Animated.Value(0)).current;
  const [strip, setStrip] = useState<(GearItem | null)[]>(() => idleStrip(candidates, shown));
  const lastToken = useRef(spinToken);
  const animating = useRef(false);

  // Follow collection and lock changes while standing still.
  useEffect(() => {
    if (!animating.current && lastToken.current === spinToken) {
      setStrip(idleStrip(candidates, shown));
      y.setValue(0);
    }
  }, [candidates, shown, spinToken, y]);

  useEffect(() => {
    if (lastToken.current === spinToken) return;
    lastToken.current = spinToken;
    if (locked || !target || candidates.length === 0) return;

    const s: (GearItem | null)[] = idleStrip(candidates, shown);
    for (let i = 0; i < LOOPS; i += 1) s.push(...shuffle(candidates));
    s.push(target, neighbour(candidates, target, 1));
    const stopAt = s.length - 2;
    setStrip(s);
    y.setValue(0);
    animating.current = true;

    const anim = Animated.timing(y, {
      toValue: -(stopAt - 1) * ROW,
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      animating.current = false;
      setStrip(idleStrip(candidates, target));
      y.setValue(0);
      if (finished) {
        select();
        onSettled(slot.slotIndex);
      }
    });
    return () => anim.stop();
    // Only a new token starts a spin; everything else is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  const isLocked = !!locked;
  const canLock = !busy && (isLocked || !!shown);

  return (
    <View style={styles.reelCol}>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.center}>
        {slot.category}
      </ThemedText>
      <View
        style={[styles.window, { backgroundColor: theme.reel, borderColor: isLocked ? theme.accent : theme.border }]}
        accessibilityLabel={`${slot.category} reel: ${shown?.name ?? 'empty'}${isLocked ? ', locked' : ''}`}>
        <Animated.View style={{ transform: [{ translateY: y }] }}>
          {strip.map((item, i) => (
            <View key={i} style={[styles.row, strip.length <= 3 && i !== 1 && styles.dim]}>
              {item ? (
                <>
                  <GearThumb item={item} size={38} />
                  <ThemedText type="small" numberOfLines={2} style={[styles.center, { color: theme.reelText, fontSize: 12, lineHeight: 15 }]}>
                    {item.name}
                  </ThemedText>
                </>
              ) : (
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  —
                </ThemedText>
              )}
            </View>
          ))}
        </Animated.View>
        <View pointerEvents="none" style={[styles.payline, { borderColor: theme.accent }]} />
      </View>
      <Pressable
        onPress={() => onToggleLock(slot.slotIndex, isLocked ? null : shown)}
        disabled={!canLock}
        accessibilityRole="button"
        accessibilityLabel={isLocked ? `Unlock ${slot.category}` : `Lock ${shown?.name ?? slot.category}`}
        style={({ pressed }) => [
          styles.lock,
          { backgroundColor: isLocked ? theme.accent : theme.backgroundElement },
          !canLock && { opacity: 0.4 },
          pressed && { opacity: 0.7 },
        ]}>
        <Icon name={isLocked ? 'lock' : 'unlock'} size={14} color={isLocked ? theme.onAccent : theme.text} />
        <ThemedText type="smallBold" style={{ color: isLocked ? theme.onAccent : theme.text, fontSize: 12 }}>
          {isLocked ? 'Locked' : 'Lock'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------
export function RouletteSpinner() {
  const theme = useTheme();
  const { items, slots, itemById, setLock, recordSpin, lastSpin } = useGear();

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

  // What each reel shows at rest: its lock, else the last spin's pick, else the first item.
  const restingFromLastSpin = useMemo(() => {
    const m = new Map<number, GearItem | null>();
    for (const p of lastSpin?.picks ?? []) m.set(p.slotIndex, itemById(p.itemId));
    return m;
  }, [lastSpin, itemById]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [token, setToken] = useState(0);
  const [targets, setTargets] = useState<Record<number, GearItem | null>>({});
  const pending = useRef(new Set<number>());
  const picksRef = useRef<SpinPick[]>([]);

  const finish = useCallback(async () => {
    setPhase('done');
    success();
    await recordSpin(picksRef.current);
  }, [recordSpin]);

  const spin = useCallback(() => {
    if (phase === 'spinning') return;
    const next: Record<number, GearItem | null> = {};
    const picks: SpinPick[] = [];
    const moving = new Set<number>();
    for (const s of slots) {
      const locked = lockedBySlot.get(s.slotIndex) ?? null;
      const chosen = locked ?? pickRandom(candidates.get(s.slotIndex) ?? []);
      next[s.slotIndex] = chosen;
      picks.push({ slotIndex: s.slotIndex, category: s.category, itemId: chosen?.id ?? null, locked: !!locked });
      if (!locked && chosen) moving.add(s.slotIndex);
    }
    pending.current = moving;
    picksRef.current = picks;
    setTargets(next);
    if (moving.size === 0) {
      void finish();
      return;
    }
    setPhase('spinning');
    setToken((t) => t + 1);
  }, [phase, slots, lockedBySlot, candidates, finish]);

  const settled = useCallback(
    (slotIndex: number) => {
      pending.current.delete(slotIndex);
      if (pending.current.size === 0) void finish();
    },
    [finish],
  );

  const toggleLock = useCallback((slotIndex: number, item: GearItem | null) => void setLock(slotIndex, item?.id ?? null), [setLock]);

  const allLocked = slots.length > 0 && slots.every((s) => lockedBySlot.get(s.slotIndex));
  const empty = items.length === 0;

  return (
    <View style={styles.machine}>
      <View style={[styles.cabinet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.reels}>
          {slots.map((s, i) => {
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
                busy={phase === 'spinning'}
                onSettled={settled}
                onToggleLock={toggleLock}
              />
            );
          })}
        </View>
      </View>
      <Button
        big
        icon="spin"
        label={phase === 'spinning' ? 'Spinning…' : allLocked ? 'All slots locked' : 'Spin'}
        onPress={spin}
        disabled={empty || phase === 'spinning'}
      />
      {empty ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Add some gear to your collection to start spinning.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  machine: { gap: Spacing.three },
  cabinet: { borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
  reels: { flexDirection: 'row', gap: Spacing.two },
  reelCol: { flex: 1, gap: Spacing.two, alignItems: 'stretch' },
  window: { height: ROW * VISIBLE_ROWS, borderRadius: Radius.medium, borderWidth: 2, overflow: 'hidden' },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingHorizontal: Spacing.one },
  dim: { opacity: 0.35 },
  payline: { position: 'absolute', left: 0, right: 0, top: ROW, height: ROW, borderTopWidth: 2, borderBottomWidth: 2 },
  lock: { flexDirection: 'row', gap: Spacing.one, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: Radius.small },
  center: { textAlign: 'center' },
});
