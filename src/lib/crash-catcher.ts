/**
 * Catches fatal JavaScript errors so the app shows them (see StartupError in
 * app/_layout.tsx) instead of closing. A release build normally quits on a
 * fatal JS error, which leaves nothing to go on without a crash report.
 *
 * Imported first by the root layout, so it's installed before anything else runs.
 */
import { flushLog, logError } from '@/lib/log';

type Listener = (e: Error) => void;

let last: Error | null = null;
const listeners = new Set<Listener>();

type ErrorUtilsShape = {
  getGlobalHandler: () => (e: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (h: (e: unknown, isFatal?: boolean) => void) => void;
};
const EU = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;

if (EU) {
  const original = EU.getGlobalHandler();
  EU.setGlobalHandler((e, isFatal) => {
    const err = e instanceof Error ? e : new Error(String(e));
    logError(isFatal ? 'error.fatal' : 'error.js', err);
    if (isFatal) flushLog();
    if (isFatal) {
      last = err;
      listeners.forEach((l) => l(err));
      // Not passing fatal errors on keeps the app open so the message can be read.
      return;
    }
    original(e, isFatal);
  });
}

export function lastFatalError(): Error | null {
  return last;
}

export function onFatalError(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
