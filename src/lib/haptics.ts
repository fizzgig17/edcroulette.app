import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { getHapticsOn } from '@/lib/preferences';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
/** Native phones only, and only while Settings → Haptics is on. */
const on = () => isNative && getHapticsOn();

/** A clear tap for presses. Silent on the web. */
export function tap() {
  if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** For switches, chips and each reel stopping. */
export function select() {
  if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Something worked (saved, spin finished). */
export function success() {
  if (on()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** A gentle "not that" (a limit reached). */
export function warn() {
  if (on()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
