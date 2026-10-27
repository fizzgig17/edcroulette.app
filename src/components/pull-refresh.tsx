import { useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** A pull-down control for a ScrollView that runs `fn` and shows its spinner for a moment. Undefined when there's nothing to run. */
export function usePullRefresh(fn: (() => void) | null | undefined) {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!fn) return undefined;
  return (
    <RefreshControl
      refreshing={refreshing}
      tintColor={theme.accent}
      colors={[theme.accent]}
      onRefresh={() => {
        setRefreshing(true);
        fn();
        timer.current = setTimeout(() => setRefreshing(false), 700);
      }}
    />
  );
}
