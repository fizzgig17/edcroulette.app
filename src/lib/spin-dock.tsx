/**
 * Lets the Spin screen hand its spin action to the button docked in the tab bar.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { SpinControl } from '@/components/roulette-spinner';

type Ctx = { control: SpinControl | null; setControl: (c: SpinControl | null) => void };
const DockContext = createContext<Ctx>({ control: null, setControl: () => {} });

export function SpinDockProvider({ children }: { children: ReactNode }) {
  const [control, setControl] = useState<SpinControl | null>(null);
  const value = useMemo(() => ({ control, setControl }), [control]);
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

export const useSpinDock = () => useContext(DockContext);
