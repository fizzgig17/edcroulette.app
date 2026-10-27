import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Buffer } from 'buffer';
import { File, Paths } from 'expo-file-system';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { areaOf, blurAreasInPhoto } from '@/lib/blur-items';
import { findItemsOnDevice, refineItems } from '@/lib/refine-outline';
import { lastMaskProblem, prepareFinder } from '@/lib/subject-mask';
import { BrandPicker } from '@/components/brand-picker';
import { ColorPicker } from '@/components/color-picker';
import { GearThumb } from '@/components/gear-thumb';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/chip';
import { ChoiceField } from '@/components/ui/choice-field';
import { PickRow, PickSheet } from '@/components/ui/pick-sheet';
import { Card, Field, Input } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ensureAiConsent } from '@/lib/ai-consent';
import { IS_DEV_BUILD } from '@/lib/env';
import { identifyPhoto, type Identified } from '@/lib/api';
import { DEMO_ITEMS, DEMO_SIZE } from '@/content/demo-photo';
import { DEMO_PHOTO_BASE64 } from '@/content/demo-photo-data';
import { useGear } from '@/lib/gear';
import { success } from '@/lib/haptics';
import { PhotoFlow } from '@/components/photo-flow';
import { deletePhoto, photoBase64, photoSize, photoUri, pickPhoto, savePhoto, type PhotoCrop, type PickedPhoto, type PhotoSource } from '@/lib/photos';
import { useAiConsent, usePhotoStyle } from '@/lib/preferences';
import { getCategories, useCategories } from '@/lib/categories';
import { log, logError } from '@/lib/log';
import { FINISHES, MATERIALS, type GearDraft, type GearItem } from '@/types/models';

const EMPTY: GearDraft = { name: '', brand: null, model: null, category: 'Knife', material: null, finish: null, primaryColor: null, weightGrams: null, notes: null, imageUri: null };

type Identify = { state: 'idle' } | { state: 'working' } | { state: 'done'; summary: string; unsure: boolean } | { state: 'failed'; message: string };

const autoName = (brand: string | null, model: string | null) => [brand?.trim(), model?.trim()].filter(Boolean).join(' ');

/** Add (no `item`) or edit (`item`) a piece of gear. A photo fills in most of the details. */
export function GearForm({ item, defaultCategory, demo }: { item?: GearItem; defaultCategory?: string; demo?: boolean }) {
  const theme = useTheme();
  const { addItem, updateItem, removeItem } = useGear();
  const aiConsent = useAiConsent();
  const defaultPhotoStyle = usePhotoStyle();
  const turnCutout = (by: number, reset = false) => {
    setDraft((d) => {
      if (!d.cutout) return d;
      const t = reset ? 0 : (((d.cutout.turn + by) % 360) + 360) % 360;
      return { ...d, cutout: { ...d.cutout, turn: t > 180 ? t - 360 : t } };
    });
    log('photo.cutout.turn', { reset });
  };
  const categories = useCategories();
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const [draft, setDraft] = useState<GearDraft>(() => {
    if (item) return { ...item };
    // A new piece starts in the category you came from, or the first one you have.
    const start = defaultCategory ?? EMPTY.category;
    return { ...EMPTY, category: getCategories().includes(start) ? start : (getCategories()[0] ?? 'Other') };
  });
  const categoryOptions = useMemo(() => (categories.includes(draft.category) ? categories : [...categories, draft.category]), [categories, draft.category]);
  const [weightText, setWeightText] = useState(item?.weightGrams != null ? String(item.weightGrams) : '');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [materialOptions, setMaterialOptions] = useState<string[]>([]);
  // A photo with several items is added one at a time: `done` are the ones already added, `current` the one in the form.
  const [batch, setBatch] = useState<{ stored: string; items: Identified[]; done: number[]; current: number | null } | null>(null);
  const [picking, setPicking] = useState(false);
  // Which pick-list is open over the form, and a counter that scrolls the form back to the top (when the photo steps finish).
  const [sheet, setSheet] = useState<null | 'category' | 'material' | 'finish' | 'color' | 'look'>(null);
  const [topTick, setTopTick] = useState(0);
  const [isDemo, setIsDemo] = useState(false);
  const [cropping, setCropping] = useState<PickedPhoto | null>(null);
  // The framed photo while its items are being found (the photo window stays open, so there is no hop back to the form).
  const [finding, setFinding] = useState<{ uri: string | null } | null>(null);
  const busyPhoto = picking || !!finding || !!cropping || preparing;
  useEffect(() => {
    // Back on the form after any photo step (cropping, finding, choosing an item): start at the top.
    if (!busyPhoto) setTopTick((t) => t + 1);
  }, [busyPhoto]);
  // Bumped to abandon a lookup that is under way (Cancel while it works).
  const lookup = useRef(0);
  const [identify, setIdentify] = useState<Identify>({ state: 'idle' });
  // Text fields keep their own text (so typing is never interrupted); this number
  // replaces what they show when the form is filled in from the photo.
  const [formKey, setFormKey] = useState(0);
  // Bumped when the name follows brand/model, so only the Name box is rebuilt (rebuilding the box being typed in closes the keyboard).
  const [nameKey, setNameKey] = useState(0);
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
    if (nameIsAuto.current && name !== draftRef.current.name) setNameKey((k) => k + 1);
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

  /**
   * Step one for a new photo, with no AI: the phone's own object finder looks for separate items. Two or more, and the person
   * taps the one they mean; the AI only sees that item afterwards. Fewer than two, and it carries on as before.
   */
  async function startLookup(stored: string) {
    const token = (lookup.current += 1);
    const stale = () => lookup.current !== token;
    setFinding({ uri: photoUri(stored) });
    let found: Identified[] = [];
    try {
      found = await findItemsOnDevice(stored);
    } catch (e) {
      if (IS_DEV_BUILD) Alert.alert('Object finder', e instanceof Error ? e.message : String(e));
    }
    if (stale()) return;
    log('photo.lookup', { found: found.length });
    // One clean object: it can be shown cut out right away (the photo is already framed on it).
    if (found.length === 1 && found[0]?.outline) setDraft((d) => (d.imageUri === stored ? { ...d, cutout: { outline: found[0]!.outline as [number, number][], turn: 0 } } : d));
    if (found.length > 1) {
      setBatch({ stored, items: found, done: [], current: null });
      setPicking(true);
      setFinding(null);
      return;
    }
    if (IS_DEV_BUILD && lastMaskProblem) Alert.alert('Object finder', lastMaskProblem);
    // Nothing to choose between on the phone: identify the whole photo (the AI may still see several items).
    await runIdentify(stored);
  }

  /** Sends the photo to the AI. `own` = the form's own window (the person is already back on the add screen), `picker` = may open the item picker. */
  async function runIdentify(stored: string, opts: { own?: boolean; picker?: boolean } = {}) {
    const own = opts.own ?? false;
    const allowPicker = opts.picker ?? true;
    const token = (lookup.current += 1);
    const stale = () => lookup.current !== token;
    if (!own) setFinding({ uri: photoUri(stored) });
    try {
      if (!(await ensureAiConsent('photo'))) {
        log('photo.identify.skipped', 'ai off');
        if (!stale()) setIdentify({ state: 'idle' });
        return;
      }
      if (stale()) return;
      setIdentify({ state: 'working' });
      const b64 = await photoBase64(stored);
      if (stale()) return;
      if (!b64) {
        setIdentify({ state: 'failed', message: 'Could not read the photo.' });
        return;
      }
      const r = await identifyPhoto(b64);
      if (stale()) return;
      if (!r.ok) {
        // Dev builds show why, so a failure can be traced.
        setIdentify({ state: 'failed', message: IS_DEV_BUILD && r.detail ? `${r.error} (${r.detail})` : r.error });
        return;
      }
      applyIdentified(r);
      // Several items in the photo: let the person pick which one they mean, in the same window.
      if (allowPicker && r.items && r.items.length > 1) {
        // Tighten the rough outlines against the real picture (keeps the rough ones if that fails).
        let items = r.items;
        try {
          items = await refineItems(stored, items);
        } catch (e) {
          // The rough outlines still work. Dev builds say why.
          if (IS_DEV_BUILD) Alert.alert('Outline', e instanceof Error ? e.message : String(e));
        }
        if (stale()) return;
        setBatch({ stored, items, done: [], current: null });
        setPicking(true);
      }
    } finally {
      if (!own && !stale()) setFinding(null);
    }
  }

  /** Cancel while the items are being found: back to the form with the photo, nothing filled in. */
  function cancelLookup() {
    log('photo.lookup.cancel');
    lookup.current += 1;
    setFinding(null);
    setIdentify({ state: 'idle' });
  }

  /** The photo of just one item from a multi-item photo: cropped, with the others blurred. Made once, then kept. */
  const crops = useRef(new Map<number, Promise<string | null>>());
  // Each item's outline in its own cropped photo (for showing it cut out), made along with the crop.
  const cropOutlines = useRef(new Map<number, [number, number][] | null>());
  function cropFor(index: number, dims: { width: number; height: number }): Promise<string | null> {
    const c = batch;
    const it = c?.items[index];
    const uri = c ? photoUri(c.stored) : null;
    if (!c || !it || !it.box || !uri) return Promise.resolve(null);
    const cached = crops.current.get(index);
    if (cached) return cached;
    const job = (async () => {
      // Work in the photo's real pixels, not the size the picture on screen reported.
      dims = (await photoSize(c.stored)) ?? dims;
      const { x, y, w, h } = it.box!;
      const size = Math.min(Math.min(dims.width, dims.height), Math.max(w * dims.width, h * dims.height) * 1.15);
      const crop = { originX: (x + w / 2) * dims.width - size / 2, originY: (y + h / 2) * dims.height - size / 2, size };
      const stored = await savePhoto({ uri, width: dims.width, height: dims.height }, crop, 720);
      // Where the crop really landed (it can't hang over the photo's edge), to move the outline into the cropped photo.
      const cs = Math.max(1, Math.round(Math.min(crop.size, dims.width, dims.height)));
      const cx = Math.max(0, Math.min(dims.width - cs, Math.round(crop.originX)));
      const cy = Math.max(0, Math.min(dims.height - cs, Math.round(crop.originY)));
      cropOutlines.current.set(index, it.outline && it.tight && it.outlineSource === 'object finder' ? it.outline.map(([ox, oy]) => [(ox * dims.width - cx) / cs, (oy * dims.height - cy) / cs] as [number, number]) : null);
      setNewPhotos((p) => [...p, stored]);
      // The other items are blurred (the background stays sharp), before the photo is shown,
      // or a copy already on screen would stay as it was.
      try {
        const others = c.items.map((o, i) => (i === index ? null : areaOf(o))).filter((a): a is [number, number][] => !!a);
        await blurAreasInPhoto(stored, others, areaOf(it), dims, crop);
      } catch (e) {
        // The photo is still fine without it. Dev builds say why.
        if (IS_DEV_BUILD) Alert.alert('Blur', e instanceof Error ? e.message : String(e));
      }
      return stored;
    })().catch(() => null);
    crops.current.set(index, job);
    return job;
  }

  /** The person tapped an item: fill in its details and keep just that item in the photo. */
  async function chooseItem(index: number, dims: { width: number; height: number }, from?: NonNullable<typeof batch>) {
    const c = from ?? batch;
    log('photo.choose', { index: index + 1, of: c?.items.length, local: !!c?.items[index]?.local });
    setPicking(false);
    const it = c?.items[index];
    if (!c || !it) return;
    setBatch({ ...c, current: index });
    // Items the AI described come with their details; ones found on the phone are described by the AI now, from just that item.
    if (!it.local) applyIdentified(it);
    else setIdentify({ state: 'idle' });
    setPreparing(true);
    // Don't show the whole photo while the item's own (blurred) one is made; it would flash clear first.
    set('imageUri', null);
    let own: string = c.stored;
    try {
      own = (await cropFor(index, dims)) ?? c.stored;
      const outline = own === c.stored ? null : (cropOutlines.current.get(index) ?? null);
      setDraft((d) => ({ ...d, imageUri: own, cutout: outline ? { outline, turn: 0 } : null, photoStyle: null }));
      log('photo.cutout', { has: !!outline });
    } finally {
      setPreparing(false);
    }
    if (it.local) void runIdentify(own, { own: true, picker: false });
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
      // The photo check names one of the built-in categories; if the person removed it, it goes under Other.
      category: categoriesRef.current.includes(r.category) ? r.category : 'Other',
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
      // Android release builds name bundled images by resource, which can't be opened as a file,
      // so the demo photo is written out as a real file first.
      const file = new File(Paths.cache, 'demo-photo.jpg');
      if (!file.exists) file.create();
      file.write(new Uint8Array(Buffer.from(DEMO_PHOTO_BASE64, 'base64')));
      const stored = await savePhoto({ uri: file.uri, ...DEMO_SIZE });
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
  // New entries: get the object finder ready now (Android downloads its model the first time).
  useEffect(() => {
    if (!item) prepareFinder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      log('photo.pick', { source, got: !!picked, w: picked?.width, h: picked?.height });
      if (picked) setCropping(picked);
    } catch (e) {
      logError('photo.pick.fail', e);
      Alert.alert('Photo', e instanceof Error ? e.message : 'Could not get the photo.');
    }
  }

  async function usePhoto(photo: PickedPhoto, crop: PhotoCrop) {
    setCropping(null);
    log('photo.framed', { replacing: !!item });
    // Replacing the photo of a piece already in the collection: no object finding, just the new photo (and the AI, if allowed).
    if (item) {
      setPreparing(true);
      try {
        const stored = await savePhoto(photo, crop);
        setNewPhotos((p) => [...p, stored]);
        setDraft((d) => ({ ...d, imageUri: stored, cutout: null, photoStyle: null }));
        void runIdentify(stored, { own: true, picker: false });
      } catch (e) {
        Alert.alert('Photo', e instanceof Error ? e.message : 'Could not save the photo.');
      } finally {
        setPreparing(false);
      }
      return;
    }
    // A new piece: the same window carries on, from framing straight to looking for items.
    setBatch(null);
    crops.current.clear();
    setFinding({ uri: null });
    const token = (lookup.current += 1);
    setPreparing(true);
    try {
      const stored = await savePhoto(photo, crop);
      log('photo.saved');
      if (lookup.current !== token) {
        deletePhoto(stored);
        return;
      }
      setNewPhotos((p) => [...p, stored]);
      setDraft((d) => ({ ...d, imageUri: stored, cutout: null, photoStyle: null }));
      void startLookup(stored);
    } catch (e) {
      logError('photo.save.fail', e);
      setFinding(null);
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
    log('form.save', { mode: item ? 'edit' : 'new', photo: !!clean.imageUri, batch: batch ? `${batch.done.length + 1}/${batch.items.length}` : undefined });
    setBusy(true);
    // A sample piece keeps its drawing when edited (older samples find it by name).
    if (item?.isSample && !clean.imageUri && !item.imageUri) clean.imageUri = `sample:${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    // The demo never saves anything.
    const r = isDemo && !item ? ({ ok: true } as const) : item ? await updateItem(item.id, clean) : await addItem(clean);
    setBusy(false);
    if (!r.ok) {
      Alert.alert('Not saved', r.error);
      return;
    }
    // More items left in this photo: start the next one instead of leaving.
    if (!finishNow && batch && batch.current !== null && !item && batch.done.length + 1 < batch.items.length) {
      for (const uri of newPhotos) if ((isDemo || uri !== clean.imageUri) && uri !== batch.stored) deletePhoto(uri);
      setNewPhotos([batch.stored]);
      crops.current.clear();
      const nextBatch = { ...batch, done: [...batch.done, batch.current], current: null };
      setBatch(nextBatch);
      setDraft({ ...EMPTY, category: defaultCategory ?? EMPTY.category });
      setWeightText('');
      setIdentify({ state: 'idle' });
      autoFields.current.clear();
      nameIsAuto.current = true;
      setMaterialOptions([]);
      setFormKey((k) => k + 1);
      success();
      // Only one item left in the photo: no need to ask, take it.
      const remaining = nextBatch.items.map((_, i) => i).filter((i) => !nextBatch.done.includes(i));
      if (remaining.length === 1) void chooseItem(remaining[0]!, { width: 1, height: 1 }, nextBatch);
      else setPicking(true);
      return;
    }
    for (const uri of newPhotos) if (isDemo || uri !== clean.imageUri) deletePhoto(uri);
    success();
    router.back();
  }

  function cancel() {
    log('form.leave');
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
    <Screen title={item ? 'Edit gear' : 'Add gear'} showTitle={false} topSignal={topTick}>
      {/* Header options stay the same on every render: rebuilding header buttons
          on each keystroke took focus away from the text fields on iOS. */}
      <Stack.Screen options={headerOptions.current} />
      <PhotoFlow
        cropping={cropping}
        onCropCancel={() => setCropping(null)}
        onCropDone={(p, c) => void usePhoto(p, c)}
        finding={finding}
        onFindCancel={cancelLookup}
        pick={
          picking && batch && photoUri(batch.stored)
            ? {
                uri: photoUri(batch.stored)!,
                items: batch.items,
                done: batch.done,
                // Cancel: back on the add screen with the photo. "Done" after adding some of the items: leave the screen.
                onCancel: () => {
                  log('photo.pick.cancel', { added: batch.done.length });
                  setPicking(false);
                  if (batch.done.length > 0) cancel();
                },
                // Use the entire photo: back on the add screen, and the AI (if allowed) looks at the whole photo.
                onUseWhole: () => {
                  log('photo.useWhole');
                  setPicking(false);
                  if (batch.items[0]?.local) void runIdentify(batch.stored, { own: true, picker: false });
                },
                onChoose: (i, d) => void chooseItem(i, d),
                onPreview: (i, d) => void cropFor(i, d),
              }
            : null
        }
      />

      <View style={styles.photoRow}>
        <GearThumb item={{ name: draft.name || '?', imageUri: draft.imageUri, primaryColor: draft.primaryColor, isSample: item?.isSample && draft.imageUri === item.imageUri, cutout: draft.cutout, photoStyle: draft.photoStyle }} size={112} />
        <View style={styles.photoSide}>
          <Button label={draft.imageUri ? 'Retake' : 'Take photo'} icon="camera" variant={draft.imageUri ? 'secondary' : 'primary'} onPress={() => void getPhoto('camera')} />
          <Button label="Choose photo" icon="photo" variant="secondary" onPress={() => void getPhoto('library')} />
        </View>
      </View>
      <View style={styles.links}>
        {draft.imageUri && !draft.imageUri.startsWith('sample:') && aiConsent !== 'declined' ? <TextLink label="Identify again" onPress={() => void runIdentify(draft.imageUri!, { own: true, picker: false })} disabled={identify.state === 'working'} /> : null}
        {draft.cutout && draft.imageUri && !draft.imageUri.startsWith('sample:') ? <TextLink label="Photo look" onPress={() => setSheet('look')} /> : null}
        {batch && batch.current === null && !item && !picking && !!draft.imageUri && draft.imageUri === batch.stored && batch.items.length > 1 ? <TextLink label="Find items again" onPress={() => setPicking(true)} /> : null}
        {batch && batch.current !== null && !item && !!draft.imageUri && batch.items.length - batch.done.length > 1 ? <TextLink label="Different item" onPress={() => setPicking(true)} /> : null}
        {draft.imageUri && !draft.imageUri.startsWith('sample:') ? <TextLink label="Remove photo" onPress={() => setDraft((d) => ({ ...d, imageUri: null, cutout: null, photoStyle: null }))} /> : null}
        {!item && !draft.imageUri && !batch ? <TextLink label="Try the demo photo" onPress={() => void startDemo()} /> : null}
      </View>
      {!draft.imageUri ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {aiConsent === 'declined' ? 'Photo identify is off. You can turn it on in Settings.' : 'A photo fills in the details for you to check.'}
        </ThemedText>
      ) : null}
      {isDemo ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Demo photo: nothing is sent anywhere or saved.
        </ThemedText>
      ) : null}

      {preparing || identify.state === 'working' ? (
        <View style={styles.status}>
          <ActivityIndicator color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {preparing ? 'Preparing your photo…' : 'Looking at your photo…'}
          </ThemedText>
        </View>
      ) : null}
      {identify.state === 'done' ? (
        <View style={[styles.banner, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
          <Icon name="sparkle" size={16} color={theme.accent} />
          <View style={styles.flex}>
            <ThemedText type="smallBold">{identify.summary || 'Nothing recognized'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {identify.unsure ? 'Not sure about the brand or model, so please check them.' : 'Filled in from your photo. Fix anything that’s off.'}
            </ThemedText>
          </View>
        </View>
      ) : null}
      {identify.state === 'failed' ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {identify.message} You can fill the details in yourself.
        </ThemedText>
      ) : null}

      <View style={styles.pair}>
        <View style={styles.half}>
          <Field label="Category">
            <PickRow label="Category" value={draft.category} onPress={() => setSheet('category')} />
          </Field>
        </View>
        <View style={styles.half}>
          <Field label="Brand">
            <BrandPicker initial={draft.brand ?? ''} resetKey={formKey} category={draft.category} onChange={(b) => setBrandOrModel({ brand: b })} />
          </Field>
        </View>
      </View>
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
      <Field label="Name" hint="Follows the brand and model unless you type your own.">
        <Input
          key={`name-${formKey}-${nameKey}`}
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
      <View style={styles.pair}>
        <View style={styles.half}>
          <Field label="Material">
            <PickRow label="Material" value={draft.material} placeholder="Optional" onPress={() => setSheet('material')} />
          </Field>
        </View>
        <View style={styles.half}>
          <Field label="Finish">
            <PickRow label="Finish" value={draft.finish} placeholder="Optional" onPress={() => setSheet('finish')} />
          </Field>
        </View>
      </View>
      <View style={styles.pair}>
        <View style={styles.half}>
          <Field label="Color">
            <PickRow label="Color" value={draft.primaryColor} swatch={draft.primaryColor} placeholder="Optional" onPress={() => setSheet('color')} />
          </Field>
        </View>
        <View style={styles.half}>
          <Field label="Weight (grams)">
            <Input defaultValue={weightText} onChangeText={setWeightText} placeholder="Optional" keyboardType="decimal-pad" maxLength={8} />
          </Field>
        </View>
      </View>
      <Field label="Notes">
        <Input key={`notes-${formKey}`} defaultValue={draft.notes ?? ''} onChangeText={(t) => set('notes', t || null)} placeholder="Optional" multiline maxLength={1000} style={styles.notes} />
      </Field>

      <PickSheet visible={sheet === 'category'} title="Category" onClose={() => setSheet(null)}>
        <ChipGroup options={categoryOptions} value={draft.category} onChange={(v) => { if (v) set('category', v); setSheet(null); }} small />
      </PickSheet>
      <PickSheet visible={sheet === 'material'} title="Material" onClose={() => setSheet(null)}>
        <ChoiceField key={`material-${formKey}`} options={MATERIALS} value={draft.material} onChange={(v) => set('material', v)} onPick={() => setSheet(null)} suggestions={materialOptions} otherPlaceholder="Type a material" />
      </PickSheet>
      <PickSheet visible={sheet === 'finish'} title="Finish" onClose={() => setSheet(null)}>
        <ChoiceField key={`finish-${formKey}`} options={FINISHES} value={draft.finish} onChange={(v) => set('finish', v)} onPick={() => setSheet(null)} otherPlaceholder="Type a finish" />
      </PickSheet>
      <PickSheet visible={sheet === 'color'} title="Color" onClose={() => setSheet(null)}>
        <ColorPicker value={draft.primaryColor} onChange={(hex) => set('primaryColor', hex)} onPick={() => setSheet(null)} />
      </PickSheet>
      <PickSheet visible={sheet === 'look'} title="Photo look" onClose={() => setSheet(null)}>
        <View style={styles.lookPreview}>
          <GearThumb item={{ name: draft.name || '?', imageUri: draft.imageUri, primaryColor: draft.primaryColor, cutout: draft.cutout, photoStyle: draft.photoStyle }} size={160} />
        </View>
        <ChipGroup
          options={STYLE_LABELS}
          value={draft.photoStyle === 'original' ? 'Original' : draft.photoStyle === 'cutout' ? 'Cutout' : 'Default'}
          onChange={(v) => v && setDraft((d) => ({ ...d, photoStyle: v === 'Original' ? 'original' : v === 'Cutout' ? 'cutout' : null }))}
        />
        {(draft.photoStyle ?? defaultPhotoStyle) === 'cutout' ? (
          <View style={styles.photoButtons}>
            <Button label="Turn left" variant="secondary" onPress={() => turnCutout(-15)} style={styles.flex} />
            <Button label="Turn right" variant="secondary" onPress={() => turnCutout(15)} style={styles.flex} />
            <Button label="Reset" variant="ghost" onPress={() => turnCutout(0, true)} style={styles.flex} />
          </View>
        ) : null}
      </PickSheet>

      <Button
        label={
          item
            ? 'Save changes'
            : isDemo
              ? leftAfter > 0 ? `Next item (${leftAfter} left)` : 'Finish demo'
              : leftAfter > 0 ? `Add, then next item (${leftAfter} left)` : batch && batch.done.length > 0 ? 'Add and finish' : 'Add to collection'
        }
        onPress={() => void save()}
        disabled={!canSave}
        busy={busy}
      />
      {leftAfter > 0 ? <Button label={isDemo ? 'Finish demo' : 'Add and finish'} variant="secondary" onPress={() => void save(true)} disabled={!canSave || busy} /> : null}
      {item ? <Button label="Delete" variant="danger" icon="trash" onPress={remove} /> : null}
      <View style={{ height: Spacing.four, backgroundColor: theme.background }} />
    </Screen>
  );
}

function TextLink({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityRole="button" style={{ opacity: disabled ? 0.4 : 1 }}>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
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

const STYLE_LABELS = ['Default', 'Original', 'Cutout'] as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  photoSide: { flex: 1, gap: Spacing.two },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Spacing.four, rowGap: Spacing.two },
  pair: { flexDirection: 'row', gap: Spacing.three },
  half: { flex: 1 },
  lookPreview: { alignItems: 'center' },
  photoButtons: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth },
  notes: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
});
