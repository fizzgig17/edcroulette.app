import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useThemePref } from '@/lib/theme-preference';

/** Static rendering has no system preference, so the website starts dark and switches after loading. */
export function useColorScheme(): 'light' | 'dark' {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const system = useRNColorScheme();
  const pref = useThemePref();
  const scheme = (pref === 'system' ? system : pref) === 'light' ? 'light' : 'dark';

  useEffect(() => {
    // Lets the browser draw scrollbars and form controls to match.
    document.documentElement.style.colorScheme = scheme;
  }, [scheme]);

  return hydrated ? scheme : 'dark';
}
