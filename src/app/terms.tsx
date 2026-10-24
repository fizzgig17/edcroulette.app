import { LegalPage } from '@/components/legal-page';
import { TERMS, TERMS_INTRO } from '@/content/legal';

export default function TermsScreen() {
  return <LegalPage title="Terms of use" intro={TERMS_INTRO} sections={TERMS} />;
}
