/**
 * Frames a photo in a square: drag to move it, pinch to zoom. The square is what
 * gets saved (and what photo identify sees). Gestures run on the UI thread.
 */
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import type { PhotoCrop, PickedPhoto } from '@/lib/photos';

const MAX_ZOOM = 5;

export function PhotoCropper({ photo, onCancel, onDone }: { photo: PickedPhoto | null; onCancel: () => void; onDone: (photo: PickedPhoto, crop: PhotoCrop) => void }) {
  return (
    <Modal visible={!!photo} animationType="slide" onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.root}>{photo ? <CropperView photo={photo} onCancel={onCancel} onDone={onDone} /> : null}</GestureHandlerRootView>
    </Modal>
  );
}

export function CropperView({ photo, onCancel, onDone }: { photo: PickedPhoto; onCancel: () => void; onDone: (photo: PickedPhoto, crop: PhotoCrop) => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const view = Math.min(width - Spacing.three * 2, 420);
  // The photo starts just big enough to fill the square.
  const base = view / Math.min(photo.width, photo.height);
  const w = photo.width * base;
  const h = photo.height * base;

  const zoom = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      const mx = Math.max(0, (w * zoom.value - view) / 2);
      const my = Math.max(0, (h * zoom.value - view) / 2);
      x.value = Math.max(-mx, Math.min(mx, startX.value + e.translationX));
      y.value = Math.max(-my, Math.min(my, startY.value + e.translationY));
    });
  const pinch = Gesture.Pinch()
    .onStart(() => {
      startZoom.value = zoom.value;
    })
    .onUpdate((e) => {
      const z = Math.max(1, Math.min(MAX_ZOOM, startZoom.value * e.scale));
      zoom.value = z;
      const mx = Math.max(0, (w * z - view) / 2);
      const my = Math.max(0, (h * z - view) / 2);
      x.value = Math.max(-mx, Math.min(mx, x.value));
      y.value = Math.max(-my, Math.min(my, y.value));
    });
  const gesture = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: zoom.value }] }));

  function done() {
    // Which part of the photo is under the square, in the photo's own pixels.
    const s = base * zoom.value;
    const size = view / s;
    onDone(photo, { originX: photo.width / 2 - x.value / s - size / 2, originY: photo.height / 2 - y.value / s - size / 2, size });
  }

  return (
    <View style={[styles.screen, { backgroundColor: '#0B0D10' }]}>
      <View style={styles.top}>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button">
          <ThemedText type="small" style={{ color: '#FFFFFF', fontSize: 17 }}>
            Cancel
          </ThemedText>
        </Pressable>
        <ThemedText type="smallBold" style={{ color: '#FFFFFF', fontSize: 17 }}>
          Frame your photo
        </ThemedText>
        <View style={styles.spacer} />
      </View>
      <View style={styles.stage}>
        <GestureDetector gesture={gesture}>
          <View style={[styles.frame, { width: view, height: view }]}>
            <Animated.View style={[{ width: w, height: h }, imageStyle]}>
              <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="fill" accessibilityIgnoresInvertColors />
            </Animated.View>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edge]} />
          </View>
        </GestureDetector>
        <ThemedText type="small" style={styles.hint}>
          Drag to move, pinch to zoom. The square is what gets saved.
        </ThemedText>
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]}>
        <Button label="Use photo" icon="check" big onPress={done} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1, paddingTop: 56 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: Radius.large },
  edge: { borderRadius: Radius.large, borderWidth: 2, borderColor: '#FFFFFF66' },
  spacer: { width: 50 },
  footer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  hint: { color: '#FFFFFFAA', textAlign: 'center', paddingHorizontal: Spacing.four },
});
