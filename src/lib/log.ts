/**
 * A small event log kept on this phone, for support. It records what happened (photo steps, saves, spins, wheel edits,
 * settings changes and errors), newest last, and keeps only the most recent lines. It never holds photos, or the names,
 * brands or notes of anyone's gear. It leaves the phone only when the person chooses "Send log" in Settings, by email.
 */
import { AppState, Platform } from 'react-native';

import { APP_ENV } from '@/lib/env';

const KEY = 'edc.log';
/** How many lines are kept. */
const MAX_LINES = 400;
/** The most text the email carries (a mail link can't hold much more than this safely). */
const MAIL_CHARS = 8000;

let lines: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

try {
  const saved = globalThis.localStorage?.getItem(KEY);
  if (saved) lines = saved.split('\n').filter(Boolean).slice(-MAX_LINES);
} catch {
  lines = [];
}

const two = (n: number) => String(n).padStart(2, '0');
function stamp() {
  const d = new Date();
  return `${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  try {
    globalThis.localStorage?.setItem(KEY, lines.join('\n'));
  } catch {
    // Kept in memory until the app closes.
  }
}

const one = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Adds a line. `detail` is short facts like { items: 3 }: counts and codes, never names or photos. */
export function log(event: string, detail?: Record<string, string | number | boolean | null | undefined> | string) {
  const d = typeof detail === 'string' ? one(detail, 160) : detail ? Object.entries(detail).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${one(v, 60)}`).join(' ') : '';
  lines.push(`${stamp()} ${event}${d ? ` ${d}` : ''}`);
  if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
  if (!timer) timer = setTimeout(flush, 1500);
}

/** An error, with where it came from and the first line of its message. */
export function logError(event: string, err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  const where = (e.stack ?? '').split('\n').slice(1, 2).join('').trim().slice(-80);
  log(event, { error: one(e.message, 120), at: where || undefined });
}

export const flushLog = flush;

export const hasLog = () => lines.length > 0;

/** The log as text, newest last. */
export function logText() {
  return lines.join('\n');
}

/** The most recent lines that fit in an email. */
export function logTail(maxChars = MAIL_CHARS) {
  let out = '';
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const next = `${lines[i]}\n${out}`;
    if (next.length > maxChars) break;
    out = next;
  }
  return out.trimEnd();
}

export function clearLog() {
  lines = [];
  flush();
}

log('app.start', { env: APP_ENV, os: Platform.OS, osVersion: String(Platform.Version), pad: Platform.OS === 'ios' ? Platform.isPad : undefined });
AppState.addEventListener('change', (s) => {
  log('app.state', s);
  if (s !== 'active') flush();
});
