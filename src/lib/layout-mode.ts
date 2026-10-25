import { Platform, useWindowDimensions } from 'react-native';

/**
 * What kind of window the app has. `big` is anything with a short side of 600 or more:
 * an open foldable, a tablet, an iPad. A folded phone, and a split iPad window that is
 * narrow, count as a phone. `dashboard` is the iPad's layout, where Spin, Collection and
 * Settings share one screen.
 */
export function useLayoutMode() {
  const { width, height } = useWindowDimensions();
  const big = Math.min(width, height) >= 600;
  const pad = Platform.OS === 'ios' && Platform.isPad;
  return { width, height, landscape: width > height, big, dashboard: big && pad };
}
