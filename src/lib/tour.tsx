/**
 * The first-run tour: a dimmed screen with a spotlight on the real wheels, Spin button and
 * today's carry, plus a short tip for each part of the app. Screens register what can be
 * pointed at with `useTourTarget`; the overlay itself is in src/components/tour.tsx.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { View } from 'react-native';

export type TourTargetId = 'wheels' | 'spin' | 'kit' | 'tab-collection' | 'tab-settings';

type Ctx = {
  active: boolean;
  start: () => void;
  stop: () => void;
  /** Where a target is on screen right now (window coordinates), or null if it isn't showing. */
  measure: (id: TourTargetId) => Promise<{ x: number; y: number; width: number; height: number } | null>;
  register: (id: TourTargetId, ref: RefObject<View | null>) => () => void;
  /** Something the tour may be waiting for just happened (a tab was tapped). */
  signal: (name: string) => void;
  event: { name: string; n: number };
};

const noop = () => {};
const TourContext = createContext<Ctx>({ active: false, start: noop, stop: noop, measure: async () => null, register: () => noop, signal: noop, event: { name: '', n: 0 } });

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const targets = useRef(new Map<TourTargetId, RefObject<View | null>>());
  const register = useCallback((id: TourTargetId, ref: RefObject<View | null>) => {
    targets.current.set(id, ref);
    return () => {
      if (targets.current.get(id) === ref) targets.current.delete(id);
    };
  }, []);
  const measure = useCallback(
    (id: TourTargetId) =>
      new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
        const node = targets.current.get(id)?.current;
        if (!node) return resolve(null);
        node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
      }),
    [],
  );
  const [event, setEvent] = useState({ name: '', n: 0 });
  const signal = useCallback((name: string) => setEvent((e) => ({ name, n: e.n + 1 })), []);
  const value = useMemo(() => ({ active, start: () => setActive(true), stop: () => setActive(false), measure, register, signal, event }), [active, measure, register, signal, event]);
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export const useTour = () => useContext(TourContext);

/** Mark a view as something the tour can point at: put the returned ref on it. */
export function useTourTarget(id?: TourTargetId) {
  const ref = useRef<View>(null);
  const { register } = useTour();
  useEffect(() => (id ? register(id, ref) : undefined), [id, register]);
  return ref;
}
