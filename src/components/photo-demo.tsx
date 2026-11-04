/**
 * The photo-identify demo for the website: a photo with three items, each
 * outlined. Tap one and the rest blur, then its details appear, exactly as the
 * app shows them. The answers are built in; nothing is sent anywhere.
 */
import { useState } from 'react';
import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { CutoutImage } from '@/components/cutout-image';
import { ChipGroup } from '@/components/ui/chip';
import { outlineInSquare, squareAround, type CutoutBg, type CutoutLook } from '@/lib/cutout';

import { OutlinedPhoto } from '@/components/outlined-photo';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/field';
import { Radius, Spacing } from '@/constants/theme';
import { DEMO_ITEMS, DEMO_PHOTO, DEMO_SIZE } from '@/content/demo-photo';
import { useTheme } from '@/hooks/use-theme';

const photoUri: string = Asset.fromModule(DEMO_PHOTO).uri;
const ANGLES: Record<string, CutoutLook> = { Diagonal: 'diagonal', Upright: 'upright', 'As photographed': 'asis' };
const BGS: Record<string, CutoutBg> = { Gray: 'gray', Charcoal: 'charcoal', Light: 'light' };

export function PhotoDemo() {
  const theme = useTheme();
  // Measured from the card itself: the window width is 0 in the pre-built page.
  const [avail, setAvail] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const remaining = finished ? [] : DEMO_ITEMS.map((_, i) => i).filter((i) => !done.includes(i));
  const W = Math.max(0, Math.min(560, avail));
  const H = (W * DEMO_SIZE.height) / DEMO_SIZE.width;
  const item = selected !== null ? DEMO_ITEMS[selected] : null;

  const next = () => {
    if (selected === null) return;
    setDone((d) => [...d, selected]);
    setSelected(null);
  };

  const finish = () => {
    if (selected === null) return;
    setDone((d) => [...d, selected]);
    setFinished(true);
    setSelected(null);
  };

  const [look, setLook] = useState<'Cutout' | 'Original'>('Cutout');
  const [angle, setAngle] = useState<keyof typeof ANGLES>('Diagonal');
  const [bg, setBg] = useState<keyof typeof BGS>('Gray');
  const [turn, setTurn] = useState(0);
  // The item's own square cut from the photo, and its outline on that square (what the add screen stores).
  const sq = item?.box ? squareAround(item.box, DEMO_SIZE) : null;
  const cut = item && sq && item.outline ? { outline: outlineInSquare(item.outline as [number, number][], DEMO_SIZE, sq), turn } : null;

  return (
    <Card>
      <ThemedText type="heading">Snap a photo, pick the item</ThemedText>
      <ThemedText themeColor="textSecondary">
        Take one photo of everything on the table. Your phone finds and outlines each item on its own, with no AI and no internet. Tap the one you mean and the others blur. This demo uses a ready-made photo, and nothing is sent anywhere.
      </ThemedText>
      <View style={styles.center} onLayout={(e) => setAvail(Math.floor(e.nativeEvent.layout.width))}>
        {remaining.length > 0 ? (
          <>
            {W > 0 ? <OutlinedPhoto uri={photoUri} width={W} height={H} items={DEMO_ITEMS} remaining={remaining} selected={selected} onSelect={setSelected} added={done} /> : null}
            <ThemedText type="smallBold" themeColor="textSecondary">
              {selected !== null ? 'The other items are blurred. Here is what it read:' : done.length > 0 ? `${remaining.length} more. Tap the next one.` : `3 items found. Tap the one you want.`}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            {`Done. ${done.length} ${done.length === 1 ? 'item' : 'items'} added to the collection.`}
          </ThemedText>
        )}
      </View>

      {item ? (
        <View style={[styles.result, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {sq ? (
            <View style={styles.lookRow}>
              <View style={styles.lookPic}>
                {look === 'Cutout' && cut ? (
                  <CutoutImage uri={photoUri} region={sq.region} cutout={cut} size={140} look={ANGLES[angle]} bg={BGS[bg]} />
                ) : (
                  <View style={styles.crop}>
                    <Image source={{ uri: photoUri }} contentFit="fill" style={{ position: 'absolute', width: 140 / sq.region.w, height: 140 / sq.region.h, left: (-sq.region.x * 140) / sq.region.w, top: (-sq.region.y * 140) / sq.region.h }} />
                  </View>
                )}
              </View>
              <View style={styles.lookControls}>
                <ThemedText type="caption" themeColor="textSecondary">
                  Photo look
                </ThemedText>
                <ChipGroup options={['Cutout', 'Original'] as const} value={look} onChange={(v) => v && setLook(v)} small />
                {look === 'Cutout' ? (
                  <>
                    <ChipGroup options={Object.keys(ANGLES) as (keyof typeof ANGLES)[]} value={angle} onChange={(v) => { if (v) { setAngle(v); setTurn(0); } }} small />
                    <ChipGroup options={Object.keys(BGS) as (keyof typeof BGS)[]} value={bg} onChange={(v) => v && setBg(v)} small />
                    <View style={styles.turns}>
                      <Button label="Turn left" variant="secondary" onPress={() => setTurn((t) => t - 15)} style={styles.flex} />
                      <Button label="Turn right" variant="secondary" onPress={() => setTurn((t) => t + 15)} style={styles.flex} />
                    </View>
                  </>
                ) : null}
              </View>
            </View>
          ) : null}
          <ThemedText type="heading">{[item.brand ?? item.brandRead, item.model].filter(Boolean).join(' ') || item.category}</ThemedText>
          <Row k="Category" v={item.category} />
          {item.material ? <Row k="Material" v={item.materialOptions && item.materialOptions.length > 1 ? `${item.material} (also possible: ${item.materialOptions.filter((m) => m !== item.material).join(', ')})` : item.material} /> : null}
          {item.finish ? <Row k="Finish" v={item.finish} /> : null}
          {item.color ? (
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.key}>
                Color
              </ThemedText>
              <View style={[styles.swatch, { backgroundColor: item.color, borderColor: theme.border }]} />
            </View>
          ) : null}
          {item.notes ? <ThemedText themeColor="textSecondary">{item.notes}</ThemedText> : null}
          <Button label={remaining.length > 1 ? `Add, then next item (${remaining.length - 1} left)` : 'Add and finish'} icon="check" onPress={next} />
          {remaining.length > 1 ? <Button label="Add and finish" variant="secondary" onPress={finish} /> : null}
        </View>
      ) : null}

      {done.length > 0 ? (
        <Button label="Start over" variant="secondary" onPress={() => { setDone([]); setFinished(false); setSelected(null); }} />
      ) : null}
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.key}>
        {k}
      </ThemedText>
      <ThemedText type="small" style={styles.flex}>
        {v}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  lookRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, alignItems: 'flex-start' },
  lookPic: { width: 140, height: 140 },
  crop: { width: 140, height: 140, borderRadius: 40, overflow: 'hidden' },
  lookControls: { flex: 1, minWidth: 200, gap: Spacing.two },
  turns: { flexDirection: 'row', gap: Spacing.two },
  center: { alignItems: 'center', gap: Spacing.two },
  result: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  key: { width: 76 },
  flex: { flex: 1 },
  swatch: { width: 28, height: 28, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
});
