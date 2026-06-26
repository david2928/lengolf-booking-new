import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCoursePrice, getGearUpItems } from '@/types/golf-club-rental';
import type { ClubRentalAddOn, RentalClubSet } from '@/types/golf-club-rental';
import { sendCourseRentalConfirmationEmail, resolveEmailLocale } from '@/lib/emailService';
import {
  composeRentalLineMessage,
  composeOrderCreatedLineMessage,
} from '@/lib/club-rental/lineMessage';
import { allocateOrderMoney, courseDeliveryFee, groupAddOns, groupSetNames } from '@/lib/club-rental/order-pricing';
import { resolveCustomerId, resolveUserId } from '@/lib/club-rental/resolve-customer';
import { logOrderEvent } from '@/lib/club-rental/order-events';

/**
 * POST /api/clubs/order — order-aware course-rental write path.
 *
 * Creates ONE public.club_rental_orders header + N public.club_rentals lines
 * (one per rented set) in a single request, with the shared delivery fee +
 * add-ons charged ONCE on the first "bearer" line and summed onto the header
 * (the "rollup header, lines stay whole" model from lengolf-forms PR #124).
 *
 * This is Phase 1 of the Option B normalisation (docs/technical/CLUB_RENTAL_ORDER_MODEL.md
 * in lengolf-forms): the website becomes a native order writer. Shared fields are
 * still denormalised onto every line so the not-yet-migrated readers (Lalamove
 * dispatch, schedule grid, payment, LINE confirmation, Google Ads view, crons)
 * keep working — matching forms' current Option A model.
 *
 * Course rentals only. Indoor/bay rentals stay order-less via /api/bookings/create.
 * The legacy single-set /api/clubs/reserve is left intact as a fallback.
 */

const DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_NOTES_LENGTH = 1000;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;
// Self-service cap. The website handles up to the current total inventory
// (Warbird 2 + Majesty 1 + Paradym 2 = 5 sets); larger/bespoke groups go through
// the #38 "group custom-quote" CTA on the landing instead.
const MAX_LINES = 5;

interface LineInput {
  rental_club_set_id?: string;
}

interface OrderBody {
  lines?: LineInput[];
  start_date?: string;
  end_date?: string;
  start_time?: string;
  return_time?: string;
  delivery_time?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  add_ons?: ClubRentalAddOn[];
  delivery_requested?: boolean;
  delivery_address?: string;
  notes?: string;
  source?: 'website' | 'booking_app' | 'liff' | 'staff' | 'line';
  language?: string;
  payment_method?: 'cash' | 'card';
  payment_method_chosen?: 'online_shopeepay' | 'cash_at_pickup';
  contact_preference?: 'line' | 'email' | 'whatsapp';
}

/** Build trusted add-on price/label map at request time for dynamic pricing. */
function getTrustedAddons(): Record<string, { price: number; label: string }> {
  return Object.fromEntries(
    getGearUpItems().map((item) => [item.id, { price: item.price, label: item.name }]),
  );
}

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
    const body: OrderBody = await request.json();

    const {
      start_date,
      start_time,
      return_time,
      delivery_time,
      customer_name,
      customer_email,
      customer_phone,
      add_ons = [],
      delivery_requested = false,
      delivery_address,
      notes: customerNotes,
      source = 'website',
      language: bodyLanguage,
      payment_method: rawPaymentMethod,
      payment_method_chosen: rawPaymentMethodChosen,
      contact_preference: rawContactPreference,
    } = body;
    const lines: LineInput[] = Array.isArray(body.lines) ? body.lines : [];

    // ---- Customer-facing booking choices stored in their own columns -----------
    const VALID_PAYMENT_CHOICES = new Set(['online_shopeepay', 'cash_at_pickup']);
    const VALID_CONTACT_PREFS = new Set(['line', 'email', 'whatsapp']);
    const paymentMethodChosen: string | null =
      typeof rawPaymentMethodChosen === 'string' && VALID_PAYMENT_CHOICES.has(rawPaymentMethodChosen)
        ? rawPaymentMethodChosen
        : null;
    const contactPreference: string | null =
      typeof rawContactPreference === 'string' && VALID_CONTACT_PREFS.has(rawContactPreference)
        ? rawContactPreference
        : null;

    // ---- Validation ------------------------------------------------------------
    if (!customer_name || !start_date) {
      return NextResponse.json({ error: 'Missing required fields (customer_name, start_date)' }, { status: 400 });
    }
    if (lines.length === 0) {
      return NextResponse.json({ error: 'At least one club set is required' }, { status: 400 });
    }
    if (lines.length > MAX_LINES) {
      return NextResponse.json({ error: `An order can have at most ${MAX_LINES} sets` }, { status: 400 });
    }
    if (lines.some((l) => !l.rental_club_set_id || !UUID_REGEX.test(l.rental_club_set_id))) {
      return NextResponse.json({ error: 'Each line requires a valid rental_club_set_id' }, { status: 400 });
    }
    if (!start_time || !return_time) {
      return NextResponse.json({ error: 'Pickup time and return time are required for course rentals' }, { status: 400 });
    }
    if (!TIME_REGEX.test(start_time) || !TIME_REGEX.test(return_time)) {
      return NextResponse.json({ error: 'Invalid time format (HH:MM)' }, { status: 400 });
    }
    if (delivery_time && !TIME_REGEX.test(delivery_time)) {
      return NextResponse.json({ error: 'Invalid delivery time format' }, { status: 400 });
    }
    if (!DATE_REGEX.test(start_date) || (body.end_date && !DATE_REGEX.test(body.end_date))) {
      return NextResponse.json({ error: 'Invalid date format (YYYY-MM-DD)' }, { status: 400 });
    }
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
    if (customerNotes && customerNotes.length > MAX_NOTES_LENGTH) {
      return NextResponse.json({ error: 'Notes are too long' }, { status: 400 });
    }
    if (delivery_requested && !delivery_address?.trim()) {
      return NextResponse.json({ error: 'Delivery address is required for delivery orders' }, { status: 400 });
    }
    const validSources = ['website', 'booking_app', 'liff', 'staff', 'line'];
    if (!validSources.includes(source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
    }

    // Server-side guard: delivery forces online payment (frontend already enforces).
    const paymentMethod: 'cash' | 'card' = rawPaymentMethod === 'cash' ? 'cash' : 'card';
    if (delivery_requested && paymentMethod === 'cash') {
      return NextResponse.json(
        { error: 'Delivery requires online payment (card / ShopeePay).' },
        { status: 400 },
      );
    }
    const requiresPrepay = paymentMethod === 'card';

    const end_date: string = body.end_date || start_date;

    // Authoritative billable duration from pickup/return (1-hour grace), shared
    // across all lines. Mirrors app/api/clubs/reserve/route.ts.
    const pickupMs = new Date(`${start_date}T${start_time}:00+07:00`).getTime();
    const returnMs = new Date(`${end_date}T${return_time}:00+07:00`).getTime();
    const billableMs = Math.max(0, returnMs - pickupMs - 3_600_000);
    const duration_days = Math.max(1, Math.ceil(billableMs / 86_400_000));

    // Validate + price-enforce add-ons (order-level; charged once on the bearer line).
    const trustedAddons = getTrustedAddons();
    for (const addon of add_ons) {
      if (addon.key === 'delivery') continue;
      if (trustedAddons[addon.key] === undefined) {
        return NextResponse.json({ error: `Unknown add-on: ${addon.key}` }, { status: 400 });
      }
    }
    const validatedAddOns: ClubRentalAddOn[] = add_ons
      .filter((a) => a.key !== 'delivery')
      .map((a) => ({ key: a.key, label: trustedAddons[a.key].label, price: trustedAddons[a.key].price }));

    // Cap each add-on quantity at the number of sets (one per player). The
    // frontend enforces this; re-check server-side (defense in depth).
    const addOnCountByKey = new Map<string, number>();
    for (const a of validatedAddOns) {
      addOnCountByKey.set(a.key, (addOnCountByKey.get(a.key) ?? 0) + 1);
    }
    for (const count of addOnCountByKey.values()) {
      if (count > lines.length) {
        return NextResponse.json(
          { error: 'Add-on quantity cannot exceed the number of sets' },
          { status: 400 },
        );
      }
    }

    const add_ons_total = validatedAddOns.reduce((s, a) => s + a.price, 0);

    // Tiered delivery fee by set count (one trip for the whole order).
    const totalUnits = lines.length;
    const delivery_fee = delivery_requested ? courseDeliveryFee(totalUnits) : 0;

    const supabase = createAdminClient();

    // ---- Customer / user resolution (best-effort phone match) ------------------
    const resolvedCustomerId = await resolveCustomerId(supabase, {
      customerPhone: customer_phone,
      customerName: customer_name,
    });
    const userId = await resolveUserId(supabase, resolvedCustomerId);

    // ---- Per-set availability PRE-check (the effective guard) ------------------
    const qtyBySet = new Map<string, number>();
    for (const l of lines) {
      const id = l.rental_club_set_id as string;
      qtyBySet.set(id, (qtyBySet.get(id) || 0) + 1);
    }
    const distinctSetIds = Array.from(qtyBySet.keys());

    const preAvailable = new Map<string, number>();
    for (const setId of distinctSetIds) {
      // Mirror the proven booking-new reserve availability call shape (5-arg).
      const { data: avail, error: availErr } = await supabase.rpc('check_club_set_availability', {
        p_set_id: setId,
        p_start_date: start_date,
        p_end_date: end_date,
        p_start_time: start_time,
        p_duration_hours: null,
      });
      if (availErr) {
        console.error('[ClubOrder] Availability check error:', availErr);
        return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
      }
      const available = Number(avail ?? 0);
      preAvailable.set(setId, available);
      if (available < (qtyBySet.get(setId) as number)) {
        return NextResponse.json(
          { error: 'One or more selected sets are not available for the chosen dates/time' },
          { status: 409 },
        );
      }
    }

    // ---- Fetch set details (pricing + display) --------------------------------
    const { data: setRows, error: setErr } = await supabase
      .from('rental_club_sets')
      .select('id, name, tier, gender, brand, model, course_price_1d, course_price_3d, course_price_7d, course_price_14d')
      .in('id', distinctSetIds);
    if (setErr || !setRows || setRows.length !== distinctSetIds.length) {
      return NextResponse.json({ error: 'One or more club sets not found' }, { status: 404 });
    }
    const setById = new Map<string, Record<string, unknown>>(
      setRows.map((s: { id: string }) => [s.id, s]),
    );

    // Per-line rental price (booking-new optimal-combo getCoursePrice), in line order.
    const lineRentalPrices = lines.map((l) =>
      getCoursePrice(setById.get(l.rental_club_set_id as string) as unknown as RentalClubSet, duration_days),
    );
    const { lines: allocated, rollup } = allocateOrderMoney(
      lineRentalPrices,
      add_ons_total,
      delivery_fee,
      0,
    );

    // ---- Create the order header ----------------------------------------------
    const { data: orderCode, error: codeErr } = await supabase.rpc('generate_club_rental_order_code');
    if (codeErr || !orderCode) {
      console.error('[ClubOrder] Failed to generate order code:', codeErr);
      return NextResponse.json({ error: 'Failed to generate order code' }, { status: 500 });
    }

    const { data: order, error: orderErr } = await supabase
      .from('club_rental_orders')
      .insert({
        order_code: orderCode,
        customer_id: resolvedCustomerId,
        customer_name,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
        user_id: userId,
        status: 'reserved',
        delivery_requested,
        delivery_address: delivery_address || null,
        delivery_time: delivery_time || null,
        return_time: return_time || null,
        delivery_fee: rollup.deliveryFee,
        payment_status: 'unpaid',
        payment_method_chosen: paymentMethodChosen,
        contact_preference: contactPreference,
        rental_subtotal: rollup.rentalSubtotal,
        add_ons_total: rollup.addOnsTotal,
        discount_amount: rollup.discountAmount,
        total_price: rollup.totalPrice,
        source,
        notes: customerNotes || null,
      })
      .select()
      .single();
    if (orderErr || !order) {
      console.error('[ClubOrder] Header insert error:', orderErr);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // ---- Create the lines ------------------------------------------------------
    const insertedLineIds: string[] = [];
    const responseLines: { id: string; rental_code: string; set_name: string }[] = [];
    try {
      for (let i = 0; i < lines.length; i++) {
        const setId = lines[i].rental_club_set_id as string;
        const set = setById.get(setId) as Record<string, unknown>;
        const money = allocated[i];

        const { data: rentalCode, error: rcErr } = await supabase.rpc('generate_rental_code');
        if (rcErr || !rentalCode) throw new Error(`rental_code generation failed: ${rcErr?.message}`);

        const { data: line, error: lineErr } = await supabase
          .from('club_rentals')
          .insert({
            rental_code: rentalCode,
            order_id: order.id,
            rental_club_set_id: setId,
            customer_id: resolvedCustomerId,
            user_id: userId,
            customer_name,
            customer_email: customer_email || null,
            customer_phone: customer_phone || null,
            rental_type: 'course',
            status: 'reserved',
            start_date,
            end_date,
            start_time,
            duration_days,
            rental_price: money.rentalPrice,
            // Add-ons live only on the bearer line (charged once for the order).
            add_ons: money.isBearer && validatedAddOns.length > 0 ? validatedAddOns : [],
            add_ons_total: money.addOnsTotal,
            // Delivery address/times denormalised onto every line so Lalamove
            // dispatch + per-rental reads keep working; the FEE is on the bearer
            // line only so the order is charged delivery once.
            delivery_requested,
            delivery_address: delivery_address || null,
            delivery_time: delivery_time || null,
            return_time: return_time || null,
            delivery_fee: money.deliveryFee,
            discount_amount: money.discountAmount,
            total_price: money.totalPrice,
            payment_method_chosen: paymentMethodChosen,
            contact_preference: contactPreference,
            notes: customerNotes || null,
            source,
          })
          .select('id')
          .single();
        if (lineErr || !line) throw new Error(`line insert failed: ${lineErr?.message}`);

        insertedLineIds.push(line.id);
        responseLines.push({ id: line.id, rental_code: rentalCode, set_name: String(set.name) });
      }
    } catch (e) {
      console.error('[ClubOrder] Line insert failed, rolling back order:', e);
      if (insertedLineIds.length > 0) {
        await supabase.from('club_rentals').delete().in('id', insertedLineIds);
      }
      await supabase.from('club_rental_orders').delete().eq('id', order.id);
      return NextResponse.json({ error: 'Failed to create order lines' }, { status: 500 });
    }

    // ---- TOCTOU race check -----------------------------------------------------
    // The availability RPC floors at 0, so compare post-insert availability to the
    // expected value (preAvailable - our qty); if a concurrent order consumed
    // capacity between our pre-check and insert, roll the WHOLE order back.
    let raceDetected = false;
    for (const setId of distinctSetIds) {
      const { data: postAvail } = await supabase.rpc('check_club_set_availability', {
        p_set_id: setId,
        p_start_date: start_date,
        p_end_date: end_date,
        p_start_time: start_time,
        p_duration_hours: null,
      });
      const expected = (preAvailable.get(setId) as number) - (qtyBySet.get(setId) as number);
      if (Number(postAvail ?? 0) < expected) {
        raceDetected = true;
        break;
      }
    }
    if (raceDetected) {
      await supabase.from('club_rentals').delete().in('id', insertedLineIds);
      await supabase.from('club_rental_orders').delete().eq('id', order.id);
      console.warn(`[ClubOrder] TOCTOU rollback: order ${orderCode} deleted due to a concurrent booking`);
      return NextResponse.json(
        { error: 'One of these sets was just booked by someone else. Please try again.' },
        { status: 409 },
      );
    }

    console.log(`[ClubOrder] Created order ${orderCode} with ${responseLines.length} line(s), total ฿${rollup.totalPrice}`);

    // Seed the order activity log (best-effort; table from forms #148).
    await logOrderEvent(supabase, {
      orderId: order.id,
      eventType: 'created',
      summary: 'Order created',
      detail: `${responseLines.length} set${responseLines.length === 1 ? '' : 's'} · website`,
      actor: 'Website',
    });

    const firstSet = setById.get(distinctSetIds[0]) as Record<string, unknown>;
    const setSummary = groupSetNames(
      lines.map((l) => String((setById.get(l.rental_club_set_id as string) as Record<string, unknown>).name)),
    );

    // ---- One confirmation email for the whole order ----------------------------
    // Skip when prepay is required — the payment webhook sends the confirmation
    // (paid) email. Mirrors /api/clubs/reserve. AWAIT + try/catch (Vercel rule —
    // never fire-and-forget; the forms route's .catch() is the one thing NOT copied).
    if (!requiresPrepay && customer_email) {
      let resolvedLanguage: string | null = typeof bodyLanguage === 'string' ? bodyLanguage : null;
      if (!resolvedLanguage && resolvedCustomerId) {
        const { data: customerLang } = await supabase
          .from('customers')
          .select('preferred_language')
          .eq('id', resolvedCustomerId)
          .single();
        resolvedLanguage = customerLang?.preferred_language ?? null;
      }
      const emailLocale = resolveEmailLocale(resolvedLanguage);
      try {
        await sendCourseRentalConfirmationEmail({
          customerName: customer_name,
          email: customer_email,
          rentalCode: orderCode,
          clubSetName: setSummary,
          clubSetTier: String(firstSet.tier),
          clubSetGender: String(firstSet.gender),
          startDate: start_date,
          endDate: end_date,
          durationDays: duration_days,
          deliveryRequested: delivery_requested,
          deliveryAddress: delivery_address,
          deliveryTime: [
            delivery_time ? `${delivery_requested ? 'Delivery' : 'Pickup'}: ${delivery_time}` : '',
            return_time ? `Return: ${return_time}` : '',
          ]
            .filter(Boolean)
            .join(', ') || undefined,
          addOns: groupAddOns(validatedAddOns).map((g) => ({
            label: g.quantity > 1 ? `${g.label} ×${g.quantity}` : g.label,
            price: g.price,
          })),
          rentalPrice: rollup.rentalSubtotal,
          deliveryFee: rollup.deliveryFee,
          totalPrice: rollup.totalPrice,
          notes: customerNotes || undefined,
          language: emailLocale,
          paymentStatus: 'pay_at_pickup',
          contactPreference:
            contactPreference === 'line' || contactPreference === 'email' || contactPreference === 'whatsapp'
              ? contactPreference
              : null,
        });
      } catch (err) {
        console.error('[ClubOrder] Email send error:', err);
      }
    }

    // ---- One LINE staff ping ---------------------------------------------------
    const baseUrl = getBaseUrl();
    if (baseUrl) {
      const isProdEnv = process.env.VERCEL_ENV === 'production';
      const paymentMode: 'online' | 'manual' = requiresPrepay ? 'online' : 'manual';

      const lineMessage =
        responseLines.length === 1
          ? composeRentalLineMessage({
              rental: {
                rental_code: responseLines[0].rental_code,
                customer_name,
                customer_phone: customer_phone || null,
                customer_email: customer_email || null,
                start_date,
                end_date,
                duration_days,
                delivery_requested,
                delivery_address: delivery_address || null,
                delivery_time: delivery_time || null,
                return_time: return_time || null,
                total_price: rollup.totalPrice,
                notes: customerNotes || null,
                add_ons: validatedAddOns,
                payment_method_chosen: paymentMethodChosen,
                contact_preference: contactPreference,
              },
              clubSet: {
                name: String(firstSet.name),
                tier: String(firstSet.tier),
                gender: String(firstSet.gender),
              },
              status: { kind: 'Created', paymentMode },
              uatPrefix: !isProdEnv,
            })
          : composeOrderCreatedLineMessage({
              order_code: orderCode,
              customer_name,
              customer_phone: customer_phone || null,
              customer_email: customer_email || null,
              start_date,
              end_date,
              duration_days,
              delivery_requested,
              delivery_address: delivery_address || null,
              delivery_time: delivery_time || null,
              return_time: return_time || null,
              sets: lines.map((l) => {
                const s = setById.get(l.rental_club_set_id as string) as Record<string, unknown>;
                return { name: String(s.name), tier: String(s.tier), gender: String(s.gender) };
              }),
              add_ons: validatedAddOns,
              total_price: rollup.totalPrice,
              notes: customerNotes || null,
              payment_method_chosen: paymentMethodChosen,
              contact_preference: contactPreference,
              paymentMode,
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
          console.error(`[ClubOrder] LINE notification failed: ${lineRes.status}`, errBody);
        }
      } catch (err) {
        console.error('[ClubOrder] LINE notification error:', err);
      }
    }

    return NextResponse.json({
      success: true,
      order_code: orderCode,
      order_id: order.id,
      // Bearer line's rental_code — single-set callers / the legacy ShopeePay
      // per-rental create can still key off it.
      rental_code: responseLines[0]?.rental_code,
      lines: responseLines,
      pricing: {
        rental_subtotal: rollup.rentalSubtotal,
        add_ons_total: rollup.addOnsTotal,
        delivery_fee: rollup.deliveryFee,
        discount_amount: rollup.discountAmount,
        total_price: rollup.totalPrice,
      },
      // Frontend uses this to decide whether to redirect to payment (course + card)
      // or stay on the in-page confirmation step (cash).
      requires_prepay: requiresPrepay,
    });
  } catch (error) {
    console.error('[ClubOrder] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
