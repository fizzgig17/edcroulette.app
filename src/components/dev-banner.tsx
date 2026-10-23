import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { IS_DEV_BUILD } from '@/lib/env';

const BUILD = Constants.expoConfig?.ios?.buildNumber;

/**
 * Orange strip across the top of every screen in the dev build so nobody
 * mistakes it for the real app. It also covers the status-bar area, so screens
 * below it skip their own top inset (see Screen).
 */
export function DevBanner() {
  const insets = useSafeAreaInsets();
  if (!IS_DEV_BUILD) return null;
  return (
    <View accessibilityRole="header" accessibilityLabel="Development build" style={[styles.bar, { paddingTop: insets.top + 2 }]}>
      <ThemedText type="smallBold" style={styles.text}>
        DEV BUILD{BUILD ? ` ${BUILD}` : ''} · test data, not the real app
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#F59E0B', alignItems: 'center', paddingBottom: 3 },
  text: { color: '#1C2027', fontSize: 12, lineHeight: 16 },
});
