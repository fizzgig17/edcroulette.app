import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useUpdate } from '@/lib/update-context';

const H = 48;

/** A grey capsule that slides down from the top when a newer version is out. Update opens the store; × hides it until a newer build comes out. */
export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const { bannerVisible, openStore, dismissBanner } = useUpdate();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!bannerVisible) {
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [bannerVisible, fade]);
  // Not drawn at all unless there is an update: a hidden banner must never sit over the screen and catch touches.
  if (!bannerVisible) return null;
  const top = insets.top + Spacing.two;
  const store = Platform.OS === 'ios' ? 'TestFlight' : 'Google Play';
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top, opacity: fade }]}>
      <View style={styles.capsule} accessibilityRole="alert">
        <ThemedText type="smallBold" style={styles.text} numberOfLines={1}>
          Update available
        </ThemedText>
        <Pressable onPress={() => void openStore()} accessibilityRole="button" accessibilityLabel={`Open ${store} to update`} style={styles.action}>
          <ThemedText type="smallBold" style={styles.actionText}>
            Update
          </ThemedText>
        </Pressable>
        <Pressable onPress={dismissBanner} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.close}>
          <ThemedText style={styles.closeText}>×</ThemedText>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 40, zIndex: 1000, elevation: 20 },
  capsule: { height: H, maxWidth: 420, width: '100%', borderRadius: H / 2, backgroundColor: 'rgba(46, 48, 54, 0.95)', flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 6, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  text: { flex: 1, color: '#FFFFFF' },
  action: { backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, minHeight: 36, justifyContent: 'center', marginLeft: 8 },
  actionText: { color: '#1B1D22' },
  close: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: 'rgba(255,255,255,0.6)', fontSize: 24, lineHeight: 26 },
});
