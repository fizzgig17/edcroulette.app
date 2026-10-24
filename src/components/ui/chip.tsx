import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { select } from '@/lib/haptics';

export function Chip({ label, selected, onPress, small }: { label: string; selected: boolean; onPress: () => void; small?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        select();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        { backgroundColor: selected ? theme.accent : theme.backgroundElement, borderColor: selected ? theme.accent : theme.border },
        pressed && { opacity: 0.75 },
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text, fontSize: small ? 13 : 14 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A wrapping row of chips where one (or none, if `allowNone`) is selected. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  allowNone = false,
  scroll = false,
  small = false,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  allowNone?: boolean;
  scroll?: boolean;
  small?: boolean;
}) {
  const chips = options.map((o) => (
    <Chip key={o} small={small} label={o} selected={value === o} onPress={() => onChange(value === o && allowNone ? null : o)} />
  ));
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="radiogroup">
        {chips}
      </ScrollView>
    );
  }
  return (
    <View style={[styles.row, styles.wrap]} accessibilityRole="radiogroup">
      {chips}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: Spacing.three, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  chipSmall: { paddingHorizontal: 12, paddingVertical: 5 },
  row: { flexDirection: 'row', gap: Spacing.two },
  wrap: { flexWrap: 'wrap' },
});
