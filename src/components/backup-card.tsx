import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/field';
import { Spacing } from '@/constants/theme';
import { readBackup, readCsv, saveBackup, saveCsv, type Imported } from '@/lib/backup';
import { ensureCategories } from '@/lib/categories';
import { useGear } from '@/lib/gear';
import { log, logError } from '@/lib/log';
import { deletePhoto } from '@/lib/photos';
import { usePro } from '@/lib/pro';

/** Settings: keep a copy of the collection yourself. The file backup is free; the spreadsheet is Pro. */
export function BackupCard() {
  const { items, addItem } = useGear();
  const pro = usePro();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      logError('backup.fail', e);
      Alert.alert('Backup', e instanceof Error ? e.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  /** Adds what was read to the collection (the item limit still applies). */
  async function addAll(got: Imported | null) {
    if (!got) return;
    ensureCategories(got.drafts.map((d) => d.category));
    let added = 0;
    let full = false;
    for (const d of got.drafts) {
      const r = full ? ({ ok: false, error: 'full' } as const) : await addItem(d);
      if (r.ok) added += 1;
      else {
        full = true;
        deletePhoto(d.imageUri);
      }
    }
    log('backup.import', { added, skipped: got.skipped, full });
    const left = got.drafts.length - added;
    Alert.alert('Added to your collection', `${added} item${added === 1 ? '' : 's'} added.${left > 0 ? ` ${left} didn’t fit under the item limit.` : ''}${got.skipped ? ` ${got.skipped} row${got.skipped === 1 ? '' : 's'} skipped (no name).` : ''}`);
  }

  const needPro = () => Alert.alert('Pro feature', 'Spreadsheet export and import come with Pro.', [{ text: 'Not now', style: 'cancel' }, { text: 'See Pro', onPress: () => router.push('/pro') }]);

  return (
    <Card>
      <ThemedText type="smallBold">Backup</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Your collection is included in your phone’s iCloud or Google backup if that’s turned on, and comes back when you set up a new phone. You can also keep a file yourself.
      </ThemedText>
      <Button
        label="Save a backup file"
        icon="share"
        variant="secondary"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            const n = await saveBackup(items);
            log('backup.save', { n });
          })
        }
      />
      <Button label="Add items from a backup file" icon="add" variant="secondary" disabled={busy} onPress={() => void run(async () => addAll(await readBackup()))} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.gap}>
        Spreadsheet (CSV): the text details without photos, to edit elsewhere or bring in a list.{pro ? '' : ' Pro.'}
      </ThemedText>
      <Button label="Export a spreadsheet" icon="share" variant="secondary" disabled={busy} onPress={() => (pro ? void run(async () => void (await saveCsv(items))) : needPro())} />
      <Button label="Import a spreadsheet" icon="add" variant="secondary" disabled={busy} onPress={() => (pro ? void run(async () => addAll(await readCsv())) : needPro())} />
    </Card>
  );
}

const styles = StyleSheet.create({ gap: { marginTop: Spacing.two } });
