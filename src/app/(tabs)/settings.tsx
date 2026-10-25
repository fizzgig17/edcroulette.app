import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Alert, Modal, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { DragReorder } from '@/components/drag-reorder';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/chip';
import { Card, Input } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { IS_DEV_BUILD } from '@/lib/env';
import { useGear, type SlotDraft } from '@/lib/gear';
import { select } from '@/lib/haptics';
import { MIN_SLOTS, PORTRAIT_WHEELS } from '@/lib/limits';
import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons';
import { METALS, metalById } from '@/constants/metals';
import { useTour } from '@/lib/tour';
import { addTrainingNote, MAX_TRAINING_NOTE_CHARS, MAX_TRAINING_NOTES, removeTrainingNote, setAiConsent, setIconFollowsMetal, setMetalId, useIconFollowsMetal, useMetalId, setSoundOn, setSpinStyle, useAiConsent, useSoundOn, useSpinStyle, useTrainingNotes, type SpinStyle } from '@/lib/preferences';
import { landSound } from '@/lib/sounds';
import { setThemePref, useThemePref, type ThemePref } from '@/lib/theme-preference';
import { CATEGORIES } from '@/types/models';

const STYLES: Record<string, SpinStyle> = { Random: 'random', Coordinated: 'coordinated' };
const THEMES: Record<string, ThemePref> = { 'Match phone': 'system', Light: 'light', Dark: 'dark' };

function WheelsEditor({ onDragChange }: { onDragChange: (dragging: boolean) => void }) {
  const theme = useTheme();
  const { slots, saveSlots, maxSlots } = useGear();
  const [picking, setPicking] = useState<number | null>(null);

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
  function choose(category: string) {
    if (picking === null) return;
    select();
    void apply(current().map((d, k) => (k === picking ? { ...d, category } : d)));
    setPicking(null);
  }

  return (
    <Card>
      <View style={styles.stepper}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Wheels</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Upright shows the first {PORTRAIT_WHEELS}; sideways shows all. Drag ≡ to reorder.
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
      <DragReorder
        onDragChange={onDragChange}
        items={slots}
        keyOf={(s) => String(s.slotIndex)}
        direction="column"
        itemSize={56}
        gap={8}
        onReorder={(next) => void apply(next.map((s) => ({ category: s.category, lockedItemId: s.lockedItemId, from: s.slotIndex })))}
        renderItem={(s, i, grip) => (
          <View style={[styles.wheel, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <View {...grip} accessibilityRole="adjustable" accessibilityLabel={`${s.category} wheel. Drag to reorder.`} style={styles.gripArea}>
              <Icon name="grip" size={20} color={theme.textSecondary} />
            </View>
            <Pressable
              onPress={() => setPicking(i)}
              accessibilityRole="button"
              accessibilityLabel={`${s.category}. Change what this wheel spins.`}
              style={({ pressed }) => [styles.wheelName, pressed && { opacity: 0.6 }]}>
              <View style={styles.flex}>
                <ThemedText type="smallBold" style={styles.wheelTitle}>
                  {s.category}
                </ThemedText>
                {i >= PORTRAIT_WHEELS ? (
                  <ThemedText type="caption" themeColor="textSecondary" style={styles.sub}>
                    Sideways only
                  </ThemedText>
                ) : null}
              </View>
              <View style={[styles.swap, { backgroundColor: theme.accentSoft }]}>
                <Icon name="swap" size={15} color={theme.accent} />
              </View>
            </Pressable>
            <SmallIcon icon="trash" label={`Remove ${s.category} wheel`} onPress={() => removeAt(i)} disabled={slots.length <= MIN_SLOTS} />
          </View>
        )}
      />
      <Modal visible={picking !== null} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.scrim} onPress={() => setPicking(null)} accessibilityLabel="Close">
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => undefined}>
            <ThemedText type="heading">What does this wheel spin?</ThemedText>
            <View style={styles.tiles}>
              {CATEGORIES.map((c) => {
                const on = picking !== null && slots[picking]?.category === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => choose(c)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [styles.tile, { backgroundColor: on ? theme.accent : theme.backgroundElement, borderColor: on ? theme.accent : theme.border }, pressed && { opacity: 0.7 }]}>
                    <ThemedText type="smallBold" style={{ color: on ? theme.onAccent : theme.text }}>
                      {c}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  const theme = useTheme();
  const pref = useThemePref();
  const spinStyle = useSpinStyle();
  const sound = useSoundOn();
  const metal = metalById(useMetalId());
  const [holding, setHolding] = useState(false);
  const notes = useTrainingNotes();
  const [noteText, setNoteText] = useState('');
  const [noteKey, setNoteKey] = useState(0);
  const [appIcon, setAppIcon] = useState<string | null>(() => (Platform.OS === 'ios' && supportsAlternateIcons ? getAppIconName() : null));
  async function chooseIcon(id: string) {
    select();
    try {
      const name = id === 'mixed' ? null : id.charAt(0).toUpperCase() + id.slice(1);
      await setAlternateAppIcon(name);
      setAppIcon(name);
    } catch {
      Alert.alert('App icon', 'The icon could not be changed just now.');
    }
  }
  // Android swaps launcher entries to change the icon, which closes the app and can make the icon vanish on some launchers (One UI), so it is iPhone and iPad only.
  const canSwitchIcon = Platform.OS === 'ios' && supportsAlternateIcons;
  const follows = useIconFollowsMetal();
  const iconId = appIcon ? appIcon.toLowerCase() : 'mixed';
  const ai = useAiConsent();
  const { eraseEverything, items, addSamples, removeSamples, sampleCount, ownCount, maxItems } = useGear();
  const version = `${Constants.expoConfig?.version ?? '?'} (${Constants.expoConfig?.ios?.buildNumber ?? 'dev'})`;

  function erase() {
    Alert.alert('Erase everything?', `This deletes all ${items.length} items, their photos, your wheels and spin history from this phone. It can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: () => void eraseEverything() },
    ]);
  }

  const { start: startTour } = useTour();

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
    <Screen title="Settings" tab scrollEnabled={!holding}>
      <ThemedText type="heading">Wheels</ThemedText>
      <WheelsEditor onDragChange={setHolding} />

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

      <ThemedText type="heading">Metal</ThemedText>
      <Card>
        <ThemedText themeColor="textSecondary">The metal for the Spin button and the trim around the wheels.</ThemedText>
        <View style={styles.metals}>
          {METALS.map((m) => (
            <Pressable key={m.id} onPress={() => { select(); setMetalId(m.id); if (canSwitchIcon && follows && m.id !== iconId) void chooseIcon(m.id); }} accessibilityRole="button" accessibilityState={{ selected: m.id === metal.id }} accessibilityLabel={m.label} style={styles.metal}>
              <Image source={m.texture} contentFit="cover" style={[styles.swatch, { borderColor: m.id === metal.id ? theme.accent : theme.border, borderWidth: m.id === metal.id ? 3 : 1 }]} />
              <ThemedText type="small" style={m.id === metal.id ? { color: theme.accent, fontWeight: '700' } : undefined} numberOfLines={1}>
                {m.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        {canSwitchIcon ? (
          <View style={styles.followRow}>
            <ThemedText type="small" style={styles.flex}>
              Use this metal for the app icon too
            </ThemedText>
            <Switch value={follows} onValueChange={(v) => { select(); setIconFollowsMetal(v); if (v && metal.id !== iconId) void chooseIcon(metal.id); }} trackColor={{ true: theme.accent }} accessibilityLabel="Use this metal for the app icon too" />
          </View>
        ) : null}
      </Card>

      {canSwitchIcon && !follows ? (
        <>
          <ThemedText type="heading">App icon</ThemedText>
          <Card>
            <ThemedText themeColor="textSecondary">Pick the home screen icon separately. {Platform.OS === 'ios' ? 'iOS shows a short notice each time it changes.' : 'On Android the icon can take a few seconds to change, and the app may close once.'}</ThemedText>
            <View style={styles.metals}>
              {[{ id: 'mixed', label: 'Mixed' }, ...METALS].map((m) => (
                <Pressable key={m.id} onPress={() => void chooseIcon(m.id)} accessibilityRole="button" accessibilityState={{ selected: m.id === iconId }} accessibilityLabel={`${m.label} icon`} style={styles.metal}>
                  {'texture' in m ? (
                    <Image source={m.texture} contentFit="cover" style={[styles.swatch, { borderColor: m.id === iconId ? theme.accent : theme.border, borderWidth: m.id === iconId ? 3 : 1 }]} />
                  ) : (
                    <View style={[styles.swatch, styles.mixedSwatch, { borderColor: m.id === iconId ? theme.accent : theme.border, borderWidth: m.id === iconId ? 3 : 1 }]}>
                      {(['damascus', 'mokume', 'timascus', 'brass'] as const).map((id) => (
                        <Image key={id} source={metalById(id).texture} contentFit="cover" style={styles.mixedCell} />
                      ))}
                    </View>
                  )}
                  <ThemedText type="small" style={m.id === iconId ? { color: theme.accent, fontWeight: '700' } : undefined} numberOfLines={1}>
                    {m.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </Card>
        </>
      ) : null}

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

      <ThemedText type="heading">Teach the photo check</ThemedText>
      <Card>
        <ThemedText themeColor="textSecondary">
          Tell it what it should know about your gear, like “My black pens are usually zirconium” or “Anything with a green handle is Micarta”. It uses these as hints each time it looks at a photo, only when AI help is on.
        </ThemedText>
        {notes.map((n, i) => (
          <View key={`${i}:${n}`} style={styles.note}>
            <ThemedText type="small" style={styles.flexText}>
              {n}
            </ThemedText>
            <Pressable onPress={() => removeTrainingNote(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove note: ${n}`}>
              <Icon name="trash" size={18} color={theme.danger} />
            </Pressable>
          </View>
        ))}
        {notes.length < MAX_TRAINING_NOTES ? (
          <>
            <Input
              key={`note-${noteKey}`}
              placeholder="Add a note"
              defaultValue=""
              onChangeText={setNoteText}
              maxLength={MAX_TRAINING_NOTE_CHARS}
              multiline
              returnKeyType="done"
              blurOnSubmit
            />
            <Button
              label="Add note"
              icon="add"
              variant="secondary"
              disabled={!noteText.trim()}
              onPress={() => {
                if (addTrainingNote(noteText)) {
                  setNoteText('');
                  setNoteKey((k) => k + 1);
                }
              }}
            />
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            That’s the most notes (up to {MAX_TRAINING_NOTES}). Remove one to add another.
          </ThemedText>
        )}
      </Card>

      <ThemedText type="heading">Photo demo</ThemedText>
      <Card>
        <ThemedText themeColor="textSecondary">
          See how identifying from a photo works, with a built-in picture of three items and ready-made answers. Nothing is sent to the AI.
        </ThemedText>
        <Button label="Try the photo demo" icon="sparkle" variant="secondary" onPress={() => router.push('/gear/new?demo=1' as Href)} />
      </Card>

      <ThemedText type="heading">Tour</ThemedText>
      <Card>
        <ThemedText themeColor="textSecondary">A quick walk through the wheels, your collection and these settings.</ThemedText>
        <Button label="Show the tour again" icon="sparkle" variant="secondary" onPress={() => startTour()} />
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
  note: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  flexText: { flex: 1 },
  metals: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  metal: { width: '21%', alignItems: 'center', gap: 4 },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  mixedSwatch: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  mixedCell: { width: '50%', height: '50%' },
  swatch: { width: 56, height: 56, borderRadius: 28 },
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pad: { padding: Spacing.three, gap: Spacing.two },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  count: { minWidth: 24, textAlign: 'center' },
  wheel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, paddingHorizontal: Spacing.two },
  gripArea: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.two },
  wheelName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, alignSelf: 'stretch' },
  wheelTitle: { fontSize: 16 },
  sub: { fontSize: 10, lineHeight: 12, letterSpacing: 0.6 },
  swap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end', padding: Spacing.three },
  sheet: { borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.three },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: '48%', minHeight: 48, borderRadius: Radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  small: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three },
  center: { textAlign: 'center' },
});
