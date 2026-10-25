import { useSyncExternalStore } from 'react';

/** Holds the page still while something on it is being rearranged by dragging. */
let locked = false;
const listeners = new Set<() => void>();

export function setScrollLocked(value: boolean) {
  if (locked === value) return;
  locked = value;
  listeners.forEach((l) => l());
}

export function useScrollLocked(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => locked,
    () => false,
  );
}
