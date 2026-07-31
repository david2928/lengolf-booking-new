import type { BayType } from '@/lib/bayConfig';

/**
 * The `bookings.detailsStep` key naming a bay choice.
 *
 * Five surfaces state the bay — step 3's recap card, the collapsed Session
 * summary, the desktop `SummaryRail`, the mobile `BookingReviewPanel` and the
 * step header's subline — and they must never disagree, so the mapping lives
 * here once instead of being re-expressed at each call site. It was re-expressed
 * twice before, and the two copies had already drifted: the header printed
 * nothing at all for a customer with no bay preference while the rail printed
 * "Social Bay", which was simply untrue.
 *
 * The absent case is the point. `null` (and `undefined`, which is the same
 * answer arriving through an optional prop) means "All Bays" — a deliberate
 * choice not to express a preference, which `/api/bookings/create` honours by
 * assigning whichever bay is free. It is not a missing value, so it gets a name
 * rather than a blank or a default of Social.
 *
 * Returns a key, not a string, because the callers hold different translators
 * (`useTranslations` in the flow, `getTranslations` were this ever to move
 * server-side) and because a literal key union is what next-intl typechecks
 * against.
 */
export function bayChoiceLabelKey(
  bayType: BayType | null | undefined,
): 'aiLab' | 'socialBay' | 'anyBay' {
  if (bayType === 'ai_lab') return 'aiLab';
  if (bayType === 'social') return 'socialBay';
  return 'anyBay';
}
