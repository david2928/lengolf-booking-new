'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Persists a multi-step flow's state to sessionStorage so it survives a
 * component remount. The motivating case: switching language navigates to a
 * different `[locale]` route, which remounts the page and resets every
 * `useState` — bouncing the user back to step 1 mid-booking. Persisting the
 * flow snapshot lets the remounted page restore the user's exact place (and,
 * as a bonus, survives an accidental refresh).
 *
 * Usage: build a plain serialisable `snapshot` of the flow state each render,
 * pass a `restore` callback that applies a saved snapshot to your setState
 * calls, and (optionally) gate writes with `enabled` — e.g. set it false once
 * the flow is complete so the snapshot is cleared and a fresh visit starts over.
 *
 * Restore runs in a mount effect (NOT a lazy useState initializer) so the
 * initial SSR/hydration render always matches the server output; the only
 * visible effect is a brief first paint at the initial step before the saved
 * step is applied. sessionStorage is only ever touched inside effects, so this
 * is SSR-safe.
 *
 * Returns `restored` (true once the mount restore has run) so callers can defer
 * derived work until the saved state has been applied if they need to.
 */
export function useFlowPersistence<T>(
  key: string,
  snapshot: T,
  restore: (saved: T) => void,
  opts?: { enabled?: boolean },
): boolean {
  const enabled = opts?.enabled ?? true;
  const [restored, setRestored] = useState(false);

  // Hold the latest restore closure without making it an effect dependency
  // (the caller recreates it every render; we only invoke it once on mount).
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  // Restore once on mount.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) restoreRef.current(JSON.parse(raw) as T);
    } catch {
      /* corrupt or unavailable storage — start fresh */
    }
    setRestored(true);
  }, [key]);

  // Persist on change, but only AFTER the initial restore so we never clobber
  // the saved snapshot with the component's initial (empty) state on mount.
  const serialized = JSON.stringify(snapshot);
  useEffect(() => {
    if (!restored) return;
    try {
      if (enabled) sessionStorage.setItem(key, serialized);
      else sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key, restored, enabled, serialized]);

  return restored;
}

/** Imperatively clear a persisted flow snapshot (e.g. after a successful submit). */
export function clearFlowPersistence(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
