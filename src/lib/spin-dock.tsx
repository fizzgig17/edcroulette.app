/**
 * Lets the Spin screen hand its spin action to the button docked in the tab bar.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { SpinControl } from '@/components/roulette-spinner';

type Ctx = {
  control: SpinControl | null;
  setControl: (c: SpinControl | null) => void;
  /** Changes each time the Spin button is pressed; the Spin screen scrolls to the top when it does. */
  topSignal: number;
  scrollToTop: () => void;
};
const DockContext = createContext<Ctx>({ control: null, setControl: () => {}, topSignal: 0, scrollToTop: () => {} });

export function SpinDockProvider({ children }: { children: ReactNode }) {
  const [control, setControl] = useState<SpinControl | null>(null);
  const [topSignal, setTopSignal] = useState(0);
  const value = useMemo(() => ({ control, setControl, topSignal, scrollToTop: () => setTopSignal((n) => n + 1) }), [control, topSignal]);
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

export const useSpinDock = () => useContext(DockContext);

/** Pulling the Spin page down spins the wheels (never while they are already turning, or when there is nothing to spin). */
export function usePullSpin() {
  const { control } = useSpinDock();
  return useCallback(() => {
    if (control && !control.disabled && !control.busy) control.onPress();
  }, [control]);
}
