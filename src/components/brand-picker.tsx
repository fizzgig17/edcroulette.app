/**
 * Brand entry that makes loading gear quick: tap a popular brand for the
 * category, or start typing and get forgiving suggestions ("Spydercoo" ->
 * Spyderco). A brand that isn't on the list can be suggested for review; it is
 * still saved on the item either way.
 */
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { suggestBrand } from '@/lib/api';
import { brandKey, matchBrands, useBrands } from '@/lib/brands';
import { select } from '@/lib/haptics';

export function BrandPicker({
  initial,
  resetKey,
  category,
  onChange,
}: {
  initial: string;
  /** Changing this replaces the typed text with `initial` (used when the AI fills the form in). */
  resetKey: number;
  category: string;
  onChange: (brand: string | null) => void;
}) {
  const theme = useTheme();
  const brands = useBrands();
  const [text, setText] = useState(initial);
  const [fieldKey, setFieldKey] = useState(resetKey);
  const [seenReset, setSeenReset] = useState(resetKey);
  const [sent, setSent] = useState<string | null>(null);

  // The form was filled in from outside (photo identify): show that text.
  if (seenReset !== resetKey) {
    setSeenReset(resetKey);
    setFieldKey(resetKey);
    setText(initial);
  }

  const typed = text.trim();
  const exact = useMemo(() => brands.find((b) => brandKey(b.name) === brandKey(typed)) ?? null, [brands, typed]);
  const matches = useMemo(() => (typed.length >= 2 && !exact ? matchBrands(typed, brands, 4, category) : []), [typed, exact, brands, category]);
  const popular = useMemo(() => brands.filter((b) => b.categories[0] === category || b.categories.includes(category)).slice(0, 8), [brands, category]);

  function choose(name: string) {
    select();
    setText(name);
    setFieldKey((k) => k + 1000);
    setSent(null);
    onChange(name);
  }

  async function suggest() {
    const r = await suggestBrand(typed, category);
    if (!r.ok) {
      Alert.alert('Suggest a brand', r.error);
      return;
    }
    if (r.status === 'exists') {
      choose(r.name);
      Alert.alert('Already on the list', `${r.name} is already there, so I picked it for you.`);
    } else {
      setSent(typed);
      Alert.alert('Thanks!', `“${r.name}” is sent for review. It's saved on this item either way.`);
    }
  }

  const notOnList = typed.length >= 2 && !exact && matches.length === 0;

  return (
    <View style={styles.wrap}>
      <Input
        key={fieldKey}
        defaultValue={text}
        onChangeText={(t) => {
          setText(t);
          setSent(null);
          onChange(t.trim() ? t : null);
        }}
        placeholder="e.g. Spyderco"
        maxLength={60}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
      />
      {typed.length === 0 && popular.length > 0 ? (
        <View style={styles.chips}>
          {popular.map((b) => (
            <Chip key={b.name} label={b.name} selected={false} onPress={() => choose(b.name)} />
          ))}
        </View>
      ) : null}
      {matches.length > 0 ? (
        <View style={styles.chips}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Did you mean
          </ThemedText>
          {matches.map((m) => (
            <Chip key={m.name} label={m.name} selected={false} onPress={() => choose(m.name)} />
          ))}
        </View>
      ) : null}
      {exact && brandKey(exact.name) === brandKey(typed) && exact.name !== typed ? (
        <Pressable onPress={() => choose(exact.name)} accessibilityRole="button">
          <ThemedText type="small" style={{ color: theme.accent }}>
            Use “{exact.name}”
          </ThemedText>
        </Pressable>
      ) : null}
      {notOnList ? (
        <View style={[styles.suggest, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {sent === typed ? `“${typed}” is sent for review.` : `“${typed}” isn't on the list yet.`}
          </ThemedText>
          {sent === typed ? null : (
            <Pressable onPress={() => void suggest()} accessibilityRole="button" hitSlop={8}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Suggest it
              </ThemedText>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  label: { marginRight: Spacing.one },
  flex: { flex: 1 },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth },
});
