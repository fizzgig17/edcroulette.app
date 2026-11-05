import { LegalPage } from '@/components/legal-page';
import { SUPPORT } from '@/content/legal';

export default function SupportScreen() {
  return <LegalPage title="Help and support" sections={SUPPORT} dated={false} path="/support" summary="Help, answers and how to contact EDC Roulette support." />;
}
