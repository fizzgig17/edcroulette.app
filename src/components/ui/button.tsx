import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/constants/icons';
import { lift, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tap } from '@/lib/haptics';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  busy,
  big,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  big?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const bg = { primary: theme.accent, secondary: theme.backgroundElement, danger: 'transparent', ghost: 'transparent' }[variant];
  const fg = { primary: theme.onAccent, secondary: theme.text, danger: theme.danger, ghost: theme.accent }[variant];
  const off = disabled || busy;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [
        styles.base,
        big && styles.big,
        { backgroundColor: variant === 'primary' ? 'transparent' : bg },
        variant === 'primary' && !off && lift(theme.shadow, 2),
        variant === 'danger' && { borderWidth: 1, borderColor: theme.danger },
        off && styles.off,
        pressed && styles.pressed,
        Platform.OS === 'web' && ({ cursor: off ? 'default' : 'pointer' } as object),
        style,
      ]}>
      <View style={styles.row}>
        {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={big ? 22 : 18} color={fg} /> : null}
        <ThemedText type={big ? 'heading' : 'smallBold'} style={{ color: fg }}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.medium, justifyContent: 'center', alignItems: 'center' },
  big: { minHeight: 60, borderRadius: Radius.large },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
