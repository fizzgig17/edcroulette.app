/**
 * Wheel lab only (see run.mjs): the real wheel grid on a bare page, so a browser can drive it.
 * Copied into src/app for the test run and removed afterwards; it never ships.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RouletteSpinner, type SpinControl } from '@/components/roulette-spinner';
import { GearProvider } from '@/lib/gear';
import { TourProvider } from '@/lib/tour';

export default function WheelLab() {
  const [control, setControl] = useState<SpinControl | null>(null);
  // The website is pre-rendered; draw the wheels in the browser only, so sizes come from the real window.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#F4F5F7' }}>
      <TourProvider>
        <GearProvider>
          <View style={{ flex: 1, padding: 16, gap: 16, maxWidth: Number(new URLSearchParams(window.location.search).get('w')) || 800, width: '100%', alignSelf: 'center' }}>
            <RouletteSpinner onControl={setControl} />
            <Pressable testID="spin" onPress={() => control?.onPress()} accessibilityRole="button" accessibilityLabel="Spin" style={{ alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 32, backgroundColor: '#444' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{control?.label ?? 'Spin'}</Text>
            </Pressable>
          </View>
        </GearProvider>
      </TourProvider>
    </GestureHandlerRootView>
  );
}
