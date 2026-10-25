import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { checkForUpdate, installedBuild, openStore, updatesSupported } from '@/lib/app-update';

export type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available' | 'error';

type Ctx = {
  supported: boolean;
  status: UpdateStatus;
  installed: number;
  latest: number;
  version: string;
  error: string | null;
  /** The launch check may show the banner; a manual check from Settings only updates its own text. */
  bannerVisible: boolean;
  check: (announce?: boolean) => Promise<void>;
  openStore: () => Promise<void>;
  dismissBanner: () => void;
};

const noop = async () => {};
const UpdateContext = createContext<Ctx>({ supported: false, status: 'idle', installed: 0, latest: 0, version: '', error: null, bannerVisible: false, check: noop, openStore: noop, dismissBanner: () => {} });

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latest, setLatest] = useState(0);
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [announced, setAnnounced] = useState(false);
  const [dismissed, setDismissed] = useState(0);
  const busy = useRef(false);
  const last = useRef(0);

  const check = useCallback(async (announce = false) => {
    if (!updatesSupported || busy.current) return;
    busy.current = true;
    last.current = Date.now();
    setStatus('checking');
    setError(null);
    try {
      const info = await checkForUpdate();
      setLatest(info.latest);
      setVersion(info.version);
      setStatus(info.available ? 'available' : 'uptodate');
      setAnnounced(announce && info.available);
    } catch (e) {
      setStatus('error');
      setError((e as Error)?.message ?? 'Could not check for updates.');
      setAnnounced(false);
    } finally {
      busy.current = false;
    }
  }, []);

  // When the app opens, and each time it comes back to the front (at most once a minute).
  useEffect(() => {
    void check(true);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - last.current > 60_000) void check(true);
    });
    return () => sub.remove();
  }, [check]);

  const value = useMemo<Ctx>(
    () => ({
      supported: updatesSupported,
      status,
      installed: installedBuild(),
      latest,
      version,
      error,
      bannerVisible: status === 'available' && announced && dismissed !== latest,
      check,
      openStore,
      dismissBanner: () => setDismissed(latest),
    }),
    [status, latest, version, error, announced, dismissed, check],
  );
  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export const useUpdate = () => useContext(UpdateContext);
