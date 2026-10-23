import { Stack, useLocalSearchParams } from 'expo-router';

import { GearForm } from '@/components/gear-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useGear } from '@/lib/gear';

export default function EditGearScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { itemById, loading } = useGear();
  const item = itemById(id);
  if (!item) {
    return (
      <Screen title="Gear" showTitle={false}>
        <Stack.Screen options={{ headerShown: true, title: 'Gear' }} />
        <ThemedText themeColor="textSecondary">{loading ? 'Loading…' : 'This item is no longer in your collection.'}</ThemedText>
      </Screen>
    );
  }
  // Keyed so switching items resets the form.
  return <GearForm key={item.id} item={item} />;
}
