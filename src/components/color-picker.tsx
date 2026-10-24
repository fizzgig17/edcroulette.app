import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { readableOn } from '@/components/gear-thumb';
import { Input } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { select } from '@/lib/haptics';
import { normalizeHex } from '@/types/models';

/** Common EDC colors: raw and anodized titanium, copper, brass, black coatings, G10 and anodizing hues. */
const SWATCHES = ['#8A8D91', '#5E6266', '#B87333', '#B5A642', '#1B1C1E', '#2F3B2E', '#3F4A5A', '#7A1F1F', '#C9A227', '#2563EB', '#7C3AED', '#0F766E', '#D97706', '#E5E7EB'];

export function ColorPicker({ value, onChange }: { value: string | null; onChange: (hex: string | null) => void }) {
  const theme = useTheme();
  const [text, setText] = useState(value ?? '');
  const custom = !!value && !SWATCHES.includes(value);
  const [typing, setTyping] = useState(false);
  useEffect(() => setText(value ?? ''), [value]);

  return (
    <View style={styles.wrap}>
      <View style={styles.swatches}>
        {SWATCHES.map((hex) => {
          const on = value === hex;
          return (
            <Pressable
              key={hex}
              onPress={() => {
                select();
                onChange(on ? null : hex);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Color ${hex}`}
              style={[styles.swatch, { backgroundColor: hex, borderColor: on ? theme.accent : theme.border }, on && styles.on]}>
              {on ? <Icon name="check" size={14} color={readableOn(hex)} /> : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            select();
            setTyping((x) => !x);
          }}
          accessibilityRole="button"
          accessibilityLabel="Type a color code"
          style={[styles.swatch, styles.more, { borderColor: typing || custom ? theme.accent : theme.border }]}>
          <Icon name="add" size={16} color={theme.text} />
        </Pressable>
      </View>
      {typing || custom ? (
        <View style={styles.row}>
          <View style={[styles.preview, { backgroundColor: value ?? 'transparent', borderColor: theme.border }]} />
          <Input
            value={text}
            onChangeText={(t) => {
              setText(t);
              const hex = normalizeHex(t);
              if (hex) onChange(hex);
              else if (!t.trim()) onChange(null);
            }}
            onBlur={() => setText(value ?? '')}
            placeholder="#RRGGBB"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            accessibilityLabel="Color hex value"
            style={styles.hex}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  on: { borderWidth: 3 },
  more: { borderStyle: 'dashed' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  preview: { width: 40, height: 40, borderRadius: 10, borderWidth: 1 },
  hex: { flex: 1, fontVariant: ['tabular-nums'] },
});
