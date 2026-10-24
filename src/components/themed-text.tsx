import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'heading' | 'small' | 'smallBold' | 'caption' | 'link' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return (
    <Text
      style={[
        { color: theme[themeColor ?? (type === 'link' ? 'accent' : 'text')] },
        styles[type],
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  title: { fontFamily: Fonts.rounded, fontSize: 40, lineHeight: 46, fontWeight: 800 },
  subtitle: { fontFamily: Fonts.rounded, fontSize: 30, lineHeight: 36, fontWeight: 800 },
  heading: { fontFamily: Fonts.rounded, fontSize: 20, lineHeight: 26, fontWeight: 700 },
  small: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: 700 },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },
  link: { fontSize: 14, lineHeight: 20, fontWeight: 600 },
  code: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: Platform.select({ android: 700 }) ?? 500 },
});
