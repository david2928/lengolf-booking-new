import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getIndoorPrice, getCoursePrice, getGearUpItems } from '@/types/golf-club-rental';
import type { ClubReserveRequest, ClubRentalAddOn } from '@/types/golf-club-rental';
import { sendCourseRentalConfirmationEmail } from '@/lib/emailService';

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
      delivery_time,
      return_time,
      notes: customerNotes,
      source = 'booking_app',
    } = body;

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

    // Calculate end_date: "1 day" means return next day, so end = start + duration
    let end_date = body.end_date || start_date;
    if (rental_type === 'course' && duration_days) {
      const start = new Date(start_date);
      start.setDate(start.getDate() + duration_days);
      end_date = start.toISOString().split('T')[0];
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

    // Calculate pricing
    let rental_price = 0;
    if (rental_type === 'indoor' && duration_hours) {
      rental_price = getIndoorPrice(clubSet, duration_hours);
    } else if (rental_type === 'course' && duration_days) {
      rental_price = getCoursePrice(clubSet, duration_days);
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

    // Create the rental reservation
    const { data: rental, error: insertError } = await supabase
      .from('club_rentals')
      .insert({
        rental_code: rentalCode,
        rental_club_set_id,
        booking_id: booking_id || null,
        customer_id,
        customer_name,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
        user_id,
        rental_type,
        status: 'reserved',
        start_date,
        end_date,
        start_time: start_time || null,
        duration_hours: duration_hours || null,
        duration_days: duration_days || null,
        rental_price,
        add_ons: validatedAddOns.length > 0 ? validatedAddOns : [],
        add_ons_total,
        delivery_requested,
        delivery_address: delivery_address || null,
        delivery_time: delivery_time || null,
        return_time: return_time || null,
        delivery_fee,
        total_price,
        notes: customerNotes || null,
        source,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[ClubReserve] Insert error:', insertError);
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
      // Overbooking detected — rollback by deleting the just-created rental
      console.warn(`[ClubReserve] TOCTOU race detected for ${rentalCode}, rolling back`);
      await supabase.from('club_rentals').delete().eq('id', rental.id);
      return NextResponse.json(
        { error: 'This club set was just booked by someone else. Please try again.' },
        { status: 409 }
      );
    }

    console.log(`[ClubReserve] Created rental ${rentalCode} for ${clubSet.name}, total: ฿${total_price}`);

    // Send confirmation email for course rentals
    if (rental_type === 'course' && customer_email) {
      sendCourseRentalConfirmationEmail({
        customerName: customer_name,
        email: customer_email,
        rentalCode,
        clubSetName: clubSet.name,
        clubSetTier: clubSet.tier,
        clubSetGender: clubSet.gender,
        startDate: start_date,
        endDate: end_date,
        durationDays: duration_days || 1,
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
      }).catch(err => console.error('[ClubReserve] Email send error:', err));
    }

    // Send LINE notification for staff
    const baseUrl = getBaseUrl();
    if (baseUrl) {
      const addOnsText = validatedAddOns.length > 0
        ? validatedAddOns.map((a: ClubRentalAddOn) => `${a.label} (฿${a.price})`).join(', ')
        : 'None';
      const tierLabel = clubSet.tier === 'premium-plus' ? 'Premium+' : 'Premium';
      const genderLabel = clubSet.gender === 'mens' ? "Men's" : "Women's";
      const timeInfo = [
        delivery_time ? `${delivery_requested ? 'Delivery' : 'Pickup'}: ${delivery_time}` : '',
        return_time ? `Return: ${return_time}` : '',
      ].filter(Boolean).join(', ');
      const deliveryText = delivery_requested
        ? `Delivery to: ${delivery_address}${timeInfo ? `\nTime: ${timeInfo}` : ''}`
        : `Pickup at LENGOLF${timeInfo ? ` (${timeInfo})` : ''}`;

      const startDateFmt = new Date(start_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
      const endDateFmt = new Date(end_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
      const daysLabel = duration_days && duration_days > 1 ? `${duration_days}d` : '1d';

      const lineMessage = [
        `Club Rental Notification (${rentalCode})`,
        `Customer: ${customer_name}`,
        `Phone: ${customer_phone || 'N/A'}`,
        customer_email ? `Email: ${customer_email}` : null,
        `Set: ${clubSet.name} (${tierLabel}, ${genderLabel})`,
        `Dates: ${startDateFmt} - ${endDateFmt} (${daysLabel})`,
        deliveryText,
        addOnsText !== 'None' ? `Add-ons: ${addOnsText}` : null,
        `Total: ฿${total_price.toLocaleString()}`,
        `Source: ${source}`,
        customerNotes ? `Notes: ${customerNotes}` : null,
        ``,
        `Please contact the customer to confirm availability and arrange payment.`,
      ].filter(Boolean).join('\n');

      fetch(`${baseUrl}/api/notifications/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lineMessage }),
      }).catch(err => console.error('[ClubReserve] LINE notification error:', err));
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
    });
  } catch (error) {
    console.error('[ClubReserve] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
