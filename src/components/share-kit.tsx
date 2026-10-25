/**
 * Share kit: turns a set of gear pieces into a picture card (dark, with the
 * person's chosen metal across the top) and hands it to the phone's share sheet.
 * "Today's carry" is the default; "Choose pieces" lets the person build it by
 * hand from the whole collection. The card is drawn and saved on the phone and
 * goes only where the person sends it from the share sheet.
 */
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { GearThumb } from '@/components/gear-thumb';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { metalById } from '@/constants/metals';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { useMetalId } from '@/lib/preferences';
import type { GearItem } from '@/types/models';

const MAX_PIECES = 6;
// The card is laid out at 360 x 450 and saved at three times that (1080 x 1350, the 4:5 feed size).
const W = 360;
const H = 450;

function ShareCard({ pieces }: { pieces: GearItem[] }) {
  const metal = metalById(useMetalId());
  const rows: GearItem[][] = [];
  for (let i = 0; i < pieces.length; i += 3) rows.push(pieces.slice(i, i + 3));
  return (
    <View style={card.root} collapsable={false}>
      <Image source={metal.texture} style={card.band} resizeMode="cover" />
      <View style={card.bandFade} />
      <View style={card.brand}>
        <Image source={require('../../assets/images/icons/mixed.png')} style={card.icon} />
        <Text style={card.brandName}>EDC ROULETTE</Text>
      </View>
      <View style={card.titleBox}>
        <Text style={card.title}>TODAY'S CARRY</Text>
        <Text style={card.sub}>{pieces.length === 1 ? 'One piece' : `${pieces.length} pieces`}, spun at random</Text>
      </View>
      <View style={card.grid}>
        {rows.map((row, r) => (
          <View key={r} style={card.row}>
            {row.map((g) => (
              <View key={g.id} style={card.tile}>
                <View style={card.photo}>
                  <GearThumb item={g} size={84} />
                </View>
                <Text style={card.cat} numberOfLines={1}>{g.category.toUpperCase()}</Text>
                <Text style={card.name} numberOfLines={2}>{g.name}</Text>
                <Text style={card.detail} numberOfLines={1}>{[g.material, g.finish].filter(Boolean).join(' · ') || ' '}</Text>
              </View>
            ))}
            {row.length < 3 ? Array.from({ length: 3 - row.length }, (_, i) => <View key={`s${i}`} style={card.spacer} />) : null}
          </View>
        ))}
      </View>
      <View style={card.foot}>
        <Text style={card.footL}>Spin your own kit</Text>
        <Text style={card.footR}>edcroulette.app</Text>
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
  const { items } = useGear();
  const cardRef = useRef<View>(null);
  const [manual, setManual] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pieces = manual ? chosen.map((id) => items.find((g) => g.id === id)).filter((g): g is GearItem => !!g) : todays.slice(0, MAX_PIECES);
  const byCategory = useMemo(() => {
    const map = new Map<string, GearItem[]>();
    for (const g of items) map.set(g.category, [...(map.get(g.category) ?? []), g]);
    return [...map.entries()];
  }, [items]);

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_PIECES ? c : [...c, id]));
  const startManual = () => {
    setChosen(todays.map((g) => g.id).slice(0, MAX_PIECES));
    setManual(true);
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

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[sheet.root, { backgroundColor: theme.background }]}>
        <View style={sheet.head}>
          <ThemedText type="heading">Share your kit</ThemedText>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={[sheet.close, { backgroundColor: theme.backgroundElement }]}>
            <Icon name="close" size={18} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={sheet.body}>
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
            <>
              <View style={sheet.choiceHead}>
                <ThemedText type="smallBold">Choose up to {MAX_PIECES} ({chosen.length} picked)</ThemedText>
                <Pressable onPress={() => setManual(false)} accessibilityRole="button" hitSlop={8}>
                  <ThemedText type="small" style={{ color: theme.accent }}>Use today's carry</ThemedText>
                </Pressable>
              </View>
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
                        style={[sheet.pick, { backgroundColor: theme.surface, borderColor: on ? theme.accent : theme.border }]}>
                        <GearThumb item={g} size={36} />
                        <ThemedText numberOfLines={1} style={sheet.pickName}>{g.name}</ThemedText>
                        {on ? <Icon name="check" size={18} color={theme.accent} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const card = StyleSheet.create({
  root: { width: W, height: H, backgroundColor: '#14161A', overflow: 'hidden' },
  band: { position: 'absolute', left: 0, top: 0, width: W, height: 100 },
  bandFade: { position: 'absolute', left: 0, top: 0, width: W, height: 100, backgroundColor: 'rgba(20,22,26,0.5)' },
  brand: { position: 'absolute', left: 21, top: 19, flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 32, height: 32, borderRadius: 8 },
  brandName: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: 3 },
  titleBox: { position: 'absolute', left: 21, top: 78, right: 21 },
  title: { color: '#F2F3F5', fontSize: 42, fontWeight: '800', letterSpacing: 0.5, lineHeight: 44 },
  sub: { color: '#B9BEC6', fontSize: 11, marginTop: 4 },
  grid: { position: 'absolute', left: 21, right: 21, top: 172, gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  spacer: { flex: 1 },
  tile: { flex: 1, backgroundColor: '#20242A', borderColor: '#343A43', borderWidth: 1, borderRadius: 10, padding: 7 },
  photo: { height: 84, borderRadius: 6, backgroundColor: '#E9EBEE', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cat: { color: '#AAB0B9', fontSize: 8, fontWeight: '600', letterSpacing: 1.4, marginTop: 6 },
  name: { color: '#F2F3F5', fontSize: 11, fontWeight: '700', lineHeight: 13, marginTop: 1, height: 26 },
  detail: { color: '#B9BEC6', fontSize: 8.5, marginTop: 2 },
  foot: { position: 'absolute', left: 21, right: 21, bottom: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#343A43', paddingTop: 9 },
  footL: { color: '#B9BEC6', fontSize: 10 },
  footR: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
});

const sheet = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 12 : 36 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  body: { padding: Spacing.three, gap: Spacing.two, paddingBottom: 48, maxWidth: 520, width: '100%', alignSelf: 'center' },
  preview: { alignItems: 'center' },
  empty: { width: W, height: 140, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  choiceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two },
  group: { gap: 6 },
  caps: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1.5, borderRadius: Radius.medium, padding: 8 },
  pickName: { flex: 1, fontSize: 15 },
});
