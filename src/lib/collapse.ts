import { useSyncExternalStore } from 'react';

/** A counter that goes up each time the Settings sections should all fold shut (switching to Settings, pulling down). */
let tick = 0;
const listeners = new Set<() => void>();
export const requestCollapse = () => {
  tick += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useCollapseSignal = () => useSyncExternalStore(subscribe, () => tick, () => 0);
