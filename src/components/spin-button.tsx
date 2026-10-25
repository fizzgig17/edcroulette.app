import { router, usePathname } from 'expo-router';
import { Pressable } from 'react-native';

import { DiscLabel, MetalDisc } from '@/components/metal-button';
import { tap } from '@/lib/haptics';
import { useSpinDock } from '@/lib/spin-dock';

/**
 * The round metal Spin button. Docked in the tab bar on phones; on bigger windows it sits just
 * under the wheels instead (`inline`), where it can't be missed.
 */
export function SpinButton({ size = 84, inline }: { size?: number; inline?: boolean }) {
  const { control, scrollToTop } = useSpinDock();
  const pathname = usePathname();
  const onSpinTab = inline || pathname === '/' || pathname === '/index';
  const off = !control || control.disabled || control.busy;
  return (
    <Pressable
      disabled={off}
      onPress={() => {
        tap();
        if (!onSpinTab) router.navigate('/');
        if (!inline) scrollToTop();
        control?.onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={control?.label ?? 'Spin'}
      accessibilityState={{ disabled: off, busy: !!control?.busy }}
      style={({ pressed }) => [off && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.96 }] }]}>
      <MetalDisc size={size} turning={!!control?.busy}>
        <DiscLabel icon={control?.icon === 'sparkle' ? 'sparkle' : undefined} label="Spin" size={size} />
      </MetalDisc>
    </Pressable>
  );
}
