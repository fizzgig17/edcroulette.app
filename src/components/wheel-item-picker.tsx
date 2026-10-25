/**
 * Double-tap a wheel to choose its piece: a list of everything in that wheel's category, scrolled to the piece it shows
 * now and with that one marked. Tapping a piece picks it, locks the wheel on it and closes the list.
 */
import { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GearThumb } from '@/components/gear-thumb';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGear } from '@/lib/gear';
import { select } from '@/lib/haptics';
import type { GearItem } from '@/types/models';

const ROW = 62;

const detail = (g: GearItem) => [g.brand, g.material, g.finish].filter(Boolean).join(' · ') || 'No details yet';

export function WheelItemPicker({
  visible,
  category,
  items,
  currentId,
  locked,
  onChoose,
  onUnlock,
  onClose,
}: {
  visible: boolean;
  category: string;
  items: GearItem[];
  /** The piece the wheel shows now, or null when it shows none. */
  currentId: string | null;
  locked: boolean;
  onChoose: (item: GearItem) => void;
  onUnlock: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { toggleFavorite } = useGear();
  const list = useRef<FlatList<GearItem>>(null);
  const [listHeight, setListHeight] = useState(0);
  const index = currentId ? items.findIndex((g) => g.id === currentId) : -1;

  // Open with the current piece in the middle (or at the top when there isn't one).
  const placed = useRef(false);
  useEffect(() => {
    if (!visible) placed.current = false;
  }, [visible]);
  const place = () => {
    if (placed.current || !listHeight) return;
    placed.current = true;
    const offset = index > 0 ? Math.max(0, index * ROW - (listHeight - ROW) / 2) : 0;
    if (offset > 0) list.current?.scrollToOffset({ offset, animated: false });
  };
  useEffect(place, [visible, listHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, maxHeight: height * 0.72, paddingBottom: Math.max(insets.bottom, Spacing.three) }]}
          onPress={() => undefined}>
          <View style={styles.head}>
            <View style={styles.flex}>
              <ThemedText type="heading" numberOfLines={1}>{`Choose a ${category.toLowerCase()}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                Tap a piece to use it. The wheel locks on it.
              </ThemedText>
            </View>
            {locked ? (
              <Pressable onPress={onUnlock} hitSlop={8} accessibilityRole="button" accessibilityLabel="Unlock this wheel" style={[styles.unlock, { borderColor: theme.border }]}>
                <Icon name="unlock" size={14} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  Unlock
                </ThemedText>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          {items.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              You don’t have any {category.toLowerCase()} pieces yet. Add one in your Collection.
            </ThemedText>
          ) : (
            <FlatList
              ref={list}
              data={items}
              keyExtractor={(g) => g.id}
              extraData={currentId}
              onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
              getItemLayout={(_d, i) => ({ length: ROW, offset: ROW * i, index: i })}
              onScrollToIndexFailed={() => undefined}
              style={styles.list}
              renderItem={({ item: g }) => {
                const on = g.id === currentId;
                return (
                  <Pressable
                    onPress={() => onChoose(g)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${g.name}${on ? ', current' : ''}`}
                    style={({ pressed }) => [styles.row, { backgroundColor: on ? theme.backgroundElement : 'transparent', borderColor: on ? theme.accent : 'transparent' }, pressed && { opacity: 0.7 }]}>
                    <GearThumb item={g} size={40} />
                    <View style={styles.flex}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {g.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.detail}>
                        {detail(g)}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() => {
                        select();
                        void toggleFavorite(g.id);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={g.favorite ? `Remove ${g.name} from favorites` : `Make ${g.name} a favorite`}>
                      <Icon name={g.favorite ? 'starOn' : 'star'} size={18} color={g.favorite ? theme.accent : theme.textSecondary} />
                    </Pressable>
                    {on ? <Icon name="check" size={16} color={theme.accent} /> : <View style={styles.checkSpace} />}
                  </Pressable>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, borderWidth: 1, borderBottomWidth: 0, paddingTop: Spacing.three, paddingHorizontal: Spacing.three, gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  sub: { fontSize: 12, lineHeight: 16 },
  unlock: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.small, borderWidth: 1 },
  list: { flexGrow: 0 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, borderRadius: Radius.medium, borderWidth: 1.5 },
  detail: { fontSize: 12, lineHeight: 16 },
  checkSpace: { width: 16 },
  empty: { paddingVertical: Spacing.three },
});
