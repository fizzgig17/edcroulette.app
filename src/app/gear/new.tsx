import { useLocalSearchParams } from 'expo-router';

import { GearForm } from '@/components/gear-form';

export default function NewGearScreen() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  return <GearForm defaultCategory={category} />;
}
