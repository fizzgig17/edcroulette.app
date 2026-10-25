import { router, usePathname } from 'expo-router';
import { Pressable } from 'react-native';

import { DiscLabel, MetalDisc } from '@/components/metal-button';
import { tap } from '@/lib/haptics';
import { useSpinDock } from '@/lib/spin-dock';

/**
 * The round metal Spin button. Docked in the tab bar on phones; on bigger windows it sits just
 * under the wheels instead (`inline`), where it can't be missed.
 */
export function SpinButton({ size = 84, height, inline }: { size?: number; height?: number; inline?: boolean }) {
  const { control, scrollToTop } = useSpinDock();
  const pathname = usePathname();
  const onSpinTab = inline || pathname === '/' || pathname === '/index';
  const off = !control || control.disabled;
  return (
    <Pressable
      disabled={off}
      onPress={() => {
        tap();
        if (!onSpinTab) router.navigate('/');
        if (!inline && !control?.busy) scrollToTop();
        control?.onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={control?.label ?? 'Spin'}
      accessibilityState={{ disabled: off, busy: !!control?.busy }}
      style={({ pressed }) => [off && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.96 }] }]}>
      <MetalDisc size={size} height={height} turning={!!control?.busy}>
        <DiscLabel icon={height || control?.busy ? undefined : control?.icon === 'sparkle' ? 'sparkle' : undefined} label={control?.label ?? 'Spin'} size={height ?? size} plate={!!height} />
      </MetalDisc>
    </Pressable>
  );
}
