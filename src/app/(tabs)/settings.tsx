import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { DragReorder } from '@/components/drag-reorder';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/chip';
import { Card } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { IS_DEV_BUILD } from '@/lib/env';
import { useGear, type SlotDraft } from '@/lib/gear';
import { select } from '@/lib/haptics';
import { MIN_SLOTS, PORTRAIT_WHEELS } from '@/lib/limits';
import { setAiConsent, setSoundOn, setSpinStyle, useAiConsent, useSoundOn, useSpinStyle, type SpinStyle } from '@/lib/preferences';
import { landSound } from '@/lib/sounds';
import { setThemePref, useThemePref, type ThemePref } from '@/lib/theme-preference';
import { CATEGORIES } from '@/types/models';

const STYLES: Record<string, SpinStyle> = { Random: 'random', Coordinated: 'coordinated' };
const THEMES: Record<string, ThemePref> = { 'Match phone': 'system', Light: 'light', Dark: 'dark' };

function WheelsEditor() {
  const theme = useTheme();
  const { slots, saveSlots, maxSlots } = useGear();

  const apply = async (next: SlotDraft[]) => {
    const r = await saveSlots(next);
    if (!r.ok) Alert.alert('Wheels', r.error);
  };
  const current = (): SlotDraft[] => slots.map((s) => ({ category: s.category, lockedItemId: s.lockedItemId, from: s.slotIndex }));

  function add() {
    select();
    const used = new Set(slots.map((s) => s.category));
    void apply([...current(), { category: CATEGORIES.find((c) => !used.has(c)) ?? 'Other', lockedItemId: null }]);
  }
  function removeAt(i: number) {
    select();
    void apply(current().filter((_, k) => k !== i));
  }

  return (
    <Card>
      <View style={styles.stepper}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Number of wheels</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Up to {maxSlots}. Portrait shows the first {PORTRAIT_WHEELS}; turn your phone sideways to see them all.
          </ThemedText>
        </View>
        <View style={styles.inline}>
          <SmallIcon icon="minus" label="Fewer wheels" onPress={() => removeAt(slots.length - 1)} disabled={slots.length <= MIN_SLOTS} />
          <ThemedText type="heading" style={styles.count}>
            {slots.length}
          </ThemedText>
          <SmallIcon icon="add" label="More wheels" onPress={add} disabled={slots.length >= maxSlots} />
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Pick what each wheel spins through, and hold the grip and drag to change the order.
      </ThemedText>
      <DragReorder
        items={slots}
        keyOf={(s) => String(s.slotIndex)}
        direction="column"
        itemSize={104}
        gap={8}
        onReorder={(next) => void apply(next.map((s) => ({ category: s.category, lockedItemId: s.lockedItemId, from: s.slotIndex })))}
        renderItem={(s, i, grip) => (
          <View style={[styles.wheel, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <View style={styles.wheelHead}>
              <View {...grip} accessibilityRole="adjustable" accessibilityLabel={`Wheel ${i + 1}. Drag to reorder.`} style={styles.gripArea}>
                <Icon name="grip" size={18} color={theme.textSecondary} />
                <ThemedText type="smallBold">
                  Wheel {i + 1}
                  {i >= PORTRAIT_WHEELS ? ' · sideways only' : ''}
                </ThemedText>
              </View>
              <SmallIcon icon="trash" label={`Remove wheel ${i + 1}`} onPress={() => removeAt(i)} disabled={slots.length <= MIN_SLOTS} />
            </View>
            <ChipGroup
              options={CATEGORIES}
              value={s.category as (typeof CATEGORIES)[number]}
              onChange={(v) => v && void apply(current().map((d, k) => (k === i ? { ...d, category: v } : d)))}
              scroll
            />
          </View>
        )}
      />
    </Card>
  );
}

function ToggleRow({ label, hint, value, onValueChange, first }: { label: string; hint?: string; value: boolean; onValueChange: (v: boolean) => void; first?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.toggle, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <View style={styles.flex}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
      <Switch value={value} onValueChange={(v) => { select(); onValueChange(v); }} trackColor={{ true: theme.accent }} accessibilityLabel={label} />
    </View>
  );
}

function SmallIcon({ icon, label, onPress, disabled }: { icon: 'up' | 'down' | 'trash' | 'minus' | 'add'; label: string; onPress: () => void; disabled?: boolean }) {
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
  const spinStyle = useSpinStyle();
  const sound = useSoundOn();
  const ai = useAiConsent();
  const { eraseEverything, items, addSamples, removeSamples, sampleCount, ownCount, maxItems } = useGear();
  const version = `${Constants.expoConfig?.version ?? '?'} (${Constants.expoConfig?.ios?.buildNumber ?? 'dev'})`;

  function erase() {
    Alert.alert('Erase everything?', `This deletes all ${items.length} items, their photos, your wheels and spin history from this phone. It can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: () => void eraseEverything() },
    ]);
  }

  async function loadSamples() {
    const n = await addSamples();
    Alert.alert('Sample gear', n > 0 ? `Added ${n} sample pieces. They don't count toward your ${maxItems} items, and you can remove them here any time.` : 'The sample gear is already loaded.');
  }

  function dropSamples() {
    Alert.alert('Remove sample gear?', `This removes the ${sampleCount} sample pieces. Anything you added yourself, or edited, stays.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeSamples() },
    ]);
  }

  return (
    <Screen title="Settings" tab>
      <ThemedText type="heading">Wheels</ThemedText>
      <WheelsEditor />

      <ThemedText type="heading">Spinning</ThemedText>
      <Card padded={false}>
        <View style={styles.pad}>
          <ThemedText type="smallBold">Spin style</ThemedText>
          <ChipGroup options={Object.keys(STYLES)} value={Object.keys(STYLES).find((k) => STYLES[k] === spinStyle) ?? 'Random'} onChange={(v) => v && setSpinStyle(STYLES[v] ?? 'random')} />
          <ThemedText type="small" themeColor="textSecondary">
            {spinStyle === 'coordinated'
              ? 'An AI picks pieces that go well together: matching materials and finishes, colors that sit well side by side. Locked wheels stay put, and it falls back to random if it can’t connect.'
              : 'Every wheel lands on a random piece from its category.'}
          </ThemedText>
        </View>
        <ToggleRow
          label="Sound"
          hint="Soft ticks while the wheels turn, slow down and stop."
          value={sound}
          onValueChange={(v) => {
            setSoundOn(v);
            if (v) landSound();
          }}
        />
      </Card>

      <ThemedText type="heading">AI help</ThemedText>
      <Card padded={false}>
        <ToggleRow
          first
          label="Allow AI help"
          hint="Used to identify gear from a photo you choose and to pick coordinated sets. Photos and item details are sent to an AI service (Anthropic’s Claude) and aren’t stored by EDC Roulette. Off by default until you say yes."
          value={ai === 'allowed'}
          onValueChange={(v) => setAiConsent(v ? 'allowed' : 'declined')}
        />
      </Card>

      <ThemedText type="heading">Sample gear</ThemedText>
      <Card>
        <ThemedText themeColor="textSecondary">
          Want to try the wheels before adding your own? Load about ten pieces for each category. They don’t count toward your {maxItems} items ({ownCount} used) and you can remove them in one tap.
        </ThemedText>
        {sampleCount > 0 ? (
          <Button label={`Remove ${sampleCount} sample pieces`} variant="secondary" icon="trash" onPress={dropSamples} />
        ) : (
          <Button label="Load sample gear" variant="secondary" icon="add" onPress={() => void loadSamples()} />
        )}
      </Card>

      <ThemedText type="heading">Appearance</ThemedText>
      <Card>
        <ChipGroup options={Object.keys(THEMES)} value={Object.keys(THEMES).find((k) => THEMES[k] === pref) ?? 'Match phone'} onChange={(v) => v && setThemePref(THEMES[v] ?? 'system')} />
      </Card>

      <ThemedText type="heading">Premium</ThemedText>
      <Card>
        <ThemedText themeColor="textSecondary">
          Coming soon: unlimited gear, cloud backup across your devices, EDC Friends, and a web dashboard. Everything you add now stays on this phone and will move over when you upgrade.
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
  pad: { padding: Spacing.three, gap: Spacing.two },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  count: { minWidth: 24, textAlign: 'center' },
  wheel: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two },
  wheelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gripArea: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one, paddingRight: Spacing.three },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  small: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three },
  center: { textAlign: 'center' },
});
