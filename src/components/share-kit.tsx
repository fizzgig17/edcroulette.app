/**
 * Share kit: turns a set of gear pieces into a picture card (dark, with the
 * person's chosen metal across the top) and hands it to the phone's share sheet.
 * "Today's carry" is the default; "Choose pieces" lets the person build it by
 * hand from the whole collection. The card is drawn and saved on the phone and
 * goes only where the person sends it from the share sheet.
 */
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { GearThumb } from '@/components/gear-thumb';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { metalById } from '@/constants/metals';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { select, warn } from '@/lib/haptics';
import { useMetalId } from '@/lib/preferences';
import type { GearItem } from '@/types/models';

const MAX_PIECES = 6;
const PAD = 18;
const GAP = 8;
const GRID_TOP = 96;
const GRID_H = 296; // room for the tiles between the title and the footer
// The card is laid out at 360 x 450 and saved at three times that (1080 x 1350, the 4:5 feed size).
const W = 360;
const H = 450;

/** Card text never follows the phone's text size: the picture is always laid out the same. */
const T = (props: TextProps) => <Text allowFontScaling={false} {...props} />;

/** Columns and photo size that fill the card for however many pieces there are. */
function layoutFor(n: number) {
  const cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const tileW = (W - 2 * PAD - GAP * (cols - 1)) / cols;
  const textH = 56;
  const rowH = (GRID_H - GAP * (rows - 1)) / rows;
  const photo = Math.max(40, Math.min(tileW - 14, rowH - 14 - textH, 120));
  return { cols, photo };
}

function ShareCard({ pieces }: { pieces: GearItem[] }) {
  const metal = metalById(useMetalId());
  const { cols, photo } = layoutFor(pieces.length);
  const rows: GearItem[][] = [];
  for (let i = 0; i < pieces.length; i += cols) rows.push(pieces.slice(i, i + cols));
  const edge = `${metal.line}59`;
  return (
    <View style={card.root} collapsable={false}>
      <Image source={metal.texture} style={card.band} resizeMode="cover" />
      <View style={card.bandFade} />
      <View style={card.brand}>
        <Image source={require('../../assets/images/icons/mixed.png')} style={card.icon} />
        <T style={card.brandName}>EDC ROULETTE</T>
      </View>
      <View style={card.titleBox}>
        <T style={card.title} numberOfLines={1} adjustsFontSizeToFit>TODAY'S CARRY</T>
      </View>
      <View style={card.grid}>
        {rows.map((row, r) => (
          <View key={r} style={card.row}>
            {row.map((g) => (
              <View key={g.id} style={[card.tile, { borderColor: edge }]}>
                <View style={[card.photo, { width: photo, height: photo, borderRadius: photo * 0.2 }]}>
                  <View style={{ transform: [{ scale: 1.16 }] }}>
                    <GearThumb item={g} size={photo} />
                  </View>
                </View>
                <T style={[card.cat, { color: metal.line }]} numberOfLines={1}>{g.category.toUpperCase()}</T>
                <T style={card.name} numberOfLines={2}>{g.name}</T>
                <T style={card.detail} numberOfLines={1}>{[g.material, g.finish].filter(Boolean).join(' · ') || ' '}</T>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={[card.foot, { borderTopColor: edge }]}>
        <T style={card.footL}>Spin your own kit</T>
        <T style={card.footR}>edcroulette.app</T>
      </View>
    </View>
  );
}

export function ShareKitButton({ todays }: { todays: GearItem[] }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') return null;
  return (
    <>
      <Button label="Share kit" icon="share" variant="secondary" onPress={() => setOpen(true)} />
      {open ? <ShareKitSheet todays={todays} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ShareKitSheet({ todays, onClose }: { todays: GearItem[]; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { items } = useGear();
  const cardRef = useRef<View>(null);
  const [manual, setManual] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(false);
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pieces = manual ? chosen.map((id) => items.find((g) => g.id === id)).filter((g): g is GearItem => !!g) : todays.slice(0, MAX_PIECES);
  const byCategory = useMemo(() => {
    const map = new Map<string, GearItem[]>();
    for (const g of items) map.set(g.category, [...(map.get(g.category) ?? []), g]);
    return [...map.entries()];
  }, [items]);

  const toggle = (id: string) => {
    if (!chosen.includes(id) && chosen.length >= MAX_PIECES) {
      warn();
      setLimit(true);
      if (limitTimer.current) clearTimeout(limitTimer.current);
      limitTimer.current = setTimeout(() => setLimit(false), 3000);
      return;
    }
    select();
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  };
  const startManual = () => {
    setChosen(todays.map((g) => g.id).slice(0, MAX_PIECES));
    setManual(true);
    setExpanded(true);
  };

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, width: W * 3, height: H * 3, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: "Share today's carry" });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make the card.');
    } finally {
      setBusy(false);
    }
  };

  const summary = chosen.length === 0 ? 'None picked yet' : `${chosen.length} of ${MAX_PIECES} picked`;
  const names = pieces.map((g) => g.name).join(', ');

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[sheet.root, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={sheet.head}>
          <ThemedText type="heading">Share your kit</ThemedText>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={[sheet.close, { backgroundColor: theme.backgroundElement }]}>
            <Icon name="close" size={18} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[sheet.body, { paddingBottom: insets.bottom + 48 }]}>
          <View style={sheet.preview}>
            {pieces.length > 0 ? (
              <View ref={cardRef} collapsable={false} style={{ width: W, height: H }}>
                <ShareCard pieces={pieces} />
              </View>
            ) : (
              <View style={[sheet.empty, { borderColor: theme.border }]}>
                <ThemedText themeColor="textSecondary">Pick at least one piece below.</ThemedText>
              </View>
            )}
          </View>
          {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
          <Button label="Share picture" icon="share" busy={busy} disabled={pieces.length === 0} onPress={() => void share()} />
          {!manual ? (
            <Button label="Choose pieces" icon="list" variant="secondary" onPress={startManual} />
          ) : (
            <View style={[sheet.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Pressable
                onPress={() => setExpanded((e) => !e)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`Your own kit, ${summary}`}
                style={sheet.panelHead}>
                <View style={sheet.flex}>
                  <ThemedText type="smallBold">Your own kit · {summary}</ThemedText>
                  {!expanded && chosen.length > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{names}</ThemedText>
                  ) : null}
                </View>
                <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
                  <Icon name="chevron" size={16} color={theme.textSecondary} />
                </View>
              </Pressable>
              {expanded ? (
                <View style={sheet.panelBody}>
                  {limit ? (
                    <View style={[sheet.note, { backgroundColor: theme.backgroundElement }]}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Six is the most that fit on a card. Untick one to add another.
                      </ThemedText>
                    </View>
                  ) : null}
                  {byCategory.map(([cat, list]) => (
                    <View key={cat} style={sheet.group}>
                      <ThemedText type="caption" themeColor="textSecondary" style={sheet.caps}>{cat}</ThemedText>
                      {list.map((g) => {
                        const on = chosen.includes(g.id);
                        return (
                          <Pressable
                            key={g.id}
                            onPress={() => toggle(g.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            style={[sheet.pick, { backgroundColor: theme.background, borderColor: on ? theme.accent : theme.border }]}>
                            <GearThumb item={g} size={36} />
                            <ThemedText numberOfLines={1} style={sheet.pickName}>{g.name}</ThemedText>
                            {on ? <Icon name="check" size={18} color={theme.accent} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                  <Pressable onPress={() => { setManual(false); setChosen([]); }} accessibilityRole="button" hitSlop={8} style={sheet.reset}>
                    <ThemedText type="small" style={{ color: theme.accent }}>Use today's carry instead</ThemedText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const card = StyleSheet.create({
  root: { width: W, height: H, backgroundColor: '#14161A', overflow: 'hidden' },
  band: { position: 'absolute', left: 0, top: 0, width: W, height: 78 },
  bandFade: { position: 'absolute', left: 0, top: 0, width: W, height: 78, backgroundColor: 'rgba(20,22,26,0.45)' },
  brand: { position: 'absolute', left: PAD, top: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 28, height: 28, borderRadius: 7 },
  brandName: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', letterSpacing: 3 },
  titleBox: { position: 'absolute', left: PAD, right: PAD, top: 52 },
  title: { color: '#F2F3F5', fontSize: 34, fontWeight: '800', letterSpacing: 0.5, lineHeight: 38 },
  grid: { position: 'absolute', left: PAD, right: PAD, top: GRID_TOP, height: GRID_H, gap: GAP, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: GAP, justifyContent: 'center' },
  tile: { flex: 1, maxWidth: 200, backgroundColor: '#1D2025', borderWidth: 1, borderRadius: 10, padding: 7, alignItems: 'center' },
  photo: { backgroundColor: '#1D2025', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cat: { fontSize: 8, fontWeight: '600', letterSpacing: 1.4, marginTop: 6, alignSelf: 'flex-start' },
  name: { color: '#F2F3F5', fontSize: 11, fontWeight: '700', lineHeight: 13, marginTop: 1, height: 26, alignSelf: 'flex-start' },
  detail: { color: '#B9BEC6', fontSize: 8.5, marginTop: 2, alignSelf: 'flex-start' },
  foot: { position: 'absolute', left: PAD, right: PAD, bottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 8 },
  footL: { color: '#B9BEC6', fontSize: 10 },
  footR: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
});

const sheet = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  body: { padding: Spacing.three, gap: Spacing.two, maxWidth: 520, width: '100%', alignSelf: 'center' },
  preview: { alignItems: 'center' },
  empty: { width: W, height: 140, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, overflow: 'hidden' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  panelBody: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  note: { borderRadius: Radius.small, padding: 10 },
  group: { gap: 6 },
  caps: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1.5, borderRadius: Radius.medium, padding: 8 },
  pickName: { flex: 1, fontSize: 15 },
  reset: { alignSelf: 'center', paddingVertical: 6 },
});
