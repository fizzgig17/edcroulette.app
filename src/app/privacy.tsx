import { LegalPage } from '@/components/legal-page';
import { PRIVACY, PRIVACY_INTRO } from '@/content/legal';

export default function PrivacyScreen() {
  return <LegalPage title="Privacy policy" intro={PRIVACY_INTRO} sections={PRIVACY} path="/privacy" summary="What EDC Roulette keeps on your phone, what (if anything) leaves it, and your choices." />;
}
