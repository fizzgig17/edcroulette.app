import { LegalPage } from '@/components/legal-page';
import { MANUAL, MANUAL_INTRO } from '@/content/manual';

export default function ManualScreen() {
  return <LegalPage title="User manual" intro={MANUAL_INTRO} sections={MANUAL} dated={false} />;
}
