import { LegalPage } from '@/components/legal-page';
import { MANUAL, MANUAL_INTRO } from '@/content/manual';

export default function ManualScreen() {
  return <LegalPage title="User manual" intro={MANUAL_INTRO} sections={MANUAL} dated={false} path="/manual" summary="How to use EDC Roulette: build your collection, set up wheels, lock what you carry and spin for the rest." />;
}
