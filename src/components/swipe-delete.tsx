import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const ACTION_WIDTH = 92;
/** How far the row must be dragged before letting go deletes it. */
const FULL_SWIPE = 220;

/**
 * The red Delete button behind a swiped row. It shows at the normal width and grows as you
 * keep dragging; past FULL_SWIPE, letting go deletes.
 */
export function DeleteAction({ drag, onPress, onFullChange, label }: { drag: SharedValue<number>; onPress: () => void; onFullChange: (full: boolean) => void; label: string }) {
  useAnimatedReaction(
    () => drag.value <= -FULL_SWIPE,
    (full, previous) => {
      if (full !== previous) runOnJS(onFullChange)(full);
    },
  );
  const grow = useAnimatedStyle(() => ({ width: Math.max(ACTION_WIDTH, -drag.value) }));
  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.delete, grow]}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.press}>
          <ThemedText type="smallBold" style={styles.deleteText}>
            Delete
          </ThemedText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** The bar that stays for a few seconds after a swipe-delete. */
export function UndoBar({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <View style={styles.undoBar} accessibilityLiveRegion="polite">
      <ThemedText type="small" style={styles.undoText}>
        {text}
      </ThemedText>
      <Pressable onPress={onUndo} hitSlop={10} accessibilityRole="button">
        <ThemedText type="smallBold" style={styles.undoAction}>
          Undo
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { width: ACTION_WIDTH },
  delete: { backgroundColor: '#C0392B', height: '100%' },
  press: { flex: 1, justifyContent: 'center', alignItems: 'center', minWidth: ACTION_WIDTH },
  deleteText: { color: '#FFFFFF' },
  undoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1F2D35', borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  undoText: { color: '#FFFFFF' },
  undoAction: { color: '#7FD6D9' },
});
