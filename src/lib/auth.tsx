/**
 * Optional sign-in (Apple, Google, Facebook) for cloud backup and sync. Accounts live in the shared Supabase project; EDC Roulette
 * only ever touches its own `edc` schema. Nothing here runs unless the person taps Sign in: the app works without an account.
 *
 * Needs on the Supabase side (dashboard, not code): Apple/Google/Facebook providers on, and `edcroulette://auth-callback` in the
 * redirect allow list.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { log, logError } from '@/lib/log';
import { PRO_ENFORCED, setAccountPremium } from '@/lib/pro';

const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export type Provider = 'apple' | 'google' | 'facebook';
export const accountsAvailable = PRO_ENFORCED && !!URL_BASE && !!KEY && Platform.OS !== 'web';

// Same session storage as Belay Buddy (the phone's local storage).
const storage = {
  getItem: (k: string) => globalThis.localStorage?.getItem(k) ?? null,
  setItem: (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
  removeItem: (k: string) => globalThis.localStorage?.removeItem(k),
};

const REDIRECT = 'edcroulette://auth-callback';
/** Google and Facebook show only when the build knows they've been set up (the same switches Belay Buddy uses). */
export const googleEnabled = process.env.EXPO_PUBLIC_GOOGLE_SIGNIN === '1';
export const facebookEnabled = process.env.EXPO_PUBLIC_FACEBOOK_SIGNIN === '1';

type EdcClient = SupabaseClient<any, 'edc', 'edc'>;
let client: EdcClient | null = null;
function supabase(): EdcClient | null {
  if (!accountsAvailable) return null;
  client ??= createClient<any, 'edc'>(URL_BASE!, KEY!, {
    db: { schema: 'edc' },
    auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
  });
  return client;
}

export type Profile = { tier: 'free' | 'premium'; premium_until: string | null; display_name: string | null; friend_code: string };

type AuthState = {
  available: boolean;
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** null = fine, otherwise a short message for the person. */
  error: string | null;
  signIn: (p: Provider) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

const premiumNow = (p: Profile | null) => !!p && p.tier === 'premium' && (!p.premium_until || new Date(p.premium_until).getTime() > Date.now());

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(accountsAvailable);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    const sb = supabase();
    if (!sb || !s) {
      setProfile(null);
      setAccountPremium(false);
      return;
    }
    const { data, error: e } = await sb.rpc('ensure_profile');
    if (e || !data) {
      logError('auth.profile.fail', e);
      return;
    }
    const p = data as Profile;
    setProfile(p);
    setAccountPremium(premiumNow(p));
  }, []);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    let alive = true;
    void sb.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (alive) setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Not awaited inside the callback (Supabase warns against calling its client from here).
      setTimeout(() => void loadProfile(s), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (provider: Provider) => {
      const sb = supabase();
      if (!sb) return;
      setError(null);
      try {
        if (provider === 'apple') {
          if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
            setError('Sign in with Apple isn’t available on this device.');
            return;
          }
          const raw = Crypto.randomUUID();
          const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
          const cred = await AppleAuthentication.signInAsync({
            requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
            nonce: hashed,
          });
          if (!cred.identityToken) throw new Error('Apple did not return a token.');
          const { error: e } = await sb.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: raw });
          if (e) throw e;
        } else {
          const { data, error: e } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: REDIRECT, skipBrowserRedirect: true } });
          if (e || !data.url) throw e ?? new Error('No sign-in page.');
          const res = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT);
          if (res.type !== 'success') return; // closed without finishing
          // The session comes back as ?code= (PKCE) or in the #fragment.
          const params = new URL(res.url.replace('#', res.url.includes('?') ? '&' : '?')).searchParams;
          if (params.get('error_description')) throw new Error(params.get('error_description')!);
          const code = params.get('code');
          if (code) {
            const { error: ex } = await sb.auth.exchangeCodeForSession(code);
            if (ex) throw ex;
          } else {
            const access = params.get('access_token');
            const refresh = params.get('refresh_token');
            if (!access || !refresh) throw new Error('Sign-in did not finish.');
            const { error: ex } = await sb.auth.setSession({ access_token: access, refresh_token: refresh });
            if (ex) throw ex;
          }
        }
        log('auth.signin', { provider });
      } catch (e) {
        // The person backing out of Apple's sheet isn't an error worth showing.
        if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
        logError('auth.signin.fail', e);
        setError('Couldn’t sign in. Try again in a moment.');
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
    setProfile(null);
    setAccountPremium(false);
    log('auth.signout');
  }, []);

  /**
   * Deletes this account's EDC Roulette data on the server (photos first, then the profile, which removes gear, wheels and
   * friends), then signs out. The shared sign-in itself is left alone because Belay Buddy uses it too.
   */
  const deleteAccount = useCallback(async () => {
    const sb = supabase();
    const uid = session?.user.id;
    if (!sb || !uid) return false;
    try {
      const files = await sb.storage.from('edc-gear').list(uid, { limit: 1000 });
      if (files.error) throw files.error;
      const paths = (files.data ?? []).map((f) => `${uid}/${f.name}`);
      if (paths.length) {
        const rm = await sb.storage.from('edc-gear').remove(paths);
        if (rm.error) throw rm.error;
      }
      const { error: e } = await sb.rpc('delete_my_edc_data');
      if (e) throw e;
    } catch (e) {
      logError('auth.delete.fail', e);
      setError('Couldn’t delete the account right now. Try again, or email support.');
      return false;
    }
    await signOut();
    log('auth.delete');
    return true;
  }, [session, signOut]);

  const refresh = useCallback(async () => {
    await loadProfile(session);
  }, [loadProfile, session]);

  const value = useMemo<AuthState>(
    () => ({ available: accountsAvailable, loading, session, profile, error, signIn, signOut, deleteAccount, refresh }),
    [loading, session, profile, error, signIn, signOut, deleteAccount, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
