import { LegalPage } from '@/components/legal-page';
import { DELETE_ACCOUNT } from '@/content/legal';

/** Google Play requires a web page explaining how to delete an account and its data. */
export default function DeleteAccountScreen() {
  return <LegalPage title="Deleting your data" sections={DELETE_ACCOUNT} path="/delete-account" summary="How to delete your EDC Roulette data." />;
}
