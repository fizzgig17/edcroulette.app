import { router } from 'expo-router';
import { Alert, Platform, StyleSheet, Switch, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { facebookEnabled, googleEnabled, useAuth, type Provider } from '@/lib/auth';
import { IS_DEV_BUILD } from '@/lib/env';
import { getPurchased, PRO_ENFORCED, PRO_FEATURES, setPurchased, usePro } from '@/lib/pro';

/** What Pro adds, and the optional account (cloud backup and sync). Reached from Settings. */
export default function ProScreen() {
  const theme = useTheme();
  const pro = usePro();
  const auth = useAuth();
  const email = auth.session?.user.email ?? null;

  function confirmDelete() {
    Alert.alert(
      'Delete your account data?',
      'This removes your EDC Roulette cloud data (backup, wheels and friends) from our servers. Items on this phone stay. It can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void auth.deleteAccount() },
      ],
    );
  }

  const providers: { id: Provider; label: string }[] = [
    ...(Platform.OS === 'ios' ? [{ id: 'apple' as const, label: 'Continue with Apple' }] : []),
    ...(googleEnabled ? [{ id: 'google' as const, label: 'Continue with Google' }] : []),
    ...(facebookEnabled ? [{ id: 'facebook' as const, label: 'Continue with Facebook' }] : []),
  ];

  return (
    <Screen title="Pro & account" readable>
      <Card>
        <ThemedText type="smallBold">{pro ? 'You have Pro' : 'EDC Roulette Pro'}</ThemedText>
        {PRO_FEATURES.map((f) => (
          <View key={f} style={styles.row}>
            <Icon name="check" size={16} color={theme.accent} />
            <ThemedText type="small" style={styles.flex}>
              {f}
            </ThemedText>
          </View>
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          The free version keeps up to 20 items and 6 wheels, with no account, and everything stays on your phone.
        </ThemedText>
        {PRO_ENFORCED && !pro ? <Button label="Get Pro (not on sale yet)" disabled onPress={() => undefined} /> : null}
      </Card>

      {auth.available ? (
        <Card>
          <ThemedText type="smallBold">Account</ThemedText>
          {auth.session ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {email ? `Signed in as ${email}.` : 'Signed in.'} {auth.profile?.tier === 'premium' ? 'Premium is on for this account.' : 'This account is on the free plan.'}
              </ThemedText>
              <Button label="Sign out" variant="secondary" onPress={() => void auth.signOut()} />
              <Button label="Delete my account data" variant="danger" onPress={confirmDelete} />
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Optional. Sign in to back up and sync your collection across devices. Signing in sends your collection to our servers; staying signed out keeps everything on this phone.
              </ThemedText>
              {providers.map((p) => (
                <Button key={p.id} label={p.label} variant="secondary" onPress={() => void auth.signIn(p.id)} disabled={auth.loading} />
              ))}
            </>
          )}
          {auth.error ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {auth.error}
            </ThemedText>
          ) : null}
        </Card>
      ) : null}

      {IS_DEV_BUILD ? (
        <Card>
          <ThemedText type="smallBold">Testing (dev builds only)</ThemedText>
          <View style={styles.row}>
            <ThemedText style={styles.flex}>Pro purchase on this phone</ThemedText>
            <Switch value={getPurchased()} onValueChange={(v) => setPurchased(v)} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Turn off to try the free version’s limits.
          </ThemedText>
        </Card>
      ) : null}
      <Button label="Done" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});
