import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ColorPicker } from '@/components/color-picker';
import { GearThumb } from '@/components/gear-thumb';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { success } from '@/lib/haptics';
import { choosePhoto, deletePhoto, type PhotoSource } from '@/lib/photos';
import { CATEGORIES, FINISHES, MATERIALS, type GearDraft, type GearItem } from '@/types/models';

const EMPTY: GearDraft = { name: '', category: 'Knife', material: null, finish: null, primaryColor: null, weightGrams: null, notes: null, imageUri: null };

/** Add (no `item`) or edit (`item`) a piece of gear. */
export function GearForm({ item, defaultCategory }: { item?: GearItem; defaultCategory?: string }) {
  const theme = useTheme();
  const { addItem, updateItem, removeItem } = useGear();
  const [draft, setDraft] = useState<GearDraft>(() => (item ? { ...item } : { ...EMPTY, category: defaultCategory ?? EMPTY.category }));
  const [weightText, setWeightText] = useState(item?.weightGrams != null ? String(item.weightGrams) : '');
  const [busy, setBusy] = useState(false);
  // Photos taken in this session that end up unused are deleted on leaving.
  const [newPhotos, setNewPhotos] = useState<string[]>([]);

  const set = <K extends keyof GearDraft>(k: K, v: GearDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const canSave = draft.name.trim().length > 0 && !busy;

  async function getPhoto(source: PhotoSource) {
    try {
      const uri = await choosePhoto(source);
      if (uri) {
        setNewPhotos((p) => [...p, uri]);
        set('imageUri', uri);
      }
    } catch (e) {
      Alert.alert('Photo', e instanceof Error ? e.message : 'Could not get the photo.');
    }
  }

  function photoMenu() {
    const options = ['Take photo', 'Choose from library', ...(draft.imageUri ? ['Remove photo'] : []), 'Cancel'];
    const run = (i: number) => {
      if (options[i] === 'Take photo') void getPhoto('camera');
      else if (options[i] === 'Choose from library') void getPhoto('library');
      else if (options[i] === 'Remove photo') set('imageUri', null);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: draft.imageUri ? 2 : undefined },
        run,
      );
    } else {
      Alert.alert('Photo', undefined, options.map((label, i) => ({ text: label, style: label === 'Cancel' ? 'cancel' : 'default', onPress: () => run(i) })));
    }
  }

  async function save() {
    const weight = weightText.trim() ? Number(weightText.replace(',', '.')) : null;
    if (weight != null && (!Number.isFinite(weight) || weight < 0)) {
      Alert.alert('Weight', 'Enter the weight in grams, like 85 or 85.5.');
      return;
    }
    const clean: GearDraft = {
      ...draft,
      name: draft.name.trim(),
      material: draft.material?.trim() || null,
      finish: draft.finish?.trim() || null,
      notes: draft.notes?.trim() || null,
      weightGrams: weight,
    };
    setBusy(true);
    const r = item ? await updateItem(item.id, clean) : await addItem(clean);
    setBusy(false);
    if (!r.ok) {
      Alert.alert('Not saved', r.error);
      return;
    }
    for (const uri of newPhotos) if (uri !== clean.imageUri) deletePhoto(uri);
    success();
    router.back();
  }

  function cancel() {
    for (const uri of newPhotos) deletePhoto(uri);
    router.back();
  }

  function remove() {
    if (!item) return;
    Alert.alert(`Delete ${item.name}?`, 'It will be removed from your collection and any slot it is locked in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          for (const uri of newPhotos) deletePhoto(uri);
          await removeItem(item.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen title={item ? 'Edit gear' : 'Add gear'} showTitle={false}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: item ? 'Edit gear' : 'Add gear',
          headerLeft: () => <HeaderButton label="Cancel" onPress={cancel} />,
          headerRight: () => <HeaderButton label="Save" bold disabled={!canSave} onPress={save} />,
        }}
      />
      <Pressable onPress={photoMenu} accessibilityRole="button" accessibilityLabel={draft.imageUri ? 'Change photo' : 'Add a photo'} style={styles.photo}>
        <GearThumb item={{ name: draft.name || '?', imageUri: draft.imageUri, primaryColor: draft.primaryColor }} size={120} />
        <ThemedText type="link">{draft.imageUri ? 'Change photo' : 'Add a photo'}</ThemedText>
      </Pressable>

      <Field label="Name">
        <Input value={draft.name} onChangeText={(t) => set('name', t)} placeholder="e.g. Spyderco Para 3" maxLength={80} autoFocus={!item} returnKeyType="done" />
      </Field>
      <Field label="Category">
        <ChipGroup options={CATEGORIES} value={draft.category as (typeof CATEGORIES)[number]} onChange={(v) => v && set('category', v)} />
      </Field>
      <Field label="Material">
        <ChipGroup options={MATERIALS} value={(MATERIALS as readonly string[]).includes(draft.material ?? '') ? (draft.material as (typeof MATERIALS)[number]) : null} onChange={(v) => set('material', v)} allowNone scroll />
        <Input value={draft.material ?? ''} onChangeText={(t) => set('material', t || null)} placeholder="Or type your own" maxLength={40} />
      </Field>
      <Field label="Finish">
        <ChipGroup options={FINISHES} value={(FINISHES as readonly string[]).includes(draft.finish ?? '') ? (draft.finish as (typeof FINISHES)[number]) : null} onChange={(v) => set('finish', v)} allowNone scroll />
      </Field>
      <Field label="Color">
        <ColorPicker value={draft.primaryColor} onChange={(hex) => set('primaryColor', hex)} />
      </Field>
      <Field label="Weight (grams)">
        <Input value={weightText} onChangeText={setWeightText} placeholder="Optional" keyboardType="decimal-pad" maxLength={8} />
      </Field>
      <Field label="Notes">
        <Input value={draft.notes ?? ''} onChangeText={(t) => set('notes', t || null)} placeholder="Optional" multiline maxLength={1000} style={styles.notes} />
      </Field>

      <Button label={item ? 'Save changes' : 'Add to collection'} onPress={save} disabled={!canSave} busy={busy} />
      {item ? <Button label="Delete" variant="danger" icon="trash" onPress={remove} /> : null}
      <View style={{ height: Spacing.four, backgroundColor: theme.background }} />
    </Screen>
  );
}

function HeaderButton({ label, onPress, bold, disabled }: { label: string; onPress: () => void; bold?: boolean; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} accessibilityRole="button" style={{ opacity: disabled ? 0.4 : 1, paddingHorizontal: Spacing.two }}>
      <ThemedText type={bold ? 'smallBold' : 'small'} style={{ color: theme.accent, fontSize: 16 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photo: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  notes: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
});
