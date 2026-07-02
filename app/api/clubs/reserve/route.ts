import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCoursePrice, getGearUpItems } from '@/types/golf-club-rental';
import type { ClubReserveRequest, ClubRentalAddOn } from '@/types/golf-club-rental';
import { sendCourseRentalConfirmationEmail, resolveEmailLocale } from '@/lib/emailService';
import { composeRentalLineMessage } from '@/lib/club-rental/lineMessage';
import { createCourseOrderHeader } from '@/lib/club-rental/orders';

/** Build trusted add-on price/label map at request time for dynamic pricing */
function getTrustedAddons(): Record<string, { price: number; label: string }> {
  return Object.fromEntries(
    getGearUpItems().map(item => [item.id, { price: item.price, label: item.name }])
  );
}

const DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_NOTES_LENGTH = 1000;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;

// Helper to get base URL for server-side fetch
function getBaseUrl(): string {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (baseUrl && !baseUrl.startsWith('http')) return `http://${baseUrl}`;
  if (!baseUrl && process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return baseUrl;
}

export async function POST(request: NextRequest) {
  try {
    const body: ClubReserveRequest = await request.json();

    const {
      rental_club_set_id,
      rental_type,
      start_date,
      start_time,
      duration_hours,
      duration_days,
      booking_id,
      customer_name,
      customer_email,
      customer_phone,
      add_ons = [],
      delivery_requested = false,
      delivery_address,
      delivery_lat,
      delivery_lng,
      delivery_time,
      return_time,
      notes: customerNotes,
      source = 'booking_app',
      language: bodyLanguage,
      payment_method: rawPaymentMethod,
      payment_method_chosen: rawPaymentMethodChosen,
      contact_preference: rawContactPreference,
    } = body;

    // Customer-facing booking choices stored in their own columns so the
    // free-form `notes` field stays strictly customer-typed (see CLAUDE.md
    // — booking form previously concatenated these into notes and leaked
    // into the customer confirmation email).
    const VALID_PAYMENT_CHOICES = new Set(['online_shopeepay', 'cash_at_pickup']);
    const VALID_CONTACT_PREFS = new Set(['line', 'email', 'whatsapp']);
    const paymentMethodChosen: string | null =
      typeof rawPaymentMethodChosen === 'string' &&
      VALID_PAYMENT_CHOICES.has(rawPaymentMethodChosen)
        ? rawPaymentMethodChosen
        : null;
    const contactPreference: string | null =
      typeof rawContactPreference === 'string' &&
      VALID_CONTACT_PREFS.has(rawContactPreference)
        ? rawContactPreference
        : null;

    // Normalize / validate the payment method. Course rentals branch
    // on this; indoor rentals ignore it. Server-side guard: delivery
    // forces card (frontend already enforces this; defense in depth).
    const paymentMethod: 'cash' | 'card' = rawPaymentMethod === 'cash' ? 'cash' : 'card';
    if (delivery_requested && paymentMethod === 'cash') {
      return NextResponse.json(
        { error: 'Delivery requires online payment (card / ShopeePay).' },
        { status: 400 }
      );
    }
    const requiresPrepay = rental_type === 'course' && paymentMethod === 'card';

    // Only accept customer_id/user_id from trusted internal sources (booking_app with booking_id)
    const customer_id = booking_id ? (body.customer_id || null) : null;
    const user_id = booking_id ? (body.user_id || null) : null;

    // Validate required fields
    if (!rental_club_set_id || !rental_type || !start_date || !customer_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate rental_type
    if (!['indoor', 'course'].includes(rental_type)) {
      return NextResponse.json({ error: 'Invalid rental type' }, { status: 400 });
    }

    // Indoor club choice now lives on bookings.rental_club_set_id (written by
    // /api/bookings/create). This endpoint serves COURSE rentals only — indoor can
    // no longer create a club_rentals row. Mirrors forms /api/clubs/reserve (#186).
    if (rental_type !== 'course') {
      return NextResponse.json(
        { error: 'This endpoint now serves course rentals only. Indoor club choice is stored on the booking.' },
        { status: 400 }
      );
    }

    // Validate UUID format for club set ID
    if (!UUID_REGEX.test(rental_club_set_id)) {
      return NextResponse.json({ error: 'Invalid club set ID format' }, { status: 400 });
    }
    // booking_id uses text format (e.g. BK260307LK9Z), validate length only
    if (booking_id && (booking_id.length > 20 || !/^[A-Za-z0-9]+$/.test(booking_id))) {
      return NextResponse.json({ error: 'Invalid booking ID format' }, { status: 400 });
    }

    // Validate date formats
    if (!DATE_REGEX.test(start_date)) {
      return NextResponse.json({ error: 'Invalid start_date format (YYYY-MM-DD)' }, { status: 400 });
    }
    if (body.end_date && !DATE_REGEX.test(body.end_date)) {
      return NextResponse.json({ error: 'Invalid end_date format (YYYY-MM-DD)' }, { status: 400 });
    }

    // Validate source
    const validSources = ['website', 'booking_app', 'liff', 'staff', 'line'];
    if (!validSources.includes(source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
    }

    // Validate string lengths
    if (customer_name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: 'Customer name is too long' }, { status: 400 });
    }
    if (customer_email && customer_email.length > MAX_EMAIL_LENGTH) {
      return NextResponse.json({ error: 'Email is too long' }, { status: 400 });
    }
    if (customer_phone && customer_phone.length > MAX_PHONE_LENGTH) {
      return NextResponse.json({ error: 'Phone number is too long' }, { status: 400 });
    }
    if (delivery_address && delivery_address.length > MAX_ADDRESS_LENGTH) {
      return NextResponse.json({ error: 'Delivery address is too long' }, { status: 400 });
    }
    if (delivery_lat != null) {
      const lat = Number(delivery_lat);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return NextResponse.json({ error: 'Invalid delivery_lat' }, { status: 400 });
      }
    }
    if (delivery_lng != null) {
      const lng = Number(delivery_lng);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        return NextResponse.json({ error: 'Invalid delivery_lng' }, { status: 400 });
      }
    }
    if (customerNotes && customerNotes.length > MAX_NOTES_LENGTH) {
      return NextResponse.json({ error: 'Notes are too long' }, { status: 400 });
    }

    // Validate delivery address when delivery is requested
    if (delivery_requested && !delivery_address?.trim()) {
      return NextResponse.json({ error: 'Delivery address is required for delivery orders' }, { status: 400 });
    }

    // Validate time formats if provided (HH:MM)
    if (delivery_time && !TIME_REGEX.test(delivery_time)) {
      return NextResponse.json({ error: 'Invalid delivery time format' }, { status: 400 });
    }
    if (return_time && !TIME_REGEX.test(return_time)) {
      return NextResponse.json({ error: 'Invalid return time format' }, { status: 400 });
    }

    // Course rentals must carry pickup + return time. Without them the server
    // can't authoritatively compute billable days (see effective_duration_days
    // below) and would have to trust the client — that was the original bug.
    if (rental_type === 'course' && (!start_time || !return_time)) {
      return NextResponse.json(
        { error: 'Pickup time and return time are required for course rentals' },
        { status: 400 }
      );
    }

    // Validate add-ons: use trusted server-side prices AND labels
    // Exclude 'delivery' add-on to prevent double-charging with delivery_fee
    const trustedAddons = getTrustedAddons();
    for (const addon of add_ons) {
      if (addon.key === 'delivery') continue; // delivery is handled via delivery_fee, not as add-on
      if (trustedAddons[addon.key] === undefined) {
        return NextResponse.json({ error: `Unknown add-on: ${addon.key}` }, { status: 400 });
      }
    }
    const validatedAddOns: ClubRentalAddOn[] = add_ons
      .filter((addon: ClubRentalAddOn) => addon.key !== 'delivery')
      .map((addon: ClubRentalAddOn) => ({
        key: addon.key,
        label: trustedAddons[addon.key].label,
        price: trustedAddons[addon.key].price,
      }));

    // Calculate end_date: "1 day" means return next day, so end = start + duration.
    // Contract: an explicit body.end_date wins over duration_days-derived end_date.
    // The time-aware recompute below is what actually determines billing duration,
    // so the only role of end_date here is the date range for the availability check.
    let end_date = body.end_date || start_date;
    if (rental_type === 'course' && duration_days && !body.end_date) {
      const start = new Date(start_date);
      start.setDate(start.getDate() + duration_days);
      end_date = start.toISOString().split('T')[0];
    }

    // For course rentals, recompute duration_days authoritatively from pickup/return
    // time so the client can't underpay by spanning >24h within "1 calendar day".
    // 1-hour grace at handover. Falls back to date diff if times missing.
    let effective_duration_days = duration_days;
    if (rental_type === 'course') {
      if (start_time && return_time) {
        const pickupMs = new Date(`${start_date}T${start_time}:00+07:00`).getTime();
        const returnMs = new Date(`${end_date}T${return_time}:00+07:00`).getTime();
        const billableMs = Math.max(0, returnMs - pickupMs - 3_600_000);
        effective_duration_days = Math.max(1, Math.ceil(billableMs / 86_400_000));
      } else if (end_date && end_date !== start_date) {
        effective_duration_days = Math.max(1, Math.round(
          (new Date(end_date).getTime() - new Date(start_date).getTime()) / 86_400_000
        ));
      }
    }

    const supabase = createAdminClient();

    // Check availability
    const { data: availableCount, error: availError } = await supabase.rpc('check_club_set_availability', {
      p_set_id: rental_club_set_id,
      p_start_date: start_date,
      p_end_date: end_date,
      p_start_time: start_time || null,
      p_duration_hours: duration_hours || null,
    });

    if (availError) {
      console.error('[ClubReserve] Availability check error:', availError);
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
    }

    if (!availableCount || availableCount <= 0) {
      return NextResponse.json(
        { error: 'This club set is not available for the selected dates/time' },
        { status: 409 }
      );
    }

    // Get the club set details for pricing
    const { data: clubSet, error: setError } = await supabase
      .from('rental_club_sets')
      .select('*')
      .eq('id', rental_club_set_id)
      .single();

    if (setError || !clubSet) {
      return NextResponse.json({ error: 'Club set not found' }, { status: 404 });
    }

    // Calculate pricing (course-only endpoint — indoor lives on bookings.rental_club_set_id)
    let rental_price = 0;
    if (effective_duration_days) {
      rental_price = getCoursePrice(clubSet, effective_duration_days);
    }

    const add_ons_total = validatedAddOns.reduce((sum: number, item: ClubRentalAddOn) => sum + item.price, 0);
    const delivery_fee = delivery_requested ? 500 : 0;
    const total_price = rental_price + add_ons_total + delivery_fee;

    // Generate rental code
    const { data: rentalCode, error: codeError } = await supabase.rpc('generate_rental_code');
    if (codeError || !rentalCode) {
      console.error('[ClubReserve] Failed to generate rental code:', codeError);
      return NextResponse.json({ error: 'Failed to generate rental code' }, { status: 500 });
    }

    // Phase 0 (order-authority-inversion, 2026-07-02) made club_rentals.order_id
    // NOT NULL: every course line must belong to an order header, so the 1-line
    // header is created FIRST, then the line points at it. The shared
    // customer/delivery/notes/payment-choice/source fields are ORDER-canonical
    // (DROP columns on club_rentals lines) — they are recorded ONLY on the
    // header. Value-identical to the old wrapCourseRentalInOrder semantics.
    const order = await createCourseOrderHeader(supabase, {
      customer_id,
      user_id,
      customer_name,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      status: 'reserved',
      start_date,
      end_date,
      start_time: start_time || null,
      duration_days: effective_duration_days || null,
      delivery_requested,
      delivery_address: delivery_address || null,
      delivery_lat: delivery_lat ?? null,
      delivery_lng: delivery_lng ?? null,
      delivery_time: delivery_time || null,
      return_time: return_time || null,
      delivery_fee,
      payment_method_chosen: paymentMethodChosen,
      contact_preference: contactPreference,
      rental_price,
      add_ons: validatedAddOns.length > 0 ? validatedAddOns : [],
      add_ons_total,
      total_price,
      source,
      notes: customerNotes || null,
    });

    if (!order) {
      // Hard requirement post-Phase 0 (order_id NOT NULL) — no order, no line.
      return NextResponse.json({ error: 'Failed to create rental reservation' }, { status: 500 });
    }

    // Create the rental line under the header. Only still-existing line columns —
    // KEEP columns: delivery_lat/lng (dispatch), return_time (availability RPCs),
    // delivery_fee, the window, add_ons, money.
    const { data: rental, error: insertError } = await supabase
      .from('club_rentals')
      .insert({
        rental_code: rentalCode,
        rental_club_set_id,
        order_id: order.id,
        rental_type,
        status: 'reserved',
        start_date,
        end_date,
        start_time: start_time || null,
        duration_days: effective_duration_days || null,
        rental_price,
        add_ons: validatedAddOns.length > 0 ? validatedAddOns : [],
        add_ons_total,
        delivery_lat: delivery_lat ?? null,
        delivery_lng: delivery_lng ?? null,
        return_time: return_time || null,
        delivery_fee,
        total_price,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[ClubReserve] Insert error:', insertError);
      // Don't leak an empty header when its only line failed to insert.
      const { error: rollbackErr } = await supabase.from('club_rental_orders').delete().eq('id', order.id);
      if (rollbackErr) console.error('[ClubReserve] rollback delete of empty header failed:', rollbackErr);
      return NextResponse.json({ error: 'Failed to create rental reservation' }, { status: 500 });
    }

    // Re-check availability after insert to detect race conditions (TOCTOU mitigation)
    const { data: postInsertCount, error: postCheckError } = await supabase.rpc('check_club_set_availability', {
      p_set_id: rental_club_set_id,
      p_start_date: start_date,
      p_end_date: end_date,
      p_start_time: start_time || null,
      p_duration_hours: duration_hours || null,
    });

    if (!postCheckError && postInsertCount !== null && postInsertCount < 0) {
      // Overbooking detected — roll back by deleting the order header; the
      // club_rentals.order_id FK is ON DELETE CASCADE (verified live 2026-07-02,
      // club_rentals_order_id_fkey), so the line is removed with it.
      console.warn(`[ClubReserve] TOCTOU race detected for ${rentalCode}, rolling back`);
      const { error: rollbackErr } = await supabase.from('club_rental_orders').delete().eq('id', order.id);
      if (rollbackErr) console.error('[ClubReserve] TOCTOU rollback delete failed (line may block availability):', rollbackErr);
      return NextResponse.json(
        { error: 'This club set was just booked by someone else. Please try again.' },
        { status: 409 }
      );
    }

    console.log(`[ClubReserve] Created rental ${rentalCode} for ${clubSet.name}, total: ฿${total_price}`);

    // Send confirmation email for course rentals.
    // Skip when prepay is required — the ShopeePay webhook will send
    // the confirmation email on payment success (with paymentStatus='paid'
    // and the transaction reference). For abandoned-payment cases the
    // cleanup cron expires the rental without an email; staff are
    // already aware via the LINE notification below.
    if (rental_type === 'course' && customer_email && !requiresPrepay) {
      // Resolve locale: explicit body param first, then fall back to
      // customers.preferred_language if we know the customer.
      let resolvedLanguage: string | null = typeof bodyLanguage === 'string' ? bodyLanguage : null;
      if (!resolvedLanguage && customer_id) {
        const { data: customerLang } = await supabase
          .from('customers')
          .select('preferred_language')
          .eq('id', customer_id)
          .single();
        resolvedLanguage = customerLang?.preferred_language ?? null;
      }
      const emailLocale = resolveEmailLocale(resolvedLanguage);

      // AWAIT (with try/catch) so Vercel keeps the function alive until
      // SMTP completes. The previous fire-and-forget pattern was
      // silently failing in production with `TypeError: fetch failed`
      // because Vercel tore down the function after the response was
      // sent (observed 2026-05-26 on the webhook side).
      try {
        await sendCourseRentalConfirmationEmail({
          customerName: customer_name,
          email: customer_email,
          rentalCode,
          clubSetName: clubSet.name,
          clubSetTier: clubSet.tier,
          clubSetGender: clubSet.gender,
          startDate: start_date,
          endDate: end_date,
          // effective_duration_days is the server-authoritative hourly-billing
          // computation from PR #27 (replaces the old calendar-date diff).
          durationDays: effective_duration_days || 1,
          deliveryRequested: delivery_requested,
          deliveryAddress: delivery_address,
          deliveryTime: [
            delivery_time ? `${delivery_requested ? 'Delivery' : 'Pickup'}: ${delivery_time}` : '',
            return_time ? `Return: ${return_time}` : '',
          ].filter(Boolean).join(', ') || undefined,
          addOns: validatedAddOns.map((a: ClubRentalAddOn) => ({ label: a.label, price: a.price })),
          rentalPrice: rental_price,
          deliveryFee: delivery_fee,
          totalPrice: total_price,
          notes: customerNotes || undefined,
          language: emailLocale,
          // Reaches here only on !requiresPrepay → customer settles on arrival.
          paymentStatus: 'pay_at_pickup',
          contactPreference:
            contactPreference === 'line' ||
            contactPreference === 'email' ||
            contactPreference === 'whatsapp'
              ? contactPreference
              : null,
        });
      } catch (err) {
        console.error('[ClubReserve] Email send error:', err);
      }
    }

    // Send LINE notification for staff — uses the unified
    // composeRentalLineMessage helper so the format stays consistent
    // with payment-received, refund, and payment-failed pings.
    const baseUrl = getBaseUrl();
    if (baseUrl) {
      const isProdEnv = process.env.VERCEL_ENV === 'production';
      const paymentMode: 'online' | 'manual' =
        rental_type === 'course' && requiresPrepay ? 'online' : 'manual';

      // Build the ping from the request-body values, NOT the inserted `rental`
      // row: the shared customer/delivery/notes/payment-choice fields are now
      // ORDER-canonical and are no longer written to the line (they live on the
      // order header created above). Reading them off the line would show
      // "Customer: null" / "Pickup at LENGOLF" on every reservation.
      // Mirrors the sibling /api/clubs/order ping.
      const lineMessage = composeRentalLineMessage({
        rental: {
          rental_code: rentalCode,
          customer_name,
          customer_phone: customer_phone || null,
          customer_email: customer_email || null,
          start_date,
          end_date,
          duration_days: effective_duration_days || null,
          delivery_requested,
          delivery_address: delivery_address || null,
          delivery_time: delivery_time || null,
          return_time: return_time || null,
          total_price,
          notes: customerNotes || null,
          add_ons: validatedAddOns,
          payment_method_chosen: paymentMethodChosen,
          contact_preference: contactPreference,
        },
        clubSet: { name: clubSet.name, tier: clubSet.tier, gender: clubSet.gender },
        status: { kind: 'Created', paymentMode },
        uatPrefix: !isProdEnv,
      });

      try {
        const lineRes = await fetch(`${baseUrl}/api/notifications/line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: lineMessage }),
        });
        if (!lineRes.ok) {
          const errBody = await lineRes.text().catch(() => '');
          console.error(`[ClubReserve] LINE notification failed: ${lineRes.status}`, errBody);
        }
      } catch (err) {
        console.error('[ClubReserve] LINE notification error:', err);
      }
    }

    return NextResponse.json({
      success: true,
      rental,
      rental_code: rentalCode,
      club_set: {
        name: clubSet.name,
        tier: clubSet.tier,
        gender: clubSet.gender,
        brand: clubSet.brand,
        model: clubSet.model,
      },
      pricing: {
        rental_price,
        add_ons_total,
        delivery_fee,
        total_price,
      },
      // Frontend uses this to decide whether to redirect to /payment/start
      // (course + card) or stay on the in-page confirmation step (cash, indoor).
      requires_prepay: requiresPrepay,
    });
  } catch (error) {
    console.error('[ClubReserve] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
