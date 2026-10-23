// The phone app's root (the website uses _layout.web.tsx).
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { DevBanner } from '@/components/dev-banner';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGear } from '@/lib/gear';
import { LocalDataProvider } from '@/lib/local-database';

SplashScreen.preventAutoHideAsync();

function HideSplashWhenLoaded() {
  const { loading } = useGear();
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const nav = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <LocalDataProvider>
        <HideSplashWhenLoaded />
        <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: colors.background, card: colors.background, primary: colors.accent, text: colors.text, border: colors.border } }}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <DevBanner />
            <Stack screenOptions={{ headerShown: false, headerTintColor: colors.accent, headerTitleStyle: { color: colors.text } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="gear/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="gear/[id]" />
              <Stack.Screen name="privacy" />
              <Stack.Screen name="terms" />
              <Stack.Screen name="support" />
              <Stack.Screen name="delete-account" />
            </Stack>
          </View>
        </ThemeProvider>
    </LocalDataProvider>
  );
}
