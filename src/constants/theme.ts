import { Platform } from 'react-native';

/**
 * Palette drawn from everyday-carry materials: gunmetal, bead-blasted steel
 * and brass/copper. Amber is the accent (the roulette payline).
 */
export const Colors = {
  light: {
    text: '#1C2027', // gunmetal
    background: '#F4F5F7',
    backgroundElement: '#E6E8EC',
    backgroundSelected: '#D6DAE0',
    surface: '#FFFFFF',
    border: '#DCE0E6',
    textSecondary: '#5C6470',
    accent: '#B8701C', // brass, dark enough for text on light backgrounds
    accentSoft: '#F6E7D2',
    onAccent: '#FFFFFF',
    reel: '#1E2229',
    reelText: '#EEF0F3',
    danger: '#C2410C',
    surfaceTop: '#FFFFFF',
    surfaceBottom: '#F0F2F5',
    brassHi: '#E8B15A',
    brassLo: '#9A5A12',
    metalHi: '#C9CED6',
    metalLo: '#6E7681',
    shadow: '#1C2027',
  },
  dark: {
    text: '#EEF0F3',
    background: '#121418',
    backgroundElement: '#1E2229',
    backgroundSelected: '#2A3039',
    surface: '#1A1D23',
    border: '#2C323B',
    textSecondary: '#A2AAB5',
    accent: '#E8A33D', // amber payline
    accentSoft: '#3A2C17',
    onAccent: '#16191E',
    reel: '#0D0F12',
    reelText: '#EEF0F3',
    danger: '#F97316',
    surfaceTop: '#232831',
    surfaceBottom: '#171A20',
    brassHi: '#F5C46B',
    brassLo: '#A8680F',
    metalHi: '#5A626D',
    metalLo: '#2A2F37',
    shadow: '#000000',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    rounded: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { small: 8, medium: 12, large: 18, pill: 999 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = Platform.OS === 'web' ? 960 : 800;
/** Reading pages (policies) stay narrower so lines stay short. */
export const ReadableWidth = 720;

/** A soft lift off the page. Pass the theme's `shadow` color. */
export const lift = (color: string, level: 1 | 2 | 3 = 1) =>
  ({
    shadowColor: color,
    shadowOpacity: [0, 0.1, 0.18, 0.28][level],
    shadowRadius: [0, 8, 16, 24][level],
    shadowOffset: { width: 0, height: [0, 2, 6, 10][level] },
    elevation: [0, 2, 5, 9][level],
  }) as const;
