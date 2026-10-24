/**
 * A short list the person can reorder by dragging each item's grip, in a row
 * (wheel order on the Spin screen) or a column (Settings). Built on React
 * Native's own Animated and PanResponder, so it needs no extra native modules.
 * Every item has the same size along the drag direction.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, type GestureResponderHandlers, type LayoutChangeEvent } from 'react-native';

import { select } from '@/lib/haptics';

export interface DragReorderProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  /** Row: items share the width equally. Column: each item is `itemSize` tall. */
  direction: 'row' | 'column';
  /** Height of an item (column) or of the whole row (row). */
  itemSize: number;
  gap?: number;
  /** Draws an item. Spread `grip` on the element the person drags. */
  renderItem: (item: T, index: number, grip: GestureResponderHandlers, dragging: boolean) => ReactNode;
  onReorder: (next: T[]) => void;
  /** Tells the screen a drag started or ended, so it can stop scrolling while an item is held. */
  onDragChange?: (dragging: boolean) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function DragReorder<T>({ items, keyOf, direction, itemSize, gap = 8, renderItem, onReorder, onDragChange }: DragReorderProps<T>) {
  const horizontal = direction === 'row';
  const [width, setWidth] = useState(0);
  const [order, setOrder] = useState(items);
  const [dragKey, setDragKey] = useState<string | null>(null);

  // Items are laid out along one axis: `step` apart, each `span` long.
  const count = items.length;
  const span = horizontal ? Math.max(0, (width - gap * (count - 1)) / Math.max(1, count)) : itemSize;
  const step = span + gap;

  const orderRef = useRef(order);
  const dragging = useRef<{ key: string; from: number; at: number } | null>(null);
  const anims = useRef(new Map<string, Animated.Value>()).current;
  const stepRef = useRef(step);
  stepRef.current = step;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onDragChangeRef = useRef(onDragChange);
  onDragChangeRef.current = onDragChange;

  const animOf = useCallback(
    (key: string, index: number) => {
      let v = anims.get(key);
      if (!v) {
        v = new Animated.Value(index * stepRef.current);
        anims.set(key, v);
      }
      return v;
    },
    [anims],
  );

  // Follow outside changes (settings saved, wheel added) unless a drag is in progress.
  const sig = items.map(keyOf).join('|');
  useEffect(() => {
    if (dragging.current) return;
    orderRef.current = items;
    setOrder(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Put every item at its slot (also when the width becomes known).
  useEffect(() => {
    if (dragging.current) return;
    order.forEach((it, i) => animOf(keyOf(it), i).setValue(i * step));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, step]);

  const settle = useCallback(
    (except?: string) => {
      orderRef.current.forEach((it, i) => {
        const k = keyOf(it);
        if (k !== except) Animated.timing(animOf(k, i), { toValue: i * stepRef.current, duration: 140, useNativeDriver: true }).start();
      });
    },
    [animOf, keyOf],
  );

  const makeGrip = useCallback(
    (key: string, index: number): GestureResponderHandlers => {
      const responder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const from = orderRef.current.findIndex((it) => keyOf(it) === key);
          dragging.current = { key, from, at: from };
          setDragKey(key);
          onDragChangeRef.current?.(true);
          select();
        },
        onPanResponderMove: (_e, g) => {
          const d = dragging.current;
          if (!d) return;
          const s = stepRef.current;
          const pos = clamp(d.from * s + (horizontal ? g.dx : g.dy), 0, (orderRef.current.length - 1) * s);
          animOf(d.key, d.from).setValue(pos);
          const target = clamp(Math.round(pos / s), 0, orderRef.current.length - 1);
          if (target !== d.at) {
            const next = [...orderRef.current];
            const [moved] = next.splice(d.at, 1);
            next.splice(target, 0, moved!);
            orderRef.current = next;
            d.at = target;
            select();
            settle(d.key);
          }
        },
        onPanResponderRelease: () => finish(),
        onPanResponderTerminate: () => finish(),
      });
      function finish() {
        const d = dragging.current;
        if (!d) return;
        Animated.timing(animOf(d.key, d.at), { toValue: d.at * stepRef.current, duration: 120, useNativeDriver: true }).start();
        dragging.current = null;
        setDragKey(null);
        onDragChangeRef.current?.(false);
        setOrder(orderRef.current);
        if (d.at !== d.from) onReorderRef.current(orderRef.current);
      }
      void index;
      return responder.panHandlers;
    },
    [animOf, horizontal, keyOf, settle],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    if (horizontal) setWidth(e.nativeEvent.layout.width);
  };

  const total = horizontal ? itemSize : Math.max(0, count * step - gap);
  const grips = useMemo(() => new Map<string, GestureResponderHandlers>(), []);

  return (
    <View onLayout={onLayout} style={{ height: total }}>
      {order.map((it, i) => {
        const key = keyOf(it);
        // One responder per item, made once so a drag survives re-renders.
        let grip = grips.get(key);
        if (!grip) {
          grip = makeGrip(key, i);
          grips.set(key, grip);
        }
        const v = animOf(key, i);
        const isDragging = dragKey === key;
        return (
          <Animated.View
            key={key}
            style={[
              styles.item,
              horizontal ? { width: span, height: itemSize } : { height: itemSize, left: 0, right: 0 },
              { transform: [horizontal ? { translateX: v } : { translateY: v }], zIndex: isDragging ? 10 : 0 },
              isDragging && styles.lifted,
            ]}>
            {renderItem(it, i, grip, isDragging)}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { position: 'absolute', top: 0, left: 0 },
  lifted: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8, opacity: 0.95 },
});
