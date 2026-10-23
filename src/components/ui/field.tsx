import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A labelled form row. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="caption" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }, props.style]}
    />
  );
}

/** A rounded card that groups related rows. */
export function Card({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const theme = useTheme();
  return <View style={[styles.card, padded && styles.padded, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  field: { gap: Spacing.two },
  input: { minHeight: 46, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three, fontSize: 16 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.large, overflow: 'hidden' },
  padded: { padding: Spacing.three, gap: Spacing.three },
});
