// The phone app's root (the website uses _layout.web.tsx).
// First, so fatal errors anywhere after this are shown instead of closing the app.
import '@/lib/crash-catcher';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DevBanner } from '@/components/dev-banner';
import { TourOverlay } from '@/components/tour';
import { UpdateBanner } from '@/components/update-banner';
import { StartupError } from '@/components/startup-error';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { lastFatalError, onFatalError } from '@/lib/crash-catcher';
import { useGear } from '@/lib/gear';
import { LocalDataProvider } from '@/lib/local-database';
import { prepareFinder } from '@/lib/subject-mask';
import { TourProvider } from '@/lib/tour';
import { UpdateProvider } from '@/lib/update-context';

SplashScreen.preventAutoHideAsync();

/** Expo Router shows this when the layout or a screen throws while drawing. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return <StartupError error={error} retry={() => void retry()} />;
}

function HideSplashWhenLoaded() {
  const { loading } = useGear();
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);
  return null;
}

export default function RootLayout() {
  const [fatal, setFatal] = useState<Error | null>(lastFatalError);
  useEffect(() => onFatalError(setFatal), []);
  // Android: start downloading the object finder's model the moment the app opens (a one-time download).
  useEffect(() => {
    if (Platform.OS === 'android') prepareFinder();
  }, []);
  // Android no longer lets you switch the home-screen icon. A phone that still has one of the old metal icons switched on goes back to the four-metal icon, once.
  useEffect(() => {
    if (Platform.OS !== 'android' || !supportsAlternateIcons) return;
    try {
      if (getAppIconName()) void setAlternateAppIcon(null).catch(() => undefined);
    } catch {
      // Nothing to reset.
    }
  }, []);
  useEffect(() => {
    if (fatal) SplashScreen.hideAsync();
  }, [fatal]);
  if (fatal) return <StartupError error={fatal} />;
  return <App />;
}

function App() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const nav = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <LocalDataProvider>
      <UpdateProvider>
      <TourProvider>
        <HideSplashWhenLoaded />
        <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: colors.background, card: colors.background, primary: colors.accent, text: colors.text, border: colors.border } }}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
            <DevBanner />
            <Stack screenOptions={{ headerShown: false, headerTintColor: colors.accent, headerTitleStyle: { color: colors.text } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="gear/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="gear/[id]" />
              <Stack.Screen name="privacy" />
              <Stack.Screen name="terms" />
              <Stack.Screen name="support" />
              <Stack.Screen name="manual" />
              <Stack.Screen name="delete-account" />
            </Stack>
            <UpdateBanner />
            <TourOverlay />
          </GestureHandlerRootView>
        </ThemeProvider>
      </TourProvider>
      </UpdateProvider>
    </LocalDataProvider>
  );
}
