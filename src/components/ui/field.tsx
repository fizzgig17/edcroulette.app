import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { lift, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReveal } from '@/lib/reveal';

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
  const [focused, setFocused] = useState(false);
  const box = useRef<TextInput>(null);
  const reveal = useReveal();
  return (
    <TextInput
      ref={box}
      placeholderTextColor={theme.textSecondary}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        // Scroll so this box sits just above the keyboard.
        if (reveal && box.current) reveal(box.current as unknown as View);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }, focused && { borderColor: theme.accent, borderWidth: 2, paddingHorizontal: Spacing.three - 1 }, props.style]}
    />
  );
}

/** A rounded card that groups related rows. */
export function Card({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.lift, lift(theme.shadow, 1)]}>
      <LinearGradient colors={[theme.surfaceTop, theme.surfaceBottom]} style={[styles.card, padded && styles.padded, { borderColor: theme.border }]}>
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.two },
  input: { minHeight: 46, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three, fontSize: 16 },
  lift: { borderRadius: Radius.large },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.large, overflow: 'hidden' },
  padded: { padding: Spacing.three, gap: Spacing.three },
});
