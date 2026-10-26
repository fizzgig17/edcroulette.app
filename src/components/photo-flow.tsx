/**
 * One full-screen window for the whole photo step: frame the photo, wait while the items are found, then tap the one you
 * mean. It stays open from one step to the next (no dropping back to the form in between), and every step can be cancelled.
 */
import { Image } from 'expo-image';
import { ActivityIndicator, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PickerView } from '@/components/item-picker';
import { CropperView } from '@/components/photo-cropper';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Identified } from '@/lib/api';
import type { PhotoCrop, PickedPhoto } from '@/lib/photos';

type Dims = { width: number; height: number };

export function PhotoFlow({
  cropping,
  onCropCancel,
  onCropDone,
  finding,
  onFindCancel,
  pick,
}: {
  /** Step 1: the photo being framed. */
  cropping: PickedPhoto | null;
  onCropCancel: () => void;
  onCropDone: (photo: PickedPhoto, crop: PhotoCrop) => void;
  /** Step 2: looking for items in the framed photo (uri is empty until the framed photo is saved). */
  finding: { uri: string | null } | null;
  onFindCancel: () => void;
  /** Step 3: choosing among the items found. */
  pick: { uri: string; items: Identified[]; done: number[]; onCancel: () => void; onChoose: (index: number, dims: Dims) => void; onPreview?: (index: number, dims: Dims) => void } | null;
}) {
  const open = !!cropping || !!finding || !!pick;
  const onClose = cropping ? onCropCancel : finding ? onFindCancel : (pick?.onCancel ?? onCropCancel);
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        {cropping ? (
          <CropperView photo={cropping} onCancel={onCropCancel} onDone={onCropDone} />
        ) : finding ? (
          <Finding uri={finding.uri} onCancel={onFindCancel} />
        ) : pick ? (
          <PickerView uri={pick.uri} items={pick.items} done={pick.done} onCancel={pick.onCancel} onChoose={pick.onChoose} onPreview={pick.onPreview} />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Finding({ uri, onCancel }: { uri: string | null; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const side = Math.min(width - Spacing.three * 2, 420);
  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 20) + Spacing.two }]}>
      <View style={styles.top}>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel">
          <ThemedText type="small" style={styles.light}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.stage}>
        <View style={{ width: side, height: side, borderRadius: Radius.large, overflow: 'hidden', backgroundColor: '#14171C' }}>
          {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
        </View>
        <View style={styles.status}>
          <ActivityIndicator color="#FFFFFF" />
          <ThemedText type="smallBold" style={styles.light}>
            Looking for items…
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0D10' },
  screen: { flex: 1, backgroundColor: '#0B0D10' },
  top: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  light: { color: '#FFFFFF', fontSize: 16 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
