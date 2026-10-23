/**
 * Asks, once, whether EDC Roulette may use its AI service: photos you choose to
 * identify, and the text details of your items for coordinated spins, are sent
 * to the service and not kept by us. The answer is remembered and can be
 * changed in Settings.
 */
import { Alert } from 'react-native';

import { getAiConsent, setAiConsent } from '@/lib/preferences';

/** Resolves true if AI features may be used (asking if the person hasn't decided yet). */
export function ensureAiConsent(reason: 'photo' | 'set'): Promise<boolean> {
  const current = getAiConsent();
  if (current === 'allowed') return Promise.resolve(true);
  if (current === 'declined') return Promise.resolve(false);
  const what =
    reason === 'photo'
      ? 'The photo you choose is sent to an AI service (Anthropic’s Claude) to work out what the item is. It is not stored by EDC Roulette.'
      : 'The names, brands, materials and colors of your items (no photos) are sent to an AI service (Anthropic’s Claude) to pick pieces that go well together. They are not stored by EDC Roulette.';
  return new Promise((resolve) => {
    Alert.alert(
      'Use AI to help?',
      `${what}\n\nYou can change this any time in Settings.`,
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => {
            setAiConsent('declined');
            resolve(false);
          },
        },
        {
          text: 'Allow',
          onPress: () => {
            setAiConsent('allowed');
            resolve(true);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      },
    );
  });
}
