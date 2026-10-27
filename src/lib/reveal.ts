import { createContext, useContext } from 'react';
import type { View } from 'react-native';

/** Given by a scrolling screen: scrolls so the box being typed in sits just above the keyboard. Null where there's nothing to scroll (a pop-up). */
export const RevealContext = createContext<((target: View) => void) | null>(null);
export const useReveal = () => useContext(RevealContext);
