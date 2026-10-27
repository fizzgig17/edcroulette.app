import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { RevealContext } from '@/lib/reveal';

/** A one-line box showing the chosen value; tapping it opens a PickSheet to choose from. */
export function PickRow({ value, placeholder = 'Choose', onPress, swatch, label }: { value: string | null | undefined; placeholder?: string; onPress: () => void; swatch?: string | null; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value || 'not set'}. Tap to change`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundElement : theme.surface, borderColor: theme.border }]}>
      {swatch ? <View style={[styles.dot, { backgroundColor: swatch, borderColor: theme.border }]} /> : null}
      <ThemedText numberOfLines={1} style={[styles.value, { color: value ? theme.text : theme.textSecondary }]}>
        {value || placeholder}
      </ThemedText>
      <Icon name="down" size={14} color={theme.textSecondary} />
    </Pressable>
  );
}

/** A sheet that slides up over the screen with the choices in it. */
export function PickSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The page behind scrolls for its own boxes, not this sheet's. */}
      <RevealContext.Provider value={null}>
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Close ${title}`} />
          <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: insets.bottom + Spacing.three }]}>
            <View style={styles.head}>
              <ThemedText type="smallBold" accessibilityRole="header">
                {title}
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
                <ThemedText type="smallBold" style={{ color: theme.accent, fontSize: 16 }}>
                  Done
                </ThemedText>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: height * 0.6 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </RevealContext.Provider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three },
  value: { flex: 1, fontSize: 16 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth },
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { gap: Spacing.three, paddingBottom: Spacing.two },
});
