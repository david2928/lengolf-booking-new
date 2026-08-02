/**
 * Edit a booking IN PLACE.
 *
 * The customer-facing surfaces used to offer "Edit" and then cancel the booking
 * and send you back to the start of the booking flow. The booking id changed,
 * the history was split across two rows, and any credit or package attached to
 * it had to be re-applied by hand. This endpoint replaces that: same row, same
 * id, guarded by the same availability logic the staff app has used for years.
 *
 * Serves BOTH surfaces:
 *  - the VIP portal, authenticated by a NextAuth session;
 *  - the membership LIFF app, authenticated by a LINE ID token that we verify
 *    against LINE. Note this endpoint does NOT accept a bare `lineUserId` the
 *    way `/cancel` does. That header is client-supplied and unverifiable; it
 *    only survives on cancel because live clients predate the token rollout.
 *    Editing is new, so it starts with the proven identity and no fallback.
 *
 * Ordering matters throughout. Guards run cheapest-and-most-absolute first
 * (ownership, status, coaching) so a booking that can never be edited is
 * rejected before we spend a round trip on availability; the write is guarded on
 * `status = 'confirmed'` so a cancel landing mid-request cannot be overwritten;
 * and the post-write re-check exists because the availability answer is a
 * snapshot, not a lock.
 */

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { denyVipAccess } from '@/lib/auth/vip-access';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyLineIdToken } from '@/lib/auth/line-id-token';
import { appCache } from '@/lib/cache';
import { parseBangkokDate } from '@/utils/date';
import { ALL_DURATIONS } from '@/lib/booking-durations';
import {
  MAX_CUSTOMER_NOTES_LENGTH,
  MAX_PEOPLE,
  MIN_PEOPLE,
  computeEditability,
  computeEndTime,
  freeBaysFromAvailability,
  isPlayFoodBooking,
  selectBayForEditedSlot,
} from '@/lib/booking-edit-rules';
import { buildBookingModifiedMessage, pushToStaffGroup } from '@/lib/notifications/staffLine';
import type { ModifiedField } from '@/lib/notifications/staffLine';
import { sendBookingModificationEmail } from '@/lib/notifications/bookingModificationEmail';
import { getDisplayBayName } from '@/lib/lineNotifyService';
import type { ModifyVipBookingChanges, ModifyVipBookingErrorCode } from '@/types/vip';

interface ModifyBookingRequest {
  date?: string;
  start_time?: string;
  duration?: number;
  number_of_people?: number;
  customer_notes?: string | null;
}

interface ModifyRouteContext {
  params: Promise<{ bookingId: string }>;
}

/** Every failure carries a machine code so the UI can say something specific. */
function fail(
  code: ModifyVipBookingErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):(00|30)$/;

export async function PUT(request: NextRequest, context: ModifyRouteContext) {
  const { bookingId } = await context.params;
  const admin = createAdminClient();

  try {
    // ── 1. Authenticate ───────────────────────────────────────────────────
    let profileId: string;
    let userCustomerId: string | null = null;
    let channel = 'the booking site';

    const idTokenHeader = request.headers.get('x-line-id-token');
    const claimedLineUserId = request.headers.get('x-line-user-id');
    const verifiedLineUserId = await verifyLineIdToken(idTokenHeader);

    if (idTokenHeader && !verifiedLineUserId) {
      // A token was offered and did not verify. Never fall through to the
      // session — the caller told us who they are and could not prove it.
      return fail('UNAUTHORIZED', 'Your LINE session has expired. Please reopen this page.', 401);
    }

    if (verifiedLineUserId) {
      if (claimedLineUserId && claimedLineUserId !== verifiedLineUserId) {
        console.error('[VIP Modify] claimed LINE id does not match the verified token');
        return fail('UNAUTHORIZED', 'Unauthorized', 401);
      }

      const { data: lineProfile, error: lineProfileError } = await admin
        .from('profiles')
        .select('id, customer_id')
        .eq('provider', 'line')
        .eq('provider_id', verifiedLineUserId)
        .maybeSingle();

      if (lineProfileError || !lineProfile) {
        return fail('NOT_FOUND', 'LINE user profile not found.', 404);
      }
      if (!lineProfile.customer_id) {
        return fail('ACCOUNT_NOT_LINKED', 'Your account is not linked to a customer record.', 403);
      }

      profileId = lineProfile.id;
      userCustomerId = lineProfile.customer_id;
      channel = 'LINE';
    } else {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return fail('UNAUTHORIZED', 'Unauthorized', 401);
      }

      // A guest session resolves on email alone, so it is not proof of identity
      // (see lib/auth/vip-access.ts). Editing is a write; hold it to the same
      // bar as cancelling.
      const denial = denyVipAccess(session);
      if (denial) return denial;

      const { data: userProfile, error: profileError } = await admin
        .from('profiles')
        .select('customer_id')
        .eq('id', session.user.id)
        .single();

      if (profileError || !userProfile) {
        return fail('NOT_FOUND', 'User profile not found.', 404);
      }

      profileId = session.user.id;
      userCustomerId = userProfile.customer_id;
    }

    // ── 2. Parse and validate the patch ───────────────────────────────────
    let body: ModifyBookingRequest;
    try {
      body = await request.json();
    } catch {
      return fail('VALIDATION_ERROR', 'Invalid request body.', 400);
    }

    const { date, start_time, duration, number_of_people, customer_notes } = body;

    // `!== undefined` throughout, never truthiness: `if (duration)` silently
    // drops a legitimate 0 and, worse, reads as if it validated something.
    if (date !== undefined && (typeof date !== 'string' || !DATE_PATTERN.test(date))) {
      return fail('VALIDATION_ERROR', 'date must be formatted as YYYY-MM-DD.', 400);
    }
    if (start_time !== undefined && (typeof start_time !== 'string' || !TIME_PATTERN.test(start_time))) {
      return fail('VALIDATION_ERROR', 'start_time must be a half-hour slot formatted as HH:mm.', 400);
    }
    if (duration !== undefined && !ALL_DURATIONS.includes(duration)) {
      return fail('VALIDATION_ERROR', 'duration is not a bookable session length.', 400);
    }
    if (
      number_of_people !== undefined &&
      (!Number.isInteger(number_of_people) ||
        number_of_people < MIN_PEOPLE ||
        number_of_people > MAX_PEOPLE)
    ) {
      return fail('VALIDATION_ERROR', `number_of_people must be between ${MIN_PEOPLE} and ${MAX_PEOPLE}.`, 400);
    }
    if (customer_notes !== undefined && customer_notes !== null) {
      if (typeof customer_notes !== 'string') {
        return fail('VALIDATION_ERROR', 'customer_notes must be text.', 400);
      }
      if (customer_notes.length > MAX_CUSTOMER_NOTES_LENGTH) {
        return fail('VALIDATION_ERROR', `customer_notes is limited to ${MAX_CUSTOMER_NOTES_LENGTH} characters.`, 400);
      }
    }

    if (
      date === undefined &&
      start_time === undefined &&
      duration === undefined &&
      number_of_people === undefined &&
      customer_notes === undefined
    ) {
      return fail('NO_FIELDS', 'No changes were provided.', 400);
    }

    // ── 3. Load the booking and check ownership ───────────────────────────
    const { data: currentBooking, error: fetchError } = await admin
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !currentBooking) {
      return fail('NOT_FOUND', `Booking ${bookingId} was not found.`, 404);
    }

    const hasDirectAccess = currentBooking.user_id === profileId;
    const hasCustomerAccess = Boolean(
      userCustomerId && currentBooking.customer_id === userCustomerId
    );
    if (!hasDirectAccess && !hasCustomerAccess) {
      return fail('FORBIDDEN', 'You do not own this booking.', 403);
    }

    // ── 4. Eligibility ────────────────────────────────────────────────────
    const editability = computeEditability({
      status: currentBooking.status,
      date: currentBooking.date,
      start_time: currentBooking.start_time,
      booking_type: currentBooking.booking_type,
    });

    if (!editability.canEdit) {
      const messages: Record<string, string> = {
        NOT_CONFIRMED: 'Only confirmed bookings can be changed.',
        COACHING_NOT_EDITABLE:
          'Coaching sessions are scheduled with your coach. Please message us on LINE to reschedule.',
        BOOKING_IN_PAST: 'This booking has already started and can no longer be changed.',
        TOO_LATE_TO_EDIT: 'It is too close to your start time to change this booking online.',
      };
      const code = editability.reason as ModifyVipBookingErrorCode;
      return fail(code, messages[code] ?? 'This booking cannot be changed.', 409);
    }

    // ── 5. Resolve the proposed slot ──────────────────────────────────────
    const newDate = date ?? currentBooking.date;
    const newStartTime = start_time ?? currentBooking.start_time;
    const newDuration = duration ?? currentBooking.duration;
    const newPeople = number_of_people ?? currentBooking.number_of_people;

    const slotChanged =
      newDate !== currentBooking.date ||
      newStartTime !== currentBooking.start_time ||
      newDuration !== currentBooking.duration;

    if (slotChanged) {
      const newStartsAt = parseBangkokDate(newDate, newStartTime);
      if (Number.isNaN(newStartsAt.getTime())) {
        return fail('VALIDATION_ERROR', 'The requested date and time could not be read.', 400);
      }
      if (newStartsAt.getTime() <= Date.now()) {
        return fail('NEW_TIME_IN_PAST', 'Please choose a time in the future.', 400);
      }
    }

    // ── 6. Guards on things already attached to this booking ──────────────
    const durationChanged = newDuration !== currentBooking.duration;

    // Play & Food sets bundle hours with the food order; the length is part of
    // what was bought. Date and time stay editable.
    if (
      durationChanged &&
      isPlayFoodBooking(currentBooking.booking_type, currentBooking.package_name)
    ) {
      return fail(
        'DURATION_LOCKED',
        'Your Play & Food set includes a fixed number of hours, so the length cannot be changed here. You can still move the date and time.',
        409
      );
    }

    // Credit hours already applied cannot be stranded by a shorter booking.
    // Mirrors the staff-side invariant in lengolf-forms; the wallet's refund
    // trigger only fires on cancel, so nothing would give these hours back.
    if (durationChanged && newDuration < currentBooking.duration) {
      // Through a `public` wrapper, not `.schema('backoffice')`: both Supabase
      // clients in this app are pinned to `public`, which is why every other
      // backoffice read here goes through a SECURITY DEFINER wrapper too
      // (get_customer_packages, get_customer_credit_balance).
      const { data: creditData, error: creditError } = await admin.rpc(
        'get_booking_credit_hours',
        { p_booking_id: bookingId }
      );

      if (creditError) {
        console.error(`[VIP Modify] Credit lookup failed for ${bookingId}:`, creditError);
        return fail('INTERNAL', 'Could not verify credits on this booking.', 500);
      }

      const creditHours = Number(creditData ?? 0);

      if (creditHours > 0 && newDuration < creditHours) {
        return fail(
          'CREDIT_INVARIANT',
          `This booking has ${creditHours}h of free credit applied, so it cannot be shortened below that.`,
          409,
          { creditHours }
        );
      }
    }

    // A package that expires before the new date would leave the booking
    // pointing at something the customer can no longer use.
    if (currentBooking.package_id && newDate !== currentBooking.date && currentBooking.customer_id) {
      const { data: packages, error: packagesError } = await admin.rpc('get_customer_packages', {
        customer_id_param: currentBooking.customer_id,
      });

      if (packagesError) {
        console.warn(`[VIP Modify] Package lookup failed for ${bookingId}:`, packagesError);
      } else if (Array.isArray(packages)) {
        const linked = packages.find(
          (pkg: { package_id?: string }) => pkg.package_id === currentBooking.package_id
        ) as { expiration_date?: string | null } | undefined;

        // String compare is exact here: both sides are `yyyy-MM-dd` Bangkok
        // calendar dates, so no Date parsing (and no timezone) is involved.
        if (linked?.expiration_date && newDate > linked.expiration_date) {
          return fail(
            'PACKAGE_EXPIRED',
            'Your package expires before that date. Please choose an earlier date or contact us on LINE.',
            409,
            { expiresOn: linked.expiration_date }
          );
        }
      }
    }

    // ── 7. Availability and bay reassignment ──────────────────────────────
    let assignedBay: string | null = currentBooking.bay;

    if (slotChanged) {
      const { data: bayAvailability, error: availabilityError } = await admin.rpc(
        'check_all_bays_availability',
        {
          p_date: newDate,
          p_start_time: newStartTime,
          p_duration: newDuration,
          // The booking must not collide with itself. This one argument is what
          // makes an in-place edit possible at all.
          p_exclude_booking_id: bookingId,
        }
      );

      if (availabilityError) {
        console.error(`[VIP Modify] Availability check failed for ${bookingId}:`, availabilityError);
        return fail('INTERNAL', 'Could not check availability. Please try again.', 500);
      }

      const freeBays = freeBaysFromAvailability(bayAvailability);
      const selection = selectBayForEditedSlot({ currentBay: currentBooking.bay, freeBays });

      if (!selection.bay) {
        return fail('SLOT_UNAVAILABLE', 'That time is no longer available.', 409, {
          otherBayTypeAvailable: selection.otherBayTypeAvailable,
        });
      }

      assignedBay = selection.bay;

      // Rental clubs are reserved against the slot, so moving the booking moves
      // the reservation. Unlike create — which quietly drops the set rather than
      // failing the whole booking — an edit refuses, because the customer still
      // has their original slot to fall back on and would otherwise lose the
      // clubs without being told.
      if (currentBooking.rental_club_set_id) {
        const { data: clubCount, error: clubError } = await admin.rpc(
          'check_club_set_availability',
          {
            p_set_id: currentBooking.rental_club_set_id,
            p_start_date: newDate,
            p_end_date: newDate,
            p_start_time: newStartTime,
            p_duration_hours: newDuration,
            p_rental_type: 'indoor',
            p_return_time: null,
            p_exclude_booking_id: bookingId,
          }
        );

        if (clubError) {
          console.error(`[VIP Modify] Club set check failed for ${bookingId}:`, clubError);
          return fail('INTERNAL', 'Could not check club availability. Please try again.', 500);
        }
        if (clubCount === null || clubCount < 1) {
          return fail(
            'CLUB_SET_UNAVAILABLE',
            'Your reserved club set is already booked at that time. Please choose another slot.',
            409
          );
        }
      }
    }

    // ── 8. Write, guarded on the state we validated ───────────────────────
    const updatePayload: Record<string, unknown> = {
      updated_by_type: 'user',
      updated_by_identifier: profileId,
    };
    if (date !== undefined) updatePayload.date = newDate;
    if (start_time !== undefined) updatePayload.start_time = newStartTime;
    if (duration !== undefined) updatePayload.duration = newDuration;
    if (number_of_people !== undefined) updatePayload.number_of_people = newPeople;
    if (customer_notes !== undefined) updatePayload.customer_notes = customer_notes;
    if (slotChanged && assignedBay !== currentBooking.bay) updatePayload.bay = assignedBay;

    const { data: updatedBooking, error: updateError } = await admin
      .from('bookings')
      .update(updatePayload)
      // Filtering on the status we checked turns "read then write" into a
      // compare-and-swap: a cancellation that lands between the two matches zero
      // rows instead of being silently resurrected as a confirmed booking.
      .eq('id', bookingId)
      .eq('status', 'confirmed')
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error(`[VIP Modify] Update failed for ${bookingId}:`, updateError);
      return fail('INTERNAL', 'Could not save your changes.', 500);
    }
    if (!updatedBooking) {
      return fail(
        'STATE_CHANGED',
        'This booking changed while you were editing it. Please reload and try again.',
        409
      );
    }

    // ── 9. Re-verify: the availability answer above was a snapshot ─────────
    // Two customers editing onto the same slot both pass step 7 and both write.
    // Re-asking after the write is what actually detects that, and whoever loses
    // gets their original booking back rather than a double-booked bay.
    if (slotChanged) {
      const { data: stillFree, error: recheckError } = await admin.rpc('check_availability', {
        p_date: newDate,
        p_bay: assignedBay,
        p_start_time: newStartTime,
        p_duration: newDuration,
        p_exclude_booking_id: bookingId,
      });

      if (recheckError) {
        console.warn(`[VIP Modify] Post-write re-check failed for ${bookingId}:`, recheckError);
      } else if (stillFree === false) {
        const { error: revertError } = await admin
          .from('bookings')
          .update({
            date: currentBooking.date,
            start_time: currentBooking.start_time,
            duration: currentBooking.duration,
            bay: currentBooking.bay,
          })
          .eq('id', bookingId);

        if (revertError) {
          console.error(
            `[VIP Modify] CRITICAL: could not revert ${bookingId} after losing the race:`,
            revertError
          );
        }

        return fail('SLOT_UNAVAILABLE', 'That time was taken while you were booking it.', 409, {
          otherBayTypeAvailable: false,
          raced: true,
        });
      }
    }

    // ── 10. What changed, for the response and the notifications ──────────
    const changes: ModifyVipBookingChanges = {};
    if (updatedBooking.date !== currentBooking.date) {
      changes.date = { from: currentBooking.date, to: updatedBooking.date };
    }
    if (updatedBooking.start_time !== currentBooking.start_time) {
      changes.start_time = { from: currentBooking.start_time, to: updatedBooking.start_time };
    }
    if (updatedBooking.duration !== currentBooking.duration) {
      changes.duration = { from: currentBooking.duration, to: updatedBooking.duration };
    }
    if (updatedBooking.bay !== currentBooking.bay) {
      changes.bay = { from: currentBooking.bay, to: updatedBooking.bay };
    }
    if (updatedBooking.number_of_people !== currentBooking.number_of_people) {
      changes.number_of_people = {
        from: currentBooking.number_of_people,
        to: updatedBooking.number_of_people,
      };
    }
    if (updatedBooking.customer_notes !== currentBooking.customer_notes) {
      changes.customer_notes = {
        from: currentBooking.customer_notes,
        to: updatedBooking.customer_notes,
      };
    }

    const changedFields = Object.keys(changes);

    // ── 11. Audit trail ───────────────────────────────────────────────────
    const changesSummary = changedFields.length
      ? changedFields
          .map((field) => {
            const change = changes[field as keyof ModifyVipBookingChanges];
            return `${field}: ${String(change?.from ?? '—')} → ${String(change?.to ?? '—')}`;
          })
          .join(', ')
      : 'No effective change';

    const { error: historyError } = await admin.from('booking_history').insert({
      booking_id: bookingId,
      action_type: 'MODIFY_BOOKING',
      changed_by_type: 'user',
      changed_by_identifier: profileId,
      changes_summary: changesSummary,
      old_booking_snapshot: currentBooking,
      new_booking_snapshot: updatedBooking,
      notes: `Modified by the customer via ${channel === 'LINE' ? 'the LINE app' : 'the VIP portal'}`,
    });
    if (historyError) {
      console.error(`[VIP Modify] Failed to write booking history for ${bookingId}:`, historyError);
    }

    // ── 12. Downstream: the review request follows the booking ─────────────
    if (slotChanged) {
      const endsAt = parseBangkokDate(
        updatedBooking.date,
        computeEndTime(updatedBooking.start_time, updatedBooking.duration)
      );
      const { error: reviewError } = await admin
        .from('scheduled_review_requests')
        .update({ scheduled_time: new Date(endsAt.getTime() + 30 * 60 * 1000).toISOString() })
        .eq('booking_id', bookingId)
        .eq('status', 'pending');
      if (reviewError) {
        console.warn(`[VIP Modify] Could not reschedule review request for ${bookingId}:`, reviewError);
      }
    }

    // The LIFF detail route caches for 30s. Per-instance, so best effort — the
    // success screen renders from this response rather than refetching, and the
    // detail page asks for a fresh read after an edit.
    if (verifiedLineUserId) {
      appCache.del(`booking_detail_${verifiedLineUserId}_${bookingId}`);
      appCache.del(`membership_data_${verifiedLineUserId}`);
    }

    // ── 13. Notify, awaited before responding ─────────────────────────────
    // Not `after()`: staff act on this, and a bay move nobody announced is a bay
    // move the desk discovers when two groups arrive at once.
    const notify: Promise<unknown>[] = [];

    const field = <T,>(from: T, to: T): T | ModifiedField<T> =>
      from === to ? to : { from, to };

    const oldEnd = computeEndTime(currentBooking.start_time, currentBooking.duration);
    const newEnd = computeEndTime(updatedBooking.start_time, updatedBooking.duration);

    let customerName: string | null = null;
    let customerEmail: string | null = null;
    let customerPhone: string | null = currentBooking.phone_number ?? null;
    let bookingLanguage: string | null = updatedBooking.language ?? null;

    if (updatedBooking.customer_id) {
      const { data: customer } = await admin
        .from('customers')
        .select('customer_name, contact_number, email, preferred_language')
        .eq('id', updatedBooking.customer_id)
        .single();
      if (customer) {
        customerName = customer.customer_name;
        customerEmail = customer.email;
        if (customer.contact_number) customerPhone = customer.contact_number;
        if (!bookingLanguage) bookingLanguage = customer.preferred_language;
      }
    }
    const displayName = customerName || updatedBooking.name || 'Customer';
    customerEmail = customerEmail || updatedBooking.email || null;

    notify.push(
      pushToStaffGroup(
        buildBookingModifiedMessage({
          bookingId,
          customerName: displayName,
          phoneNumber: customerPhone,
          bookingDate: field(currentBooking.date, updatedBooking.date),
          bookingStartTime: field(currentBooking.start_time, updatedBooking.start_time),
          bookingEndTime: field(oldEnd, newEnd),
          duration: field(currentBooking.duration, updatedBooking.duration),
          bayNumber: field(
            getDisplayBayName(currentBooking.bay),
            getDisplayBayName(updatedBooking.bay)
          ),
          numberOfPeople: field(currentBooking.number_of_people, updatedBooking.number_of_people),
          customerNotes: updatedBooking.customer_notes,
          channel,
        })
      ).catch((err) =>
        console.error(`[VIP Modify] Staff LINE notification failed for ${bookingId}:`, err)
      )
    );

    if (customerEmail) {
      notify.push(
        sendBookingModificationEmail({
          email: customerEmail,
          userName: displayName,
          bookingId,
          date: updatedBooking.date,
          startTime: updatedBooking.start_time,
          endTime: newEnd,
          duration: updatedBooking.duration,
          numberOfPeople: updatedBooking.number_of_people ?? 1,
          previousDate: slotChanged ? currentBooking.date : undefined,
          previousStartTime: slotChanged ? currentBooking.start_time : undefined,
          previousEndTime: slotChanged ? oldEnd : undefined,
          language: bookingLanguage ?? undefined,
        }).catch((err) =>
          console.error(`[VIP Modify] Modification email failed for ${bookingId}:`, err)
        )
      );
    } else {
      console.warn(`[VIP Modify] No email on file for ${bookingId}; skipping customer email`);
    }

    await Promise.all(notify);

    return NextResponse.json({
      success: true,
      booking: updatedBooking,
      changes,
    });
  } catch (error: unknown) {
    console.error(`[VIP Modify] Unexpected error for booking ${bookingId}:`, error);
    return fail('INTERNAL', 'An unexpected error occurred while saving your changes.', 500);
  }
}
