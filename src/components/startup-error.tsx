import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Shown instead of the app when something fails while it starts. Uses no theme,
 * database or navigation, so it works even when those are what broke.
 */
export function StartupError({ error, retry }: { error: Error; retry?: () => void }) {
  const build = Constants.expoConfig?.ios?.buildNumber ?? '?';
  const text = `${error.name}: ${error.message}\n\n${(error.stack ?? '').split('\n').slice(0, 25).join('\n')}`;
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>EDC Roulette couldn't start</Text>
        <Text style={styles.body}>
          Take a screenshot of this screen (or press and hold the text below to copy it) and send it to the developer. Build {build}.
        </Text>
        <View style={styles.box}>
          <Text selectable style={styles.mono}>
            {text}
          </Text>
        </View>
        {retry ? (
          <Pressable onPress={retry} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#121418' },
  content: { padding: 20, gap: 14 },
  title: { color: '#E8A33D', fontSize: 22, fontWeight: '800' },
  body: { color: '#EEF0F3', fontSize: 15, lineHeight: 21 },
  box: { backgroundColor: '#1E2229', borderRadius: 10, padding: 12 },
  mono: { color: '#EEF0F3', fontFamily: 'Menlo', fontSize: 12, lineHeight: 17 },
  button: { backgroundColor: '#E8A33D', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#16191E', fontWeight: '800', fontSize: 16 },
});
