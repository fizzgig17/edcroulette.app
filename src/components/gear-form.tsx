import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { areaOf, blurAreasInPhoto } from '@/lib/blur-items';
import { BrandPicker } from '@/components/brand-picker';
import { ColorPicker } from '@/components/color-picker';
import { GearThumb } from '@/components/gear-thumb';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/chip';
import { ChoiceField } from '@/components/ui/choice-field';
import { Card, Field, Input } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ensureAiConsent } from '@/lib/ai-consent';
import { IS_DEV_BUILD } from '@/lib/env';
import { identifyPhoto, type Identified } from '@/lib/api';
import { DEMO_ITEMS, DEMO_PHOTO, DEMO_SIZE } from '@/content/demo-photo';
import { useGear } from '@/lib/gear';
import { success } from '@/lib/haptics';
import { ItemPicker } from '@/components/item-picker';
import { PhotoCropper } from '@/components/photo-cropper';
import { deletePhoto, photoBase64, photoUri, pickPhoto, savePhoto, type PhotoCrop, type PickedPhoto, type PhotoSource } from '@/lib/photos';
import { useAiConsent } from '@/lib/preferences';
import { CATEGORIES, FINISHES, MATERIALS, type GearDraft, type GearItem } from '@/types/models';

const EMPTY: GearDraft = { name: '', brand: null, model: null, category: 'Knife', material: null, finish: null, primaryColor: null, weightGrams: null, notes: null, imageUri: null };

type Identify = { state: 'idle' } | { state: 'working' } | { state: 'done'; summary: string; unsure: boolean } | { state: 'failed'; message: string };

const autoName = (brand: string | null, model: string | null) => [brand?.trim(), model?.trim()].filter(Boolean).join(' ');

/** Add (no `item`) or edit (`item`) a piece of gear. A photo fills in most of the details. */
export function GearForm({ item, defaultCategory, demo }: { item?: GearItem; defaultCategory?: string; demo?: boolean }) {
  const theme = useTheme();
  const { addItem, updateItem, removeItem } = useGear();
  const aiConsent = useAiConsent();
  const [draft, setDraft] = useState<GearDraft>(() => (item ? { ...item } : { ...EMPTY, category: defaultCategory ?? EMPTY.category }));
  const [weightText, setWeightText] = useState(item?.weightGrams != null ? String(item.weightGrams) : '');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [materialOptions, setMaterialOptions] = useState<string[]>([]);
  // A photo with several items is added one at a time: `done` are the ones already added, `current` the one in the form.
  const [batch, setBatch] = useState<{ stored: string; items: Identified[]; done: number[]; current: number | null } | null>(null);
  const [picking, setPicking] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [cropping, setCropping] = useState<PickedPhoto | null>(null);
  const [identify, setIdentify] = useState<Identify>({ state: 'idle' });
  // Text fields keep their own text (so typing is never interrupted); this number
  // replaces what they show when the form is filled in from the photo.
  const [formKey, setFormKey] = useState(0);
  // Photos taken in this session that end up unused are deleted on leaving.
  const [newPhotos, setNewPhotos] = useState<string[]>([]);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  // The name follows "Brand Model" until the person types their own.
  const nameIsAuto = useRef(!item || !item.name || item.name === autoName(item.brand, item.model));

  // Fields that photo identify filled in and the person hasn't touched since: a new photo
  // may replace them, but never anything the person typed.
  const autoFields = useRef(new Set<keyof GearDraft>());
  const set = <K extends keyof GearDraft>(k: K, v: GearDraft[K]) => {
    autoFields.current.delete(k);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  function setBrandOrModel(patch: Partial<Pick<GearDraft, 'brand' | 'model'>>) {
    for (const k of Object.keys(patch)) autoFields.current.delete(k as keyof GearDraft);
    const next = { ...draftRef.current, ...patch };
    const name = nameIsAuto.current ? autoName(next.brand, next.model) : next.name;
    if (nameIsAuto.current && name !== draftRef.current.name) setFormKey((k) => k + 1);
    setDraft({ ...next, name });
  }

  // The header's Cancel always calls the latest cancel(), without new header options each render.
  const cancelRef = useRef<() => void>(() => router.back());
  const headerOptions = useRef({
    headerShown: true,
    title: item ? 'Edit gear' : 'Add gear',
    headerLeft: () => <HeaderButton label="Cancel" onPress={() => cancelRef.current()} />,
  });
  const leftAfter = batch && batch.current !== null && !item ? batch.items.length - batch.done.length - 1 : 0;
  const canSave = (draft.name.trim().length > 0 || !!autoName(draft.brand, draft.model)) && !busy && identify.state !== 'working';

  async function runIdentify(stored: string) {
    if (!(await ensureAiConsent('photo'))) {
      setIdentify({ state: 'idle' });
      return;
    }
    setIdentify({ state: 'working' });
    const b64 = await photoBase64(stored);
    if (!b64) {
      setIdentify({ state: 'failed', message: 'Could not read the photo.' });
      return;
    }
    const r = await identifyPhoto(b64);
    if (!r.ok) {
      // Dev builds show why, so a failure can be traced.
      setIdentify({ state: 'failed', message: IS_DEV_BUILD && r.detail ? `${r.error} (${r.detail})` : r.error });
      return;
    }
    applyIdentified(r);
    // Several items in the photo: let the person pick which one they mean.
    if (r.items && r.items.length > 1) {
      setBatch({ stored, items: r.items, done: [], current: null });
      setPicking(true);
    }
  }

  /** The person tapped an item: fill in its details and keep just that item in the photo. */
  async function chooseItem(index: number, dims: { width: number; height: number }) {
    const c = batch;
    setPicking(false);
    const it = c?.items[index];
    if (!c || !it) return;
    setBatch({ ...c, current: index });
    applyIdentified(it);
    const uri = photoUri(c.stored);
    if (!it.box || !uri) return;
    setPreparing(true);
    try {
      const { x, y, w, h } = it.box;
      const size = Math.min(Math.min(dims.width, dims.height), Math.max(w * dims.width, h * dims.height) * 1.15);
      const stored = await savePhoto(
        { uri, width: dims.width, height: dims.height },
        { originX: (x + w / 2) * dims.width - size / 2, originY: (y + h / 2) * dims.height - size / 2, size },
      );
      setNewPhotos((p) => [...p, stored]);
      // The other items in the photo are blurred (the background stays sharp). This happens
      // before the photo is shown, or the picture already on screen would stay as it was.
      try {
        const others = c.items.map((o, i) => (i === index ? null : areaOf(o))).filter((a): a is [number, number][] => !!a);
        await blurAreasInPhoto(stored, others, areaOf(it), dims, { originX: (x + w / 2) * dims.width - size / 2, originY: (y + h / 2) * dims.height - size / 2, size });
      } catch (e) {
        // The photo is still fine without it. Dev builds say why.
        if (IS_DEV_BUILD) Alert.alert('Blur', e instanceof Error ? e.message : String(e));
      }
      set('imageUri', stored);
    } catch {
      // Keep the whole photo; the details are already filled in.
    } finally {
      setPreparing(false);
    }
  }

  function applyIdentified(r: Identified) {
    const d = draftRef.current;
    // A stray pair of quote marks means "nothing read", not text.
    const text = (v: string | null | undefined) => (v ?? '').replace(/["\u201C\u201D`]/g, '').trim() || null;
    const brandText = text(r.brand) ?? text(r.brandRead);
    const auto = autoFields.current;
    setMaterialOptions(r.materialOptions && r.materialOptions.length > 1 ? r.materialOptions : []);
    // Take the photo's answer where the field is empty or came from an earlier photo.
    const fill = <K extends 'brand' | 'model' | 'material' | 'finish' | 'primaryColor' | 'notes'>(k: K, v: GearDraft[K]): GearDraft[K] => {
      if (d[k] && !auto.has(k)) return d[k];
      if (v) auto.add(k);
      else auto.delete(k);
      return v;
    };
    const next: GearDraft = {
      ...d,
      category: (CATEGORIES as readonly string[]).includes(r.category) ? r.category : d.category,
      brand: fill('brand', brandText),
      model: fill('model', text(r.model)),
      material: fill('material', r.material),
      finish: fill('finish', r.finish),
      primaryColor: fill('primaryColor', r.color),
      notes: fill('notes', r.notes),
    };
    if (nameIsAuto.current || !d.name.trim()) {
      nameIsAuto.current = true;
      next.name = autoName(next.brand, next.model) || d.name;
    }
    setDraft(next);
    setFormKey((k) => k + 1);
    const bits = [next.category, autoName(next.brand, next.model), next.material, next.finish].filter(Boolean);
    setIdentify({ state: 'done', summary: bits.join(' · '), unsure: r.confidence === 'low' || (!text(r.brand) && !!text(r.brandRead)) });
  }

  /** The demo: a bundled photo of three items with ready-made answers. Nothing is sent anywhere. */
  async function startDemo() {
    setPreparing(true);
    try {
      // Android release builds name bundled images by resource, which can't be opened as a file: copy it out first.
      const asset = Asset.fromModule(DEMO_PHOTO);
      await asset.downloadAsync();
      const stored = await savePhoto({ uri: asset.localUri ?? asset.uri, ...DEMO_SIZE });
      setNewPhotos((p) => [...p, stored]);
      set('imageUri', stored);
      setIsDemo(true);
      setPreparing(false);
      setIdentify({ state: 'working' });
      await new Promise((resolve) => setTimeout(resolve, 900)); // a moment to feel like a lookup
      applyIdentified(DEMO_ITEMS[0] as Identified);
      setBatch({ stored, items: DEMO_ITEMS, done: [], current: null });
      setPicking(true);
    } catch (e) {
      setIdentify({ state: 'idle' });
      Alert.alert('Demo', e instanceof Error ? e.message : 'Could not load the demo photo.');
    } finally {
      setPreparing(false);
    }
  }
  const demoStarted = useRef(false);
  useEffect(() => {
    if (demo && !item && !demoStarted.current) {
      demoStarted.current = true;
      void startDemo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick or take a photo, let the person frame it, then save it and identify.
  async function getPhoto(source: PhotoSource) {
    try {
      const picked = await pickPhoto(source);
      if (picked) setCropping(picked);
    } catch (e) {
      Alert.alert('Photo', e instanceof Error ? e.message : 'Could not get the photo.');
    }
  }

  async function usePhoto(photo: PickedPhoto, crop: PhotoCrop) {
    setCropping(null);
    setPreparing(true);
    try {
      const stored = await savePhoto(photo, crop);
      setNewPhotos((p) => [...p, stored]);
      set('imageUri', stored);
      void runIdentify(stored);
    } catch (e) {
      Alert.alert('Photo', e instanceof Error ? e.message : 'Could not save the photo.');
    } finally {
      setPreparing(false);
    }
  }

  async function save(finishNow = false) {
    const weight = weightText.trim() ? Number(weightText.replace(',', '.')) : null;
    if (weight != null && (!Number.isFinite(weight) || weight < 0)) {
      Alert.alert('Weight', 'Enter the weight in grams, like 85 or 85.5.');
      return;
    }
    const clean: GearDraft = {
      ...draft,
      name: draft.name.trim() || autoName(draft.brand, draft.model),
      brand: draft.brand?.trim() || null,
      model: draft.model?.trim() || null,
      material: draft.material?.trim() || null,
      finish: draft.finish?.trim() || null,
      notes: draft.notes?.trim() || null,
      weightGrams: weight,
    };
    setBusy(true);
    // A sample piece keeps its drawing when edited (older samples find it by name).
    if (item?.isSample && !clean.imageUri && !item.imageUri) clean.imageUri = `sample:${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const r = item ? await updateItem(item.id, clean) : await addItem(clean);
    setBusy(false);
    if (!r.ok) {
      Alert.alert('Not saved', r.error);
      return;
    }
    // More items left in this photo: start the next one instead of leaving.
    if (!finishNow && batch && batch.current !== null && !item && batch.done.length + 1 < batch.items.length) {
      for (const uri of newPhotos) if (uri !== clean.imageUri && uri !== batch.stored) deletePhoto(uri);
      setNewPhotos([batch.stored]);
      setBatch({ ...batch, done: [...batch.done, batch.current], current: null });
      setDraft({ ...EMPTY, category: defaultCategory ?? EMPTY.category });
      setWeightText('');
      setIdentify({ state: 'idle' });
      autoFields.current.clear();
      nameIsAuto.current = true;
      setMaterialOptions([]);
      setFormKey((k) => k + 1);
      success();
      setPicking(true);
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
  useEffect(() => {
    cancelRef.current = cancel;
  });

  function remove() {
    if (!item) return;
    Alert.alert(`Delete ${item.name}?`, 'It will be removed from your collection and any wheel it is locked in.', [
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
      {/* Header options stay the same on every render: rebuilding header buttons
          on each keystroke took focus away from the text fields on iOS. */}
      <Stack.Screen options={headerOptions.current} />
      <ItemPicker
        uri={picking && batch ? photoUri(batch.stored) : null}
        items={picking && batch ? batch.items : null}
        done={batch?.done ?? []}
        onCancel={() => {
          setPicking(false);
          // "Done" after adding some of the items: leave the screen.
          if (batch && batch.done.length > 0) cancel();
        }}
        onChoose={(i, d) => void chooseItem(i, d)}
      />
      <PhotoCropper photo={cropping} onCancel={() => setCropping(null)} onDone={(p, c) => void usePhoto(p, c)} />

      <View style={styles.photo}>
        <GearThumb item={{ name: draft.name || '?', imageUri: draft.imageUri, primaryColor: draft.primaryColor, isSample: item?.isSample && draft.imageUri === item.imageUri }} size={132} />
        <View style={styles.photoButtons}>
          <Button label="Take photo" icon="camera" variant={draft.imageUri ? 'secondary' : 'primary'} onPress={() => void getPhoto('camera')} style={styles.flex} />
          <Button label="Choose photo" icon="photo" variant="secondary" onPress={() => void getPhoto('library')} style={styles.flex} />
        </View>
        {draft.imageUri && !draft.imageUri.startsWith('sample:') ? (
          <View style={styles.photoButtons}>
            <Button label="Identify again" icon="sparkle" variant="ghost" onPress={() => void runIdentify(draft.imageUri!)} disabled={identify.state === 'working'} style={styles.flex} />
            <Button label="Remove photo" icon="close" variant="ghost" onPress={() => set('imageUri', null)} style={styles.flex} />
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {aiConsent === 'declined'
              ? 'Photo identify is off. You can turn it on in Settings.'
              : 'Start with a photo and EDC Roulette fills in the type, brand, model, material and color for you to check.'}
          </ThemedText>
        )}
        {isDemo ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Demo photo: the answers are ready-made and nothing was sent anywhere. Items you add are saved like any other.
          </ThemedText>
        ) : null}
        {!item && !draft.imageUri && !batch ? <Button label="Try the demo photo (3 items)" icon="sparkle" variant="ghost" onPress={() => void startDemo()} /> : null}
        {batch && batch.current !== null && !item && batch.items.length - batch.done.length > 1 ? (
          <Button label="Pick a different item from the photo" icon="swap" variant="ghost" onPress={() => setPicking(true)} />
        ) : null}
      </View>

      {preparing ? (
        <Card>
          <View style={styles.status}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText style={styles.flex}>Preparing your photo…</ThemedText>
          </View>
        </Card>
      ) : null}
      {identify.state === 'working' ? (
        <Card>
          <View style={styles.status}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText style={styles.flex}>Looking at your photo…</ThemedText>
          </View>
        </Card>
      ) : null}
      {identify.state === 'done' ? (
        <View style={[styles.banner, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
          <Icon name="sparkle" size={16} color={theme.accent} />
          <View style={styles.flex}>
            <ThemedText type="smallBold">{identify.summary || 'Nothing recognized'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {identify.unsure ? 'I’m not sure about the brand or model, so please check them.' : 'Filled in from your photo. Fix anything that’s off.'}
            </ThemedText>
          </View>
        </View>
      ) : null}
      {identify.state === 'failed' ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {identify.message} You can fill the details in yourself.
        </ThemedText>
      ) : null}

      <Field label="Category">
        <ChipGroup options={CATEGORIES} value={draft.category as (typeof CATEGORIES)[number]} onChange={(v) => v && set('category', v)} small />
      </Field>
      <Field label="Brand">
        <BrandPicker initial={draft.brand ?? ''} resetKey={formKey} category={draft.category} onChange={(b) => setBrandOrModel({ brand: b })} />
      </Field>
      <Field label="Model">
        <Input
          key={`model-${formKey}`}
          defaultValue={draft.model ?? ''}
          onChangeText={(t) => setBrandOrModel({ model: t || null })}
          placeholder="e.g. Para 3"
          maxLength={60}
          returnKeyType="done"
          autoCorrect={false}
        />
      </Field>
      <Field label="Name" hint="Fills in from the brand and model. Type your own if you like.">
        <Input
          key={`name-${formKey}`}
          defaultValue={draft.name}
          onChangeText={(t) => {
            nameIsAuto.current = false;
            set('name', t);
          }}
          placeholder="e.g. Spyderco Para 3"
          maxLength={80}
          returnKeyType="done"
          autoCorrect={false}
        />
      </Field>
      <Field label="Material">
        <ChoiceField key={`material-${formKey}`} options={MATERIALS} value={draft.material} onChange={(v) => set('material', v)} suggestions={materialOptions} otherPlaceholder="Type a material" />
      </Field>
      <Field label="Finish">
        <ChoiceField key={`finish-${formKey}`} options={FINISHES} value={draft.finish} onChange={(v) => set('finish', v)} otherPlaceholder="Type a finish" />
      </Field>
      <Field label="Color">
        <ColorPicker value={draft.primaryColor} onChange={(hex) => set('primaryColor', hex)} />
      </Field>
      <Field label="Weight (grams)">
        <Input defaultValue={weightText} onChangeText={setWeightText} placeholder="Optional" keyboardType="decimal-pad" maxLength={8} />
      </Field>
      <Field label="Notes">
        <Input key={`notes-${formKey}`} defaultValue={draft.notes ?? ''} onChangeText={(t) => set('notes', t || null)} placeholder="Optional" multiline maxLength={1000} style={styles.notes} />
      </Field>

      <Button label={item ? 'Save changes' : leftAfter > 0 ? `Add, then next item (${leftAfter} left)` : batch && batch.done.length > 0 ? 'Add and finish' : 'Add to collection'} onPress={() => void save()} disabled={!canSave} busy={busy} />
      {leftAfter > 0 ? <Button label="Add and finish" variant="secondary" onPress={() => void save(true)} disabled={!canSave || busy} /> : null}
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
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  photo: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  photoButtons: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth },
  notes: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
});
