import { useLocalSearchParams } from 'expo-router';

import { GearForm } from '@/components/gear-form';

export default function NewGearScreen() {
  const { category, demo } = useLocalSearchParams<{ category?: string; demo?: string }>();
  return <GearForm defaultCategory={category} demo={demo === '1'} />;
}
