import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useThemePref } from '@/lib/theme-preference';

/** The colors to show: the person's choice (see Settings), else the phone's. */
export function useColorScheme(): 'light' | 'dark' {
  const system = useSystemColorScheme();
  const pref = useThemePref();
  const scheme = pref === 'system' ? system : pref;
  return scheme === 'dark' ? 'dark' : 'light';
}
