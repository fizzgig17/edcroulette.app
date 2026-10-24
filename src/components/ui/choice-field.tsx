import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/field';
import { Spacing } from '@/constants/theme';

/**
 * One value out of a list, shown as small wrapping chips (no scrolling), with a
 * "+ Other" chip for anything not on the list. Suggestions (what a photo
 * suggested, say) get their own row and are left out of the full list below it.
 */
export function ChoiceField({
  options,
  value,
  onChange,
  suggestions = [],
  suggestionsLabel = 'From your photo',
  otherPlaceholder = 'Type your own',
  maxLength = 40,
}: {
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
  suggestions?: string[];
  suggestionsLabel?: string;
  otherPlaceholder?: string;
  maxLength?: number;
}) {
  const [typing, setTyping] = useState(false);
  const listed = options.filter((o) => !suggestions.includes(o));
  const custom = value && !options.includes(value) ? value : null;

  return (
    <View style={styles.wrap}>
      {suggestions.length > 1 ? (
        <View style={styles.group}>
          <ThemedText type="caption" themeColor="textSecondary">
            {suggestionsLabel}
          </ThemedText>
          <View style={styles.row}>
            {suggestions.map((s) => (
              <Chip key={s} small label={s} selected={value === s} onPress={() => onChange(value === s ? null : s)} />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.row} accessibilityRole="radiogroup">
        {listed.map((o) => (
          <Chip key={o} small label={o} selected={value === o} onPress={() => onChange(value === o ? null : o)} />
        ))}
        {custom && !typing ? <Chip small label={custom} selected onPress={() => onChange(null)} /> : null}
        <Chip small label="+ Other" selected={typing} onPress={() => setTyping((t) => !t)} />
      </View>
      {typing ? (
        <Input
          autoFocus
          defaultValue={custom ?? ''}
          onChangeText={(t) => onChange(t.trim() || null)}
          onSubmitEditing={() => setTyping(false)}
          placeholder={otherPlaceholder}
          maxLength={maxLength}
          returnKeyType="done"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  group: { gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
