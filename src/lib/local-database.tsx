// The phone's database (expo-sqlite), opened once for the whole app and migrated
// on launch. The website uses local-database.web.tsx, which loads none of this.
// localStorage (backed by SQLite on phones) holds small settings like the theme.
import 'expo-sqlite/localStorage/install';

import { SQLiteProvider } from 'expo-sqlite';
import type { ReactNode } from 'react';

import { DATABASE_NAME, migrate } from '@/lib/db';
import { GearProvider } from '@/lib/gear';

export function LocalDataProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      <GearProvider>{children}</GearProvider>
    </SQLiteProvider>
  );
}
