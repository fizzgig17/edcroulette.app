import { Platform, useWindowDimensions } from 'react-native';

/**
 * What kind of window the app has. `big` is anything with a short side of 600 or more:
 * an open foldable, a tablet, an iPad. A folded phone, and a split iPad window that is
 * narrow, count as a phone. `dashboard` is the layout where Spin, Collection and Settings
 * share one screen: every iPad, and any other big window that is clearly wider than tall or
 * taller than wide (an Android tablet, say). A big window that is close to square, like an
 * open foldable, keeps the three tabs.
 */
export function useLayoutMode() {
  const { width, height } = useWindowDimensions();
  const big = Math.min(width, height) >= 600;
  const pad = Platform.OS === 'ios' && Platform.isPad;
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  return { width, height, landscape: width > height, big, dashboard: big && (pad || ratio > 1.3) };
}
