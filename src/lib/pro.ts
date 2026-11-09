/**
 * Pro: what the free version holds back. Pro comes from either a store purchase on this phone or a premium account.
 *
 * Until the purchase and account screens ship in the store build, nothing is held back there (PRO_ENFORCED is false in
 * production), so the store app behaves exactly as before. Dev builds enforce it, with a switch in Pro & account to test
 * both sides. Flip PRO_ENFORCED when Pro goes on sale.
 */
import { useSyncExternalStore } from 'react';

import { IS_DEV_BUILD } from '@/lib/env';
import { readPref, writePref } from '@/lib/preferences';

export const PRO_ENFORCED = IS_DEV_BUILD;

export const FREE_MAX_ITEMS = 20;
export const PRO_MAX_ITEMS = 1000;

/** What Pro adds, in the words the upgrade screen uses. */
export const PRO_FEATURES = [
  'More than 20 items',
  'Photos cut out along the item’s outline',
  'Several items in one photo, found and recognized',
  'Import and export (CSV and printable carry card)',
  'Sign in for cloud backup and sync across your devices',
] as const;

export type ProGate = 'outline' | 'multi-scan' | 'import-export' | 'items' | 'account';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

let accountPremium = false;

/** A store purchase on this phone. Dev builds start with it on (so nothing is limited while testing). */
export const getPurchased = () => {
  const v = readPref('edc.pro');
  return v === null ? IS_DEV_BUILD : v === '1';
};
export function setPurchased(on: boolean) {
  writePref('edc.pro', on ? '1' : '0');
  emit();
}

/** Set by the account code from the signed-in profile (premium tier that hasn't run out). */
export function setAccountPremium(on: boolean) {
  if (accountPremium === on) return;
  accountPremium = on;
  emit();
}

export const getPro = () => !PRO_ENFORCED || getPurchased() || accountPremium;

// The snapshot has to be a stable primitive: combine the two sources into one string.
const snapshot = () => (getPro() ? '1' : '0');
export const usePro = () => useSyncExternalStore(subscribe, snapshot, () => '1') === '1';

export const maxItemsFor = (pro: boolean) => (pro ? PRO_MAX_ITEMS : FREE_MAX_ITEMS);
