import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function NotFound() {
  return (
    <ThemedView style={styles.page}>
      <View style={styles.box}>
        <ThemedText type="subtitle">Nothing here</ThemedText>
        <ThemedText themeColor="textSecondary">That page doesn't exist.</ThemedText>
        <Link href="/">
          <ThemedText type="link">Go to the home page</ThemedText>
        </Link>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  box: { gap: Spacing.two, alignItems: 'center' },
});
