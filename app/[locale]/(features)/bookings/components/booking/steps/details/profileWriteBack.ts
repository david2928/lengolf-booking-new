/**
 * Should a booking submit write the customer's contact details back to their
 * saved `profiles` row?
 *
 * Two different problems get conflated here, and the whole point of this module
 * is to keep them apart:
 *
 *   1. **Overwriting** a value the customer already has on file. A one-off edit
 *      ("bill this booking to my colleague's phone") must not silently replace
 *      the number the account has used for a year. This is what the
 *      "also update my account" checkbox exists to authorise, and without the
 *      tick we refuse.
 *
 *   2. **Filling** a field that was blank. Nothing is being replaced, nothing
 *      is being lost, and the customer has just typed the value we were
 *      missing. Refusing here is pure data loss on our side. It bites LINE
 *      customers hardest: they routinely arrive with no email on file, so they
 *      see the three plain inputs rather than the read-only identity card
 *      (which is all-or-nothing — see `isIdentityComplete`), never click
 *      Change, and therefore never see the checkbox at all.
 *
 * So: write when the customer ticked the box, **or** when every field the write
 * would touch that actually differs was previously blank. Don't overwrite what
 * we have; do fill what we don't.
 *
 * Kept as a standalone pure function over two plain objects, with no React or
 * Supabase in scope, precisely so the fill-vs-overwrite decision is unit
 * testable — see `__tests__/profile-write-back.test.ts`.
 */

/**
 * The subset of the `profiles` row the booking form holds. Structurally
 * compatible with the `Profile` shape in `useBookingDetailsForm`; `name` is a
 * local mirror of `display_name` populated when the row is fetched, not a
 * column of its own.
 */
export interface ProfileContactSnapshot {
  name: string;
  email: string | null;
  phone_number: string | null;
  display_name: string;
}

export interface ShouldWriteProfileArgs {
  /** The stored row, or `null` when it was never fetched (guest / fetch failed). */
  profile: ProfileContactSnapshot | null;
  name: string;
  email: string;
  phoneNumber: string | undefined;
  /** The "also update my account" opt-in, unticked by default. */
  alsoUpdateAccount: boolean;
}

/** Null, undefined, empty, or nothing but whitespace. */
function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === '';
}

/**
 * Does anything at all differ between the stored row and what is on screen?
 *
 * Deliberately identical to the predicate this file replaced, including the
 * `profile.name` mirror being compared against `name` alongside
 * `profile.display_name`, so the ticked-box path behaves exactly as it did
 * before. Comparisons stay strict `!==` (no trimming) for the same reason.
 */
export function profileNeedsUpdate({
  profile,
  name,
  email,
  phoneNumber,
}: Omit<ShouldWriteProfileArgs, 'alsoUpdateAccount'>): boolean {
  if (!profile) return false;
  return (
    profile.name !== name ||
    profile.email !== email ||
    profile.phone_number !== phoneNumber ||
    profile.display_name !== name
  );
}

/** One column the write would set: what is stored now, what would land there. */
interface WrittenColumn {
  previous: string | null;
  next: string | undefined;
}

/**
 * The columns whose value would actually CHANGE. Only these three exist: the
 * update statement sets `display_name`, `email` and `phone_number`. `name`
 * targets `display_name` — there is no `name` column.
 *
 * This is why the `profile.name` mirror does NOT get a say in the fill check: a
 * blank `profile.name` alongside a real `profile.display_name` is not a blank
 * field, it is a stale mirror, and treating it as a fill would let a name change
 * clobber a real `display_name` without the tick. So the `display_name` decision
 * is made against `profile.display_name` only:
 *
 *   - `display_name` blank, name typed  -> fill, allowed unticked
 *   - `display_name` held a real value  -> overwrite, needs the tick
 *
 * That is the conservative reading, and it is the one that matches what the
 * database actually loses if we get it wrong.
 */
function changedWrittenFields(
  profile: ProfileContactSnapshot,
  { name, email, phoneNumber }: Pick<ShouldWriteProfileArgs, 'name' | 'email' | 'phoneNumber'>,
): WrittenColumn[] {
  const columns: WrittenColumn[] = [
    { previous: profile.display_name, next: name },
    { previous: profile.email, next: email },
    { previous: profile.phone_number, next: phoneNumber },
  ];
  return columns.filter((c) => c.previous !== c.next);
}

export function shouldWriteProfile({
  profile,
  name,
  email,
  phoneNumber,
  alsoUpdateAccount,
}: ShouldWriteProfileArgs): boolean {
  if (!profile) return false;
  if (!profileNeedsUpdate({ profile, name, email, phoneNumber })) return false;

  // The customer explicitly asked for the write. Unchanged from before.
  if (alsoUpdateAccount) return true;

  const changed = changedWrittenFields(profile, { name, email, phoneNumber });
  // Nothing the write touches would change (only the `profile.name` mirror
  // drifted). Skip rather than burn an update that just moves `updated_at`.
  if (changed.length === 0) return false;

  // Fill-only: every column that would change was blank. Note this makes the
  // existing "write all three columns at once" statement safe as-is — the two
  // columns that are not being filled are, by definition of `changed`,
  // identical to what is already stored.
  return changed.every((c) => isBlank(c.previous));
}
