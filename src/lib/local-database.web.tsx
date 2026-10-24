import type { ReactNode } from 'react';

/** The website has no on-device collection; app-only screens redirect home. */
export function LocalDataProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
