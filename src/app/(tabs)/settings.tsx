import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/chip';
import { Card } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { IS_DEV_BUILD } from '@/lib/env';
import { useGear } from '@/lib/gear';
import { select } from '@/lib/haptics';
import { setThemePref, useThemePref, type ThemePref } from '@/lib/theme-preference';
import { CATEGORIES } from '@/types/models';

const THEMES: Record<string, ThemePref> = { 'Match phone': 'system', Light: 'light', Dark: 'dark' };

function SlotsEditor() {
  const theme = useTheme();
  const { slots, saveSlots, maxSlots } = useGear();
  const [draft, setDraft] = useState(slots.map((s) => ({ category: s.category, lockedItemId: s.lockedItemId })));
  useEffect(() => setDraft(slots.map((s) => ({ category: s.category, lockedItemId: s.lockedItemId }))), [slots]);

  const changed = JSON.stringify(draft) !== JSON.stringify(slots.map((s) => ({ category: s.category, lockedItemId: s.lockedItemId })));

  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= draft.length) return;
    select();
    const next = [...draft];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setDraft(next);
  }

  async function save() {
    const r = await saveSlots(draft);
    if (!r.ok) Alert.alert('Slots', r.error);
  }

  return (
    <Card>
      <ThemedText type="small" themeColor="textSecondary">
        Each slot is one reel on the Spin screen and picks from one category. The free version has up to {maxSlots}.
      </ThemedText>
      {draft.map((s, i) => (
        <View key={i} style={[styles.slot, { borderColor: theme.border }]}>
          <View style={styles.slotHead}>
            <ThemedText type="smallBold">Slot {i + 1}</ThemedText>
            <View style={styles.inline}>
              <SmallIcon icon="up" label={`Move slot ${i + 1} up`} onPress={() => move(i, -1)} disabled={i === 0} />
              <SmallIcon icon="down" label={`Move slot ${i + 1} down`} onPress={() => move(i, 1)} disabled={i === draft.length - 1} />
              <SmallIcon icon="trash" label={`Remove slot ${i + 1}`} onPress={() => setDraft(draft.filter((_, k) => k !== i))} disabled={draft.length <= 1} />
            </View>
          </View>
          <ChipGroup options={CATEGORIES} value={s.category as (typeof CATEGORIES)[number]} onChange={(v) => v && setDraft(draft.map((d, k) => (k === i ? { ...d, category: v } : d)))} scroll />
        </View>
      ))}
      <View style={styles.inline}>
        <Button
          label="Add slot"
          icon="add"
          variant="secondary"
          disabled={draft.length >= maxSlots}
          onPress={() => setDraft([...draft, { category: CATEGORIES.find((c) => !draft.some((d) => d.category === c)) ?? 'Other', lockedItemId: null }])}
          style={styles.flex}
        />
        <Button label="Save slots" onPress={save} disabled={!changed} style={styles.flex} />
      </View>
    </Card>
  );
}

function SmallIcon({ icon, label, onPress, disabled }: { icon: 'up' | 'down' | 'trash'; label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={[styles.small, { backgroundColor: theme.backgroundElement }, disabled && { opacity: 0.3 }]}>
      <Icon name={icon} size={14} color={theme.text} />
    </Pressable>
  );
}

function LinkRow({ label, href, first }: { label: string; href: Href; first?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.link, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <Icon name="chevron" size={14} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const pref = useThemePref();
  const { eraseEverything, items } = useGear();
  const version = `${Constants.expoConfig?.version ?? '?'} (${Constants.expoConfig?.ios?.buildNumber ?? 'dev'})`;

  function erase() {
    Alert.alert('Erase everything?', `This deletes all ${items.length} items, their photos, your slots and spin history from this phone. It can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: () => void eraseEverything() },
    ]);
  }

  return (
    <Screen title="Settings" tab>
      <ThemedText type="heading">Slots</ThemedText>
      <SlotsEditor />

      <ThemedText type="heading">Appearance</ThemedText>
      <Card>
        <ChipGroup options={Object.keys(THEMES)} value={Object.keys(THEMES).find((k) => THEMES[k] === pref) ?? 'Match phone'} onChange={(v) => v && setThemePref(THEMES[v] ?? 'system')} />
      </Card>

      <ThemedText type="heading">Premium</ThemedText>
      <Card>
        <ThemedText themeColor="textSecondary">
          Coming soon: unlimited gear and slots, cloud backup across your devices, EDC Friends, and a web dashboard. Everything you add now stays on this phone and will move over when you upgrade.
        </ThemedText>
      </Card>

      <ThemedText type="heading">About</ThemedText>
      <Card padded={false}>
        <LinkRow first label="Privacy policy" href="/privacy" />
        <LinkRow label="Terms of use" href="/terms" />
        <LinkRow label="Help and support" href="/support" />
      </Card>

      <Button label="Erase everything on this phone" variant="danger" icon="trash" onPress={erase} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        EDC Roulette {version}
        {IS_DEV_BUILD ? ' · development build' : ''}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  slot: { gap: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  slotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  small: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three },
  center: { textAlign: 'center' },
});
