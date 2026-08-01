/**
 * The customer's typed contact details, carried across an OAuth round trip.
 *
 * Signing in from the details step is a FULL-DOCUMENT navigation. Everything
 * else about the in-progress booking survives it, because `useBookingFlow`
 * snapshots to sessionStorage under `lengolf.bayBookingFlow` — but the contact
 * fields are deliberately NOT in that snapshot, so without this they are lost
 * and the sign-in shortcut costs the customer more typing than it saves.
 *
 * Kept as a SEPARATE, short-lived key rather than folded into the flow
 * snapshot, for two reasons:
 *
 *  1. Scope. The flow snapshot is written continuously on every render. This is
 *     written only at the moment a customer chooses to leave for a provider, and
 *     cleared the moment they return, so contact details are not sitting in
 *     storage for the whole session.
 *  2. Blast radius. If the shape here ever breaks, it degrades to "the fields
 *     are empty" rather than corrupting the booking snapshot.
 *
 * sessionStorage, not localStorage: this is a hand-off across one navigation in
 * one tab, not a memory of the customer. Device-level prefill is a separate
 * feature with its own disclosure and erase affordance.
 */

const KEY = 'lengolf.bayBookingContact';

export interface ContactDraft {
  name: string;
  email: string;
  phoneNumber: string | undefined;
}

/** Written synchronously in the sign-in click handler, before the redirect. */
export function saveContactDraft(draft: ContactDraft): void {
  if (typeof window === 'undefined') return;
  try {
    // Nothing typed yet? Don't leave an empty husk that a later read would
    // treat as a draft and use to blank out prefilled fields.
    if (!draft.name && !draft.email && !draft.phoneNumber) {
      window.sessionStorage.removeItem(KEY);
      return;
    }
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private mode, quota, disabled storage. Losing the draft is a worse
    // experience but not a broken one — never let it throw into the click
    // handler and cancel the sign-in itself.
  }
}

/**
 * Read and CLEAR in one step. Single-use by design: the draft exists only to
 * survive one redirect, and leaving it behind would let a stale copy overwrite
 * fields on a later visit.
 */
export function takeContactDraft(): ContactDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;

    return {
      name: typeof o.name === 'string' ? o.name : '',
      email: typeof o.email === 'string' ? o.email : '',
      phoneNumber: typeof o.phoneNumber === 'string' ? o.phoneNumber : undefined,
    };
  } catch {
    // Malformed JSON from an older shape. Drop it rather than throwing during
    // a render, and make sure it cannot come back.
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* storage unavailable — nothing further to do */
    }
    return null;
  }
}

export function clearContactDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
