import { createContext, useContext, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Set when a screen is drawn inside a pane of the iPad dashboard rather than on a page of its
 * own: the screen then skips its own scrolling and safe-area handling, and sizes itself to the
 * pane's width instead of the window's.
 */
export const PaneContext = createContext<{ width: number; setOverlay: (node: ReactNode) => void; setScrollEnabled: (on: boolean) => void } | null>(null);

export const usePane = () => useContext(PaneContext);
export const useEmbedded = () => useContext(PaneContext) !== null;

/** The width this screen has to work with: its pane, or the whole window. */
export function useContentWidth(): number {
  const pane = useContext(PaneContext);
  const { width } = useWindowDimensions();
  return pane ? pane.width : width;
}
