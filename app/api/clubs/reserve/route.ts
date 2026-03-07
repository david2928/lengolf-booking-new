import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getIndoorPrice, getCoursePrice, GEAR_UP_ITEMS } from '@/types/golf-club-rental';
import type { ClubReserveRequest, ClubRentalAddOn } from '@/types/golf-club-rental';
import { sendCourseRentalConfirmationEmail } from '@/lib/emailService';

// Build a trusted price map for add-on validation
const TRUSTED_ADDON_PRICES: Record<string, number> = Object.fromEntries(
  GEAR_UP_ITEMS.map(item => [item.id, item.price])
);

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

const supabase = createAdminClient();

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
      customer_id,
      user_id,
      add_ons = [],
      delivery_requested = false,
      delivery_address,
      delivery_time,
      notes,
      source = 'booking_app',
    } = body;

    const return_time = (body as unknown as Record<string, unknown>).return_time as string | undefined;

    // Validate required fields
    if (!rental_club_set_id || !rental_type || !start_date || !customer_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate rental_type
    if (!['indoor', 'course'].includes(rental_type)) {
      return NextResponse.json({ error: 'Invalid rental type' }, { status: 400 });
    }

    // Validate delivery address when delivery is requested
    if (delivery_requested && !delivery_address?.trim()) {
      return NextResponse.json({ error: 'Delivery address is required for delivery orders' }, { status: 400 });
    }

    // Validate time formats if provided (HH:MM)
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (delivery_time && !timeRegex.test(delivery_time)) {
      return NextResponse.json({ error: 'Invalid delivery time format' }, { status: 400 });
    }
    if (return_time && !timeRegex.test(return_time)) {
      return NextResponse.json({ error: 'Invalid return time format' }, { status: 400 });
    }

    // Validate add-on prices against trusted server-side prices
    for (const addon of add_ons) {
      if (TRUSTED_ADDON_PRICES[addon.key] === undefined) {
        return NextResponse.json({ error: `Unknown add-on: ${addon.key}` }, { status: 400 });
      }
    }
    const validatedAddOns: ClubRentalAddOn[] = add_ons.map((addon: ClubRentalAddOn) => ({
      ...addon,
      price: TRUSTED_ADDON_PRICES[addon.key],
    }));

    // Calculate end_date: "1 day" means return next day, so end = start + duration
    let end_date = body.end_date || start_date;
    if (rental_type === 'course' && duration_days) {
      const start = new Date(start_date);
      start.setDate(start.getDate() + duration_days);
      end_date = start.toISOString().split('T')[0];
    }

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
        customer_id: customer_id || null,
        customer_name,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
        user_id: user_id || null,
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
        delivery_fee,
        total_price,
        notes: [
          delivery_time ? `${delivery_requested ? 'Delivery' : 'Pickup'} time: ${delivery_time}` : '',
          return_time ? `Return time: ${return_time}` : '',
          notes || '',
        ].filter(Boolean).join('\n') || null,
        source,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[ClubReserve] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create rental reservation' }, { status: 500 });
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
        notes: notes || undefined,
      }).catch(err => console.error('[ClubReserve] Email send error:', err));
    }

    // Send LINE notification for staff
    const baseUrl = getBaseUrl();
    if (baseUrl) {
      const addOnsText = validatedAddOns.length > 0
        ? validatedAddOns.map((a: ClubRentalAddOn) => `${a.label} (฿${a.price})`).join(', ')
        : 'None';
      const timeInfo = [
        delivery_time ? `${delivery_requested ? 'Delivery' : 'Pickup'}: ${delivery_time}` : '',
        return_time ? `Return: ${return_time}` : '',
      ].filter(Boolean).join(', ');
      const deliveryText = delivery_requested
        ? `Delivery: ${delivery_address}${timeInfo ? ` (${timeInfo})` : ''}`
        : `Pickup at LENGOLF${timeInfo ? ` (${timeInfo})` : ''}`;
      const dateText = duration_days && duration_days > 1
        ? `${start_date} → ${end_date} (${duration_days}d)`
        : `${start_date} (1d)`;

      const lineMessage = [
        `🏌️ CLUB RENTAL BOOKING (${rentalCode})`,
        `----------------------------------`,
        `📋 Set: ${clubSet.name} (${clubSet.tier === 'premium-plus' ? 'Premium+' : 'Premium'}, ${clubSet.gender === 'mens' ? "Men's" : "Women's"})`,
        `📅 Dates: ${dateText}`,
        `🚚 ${deliveryText}`,
        `👤 Customer: ${customer_name}`,
        `📞 Phone: ${customer_phone || 'N/A'}`,
        `🎒 Add-ons: ${addOnsText}`,
        `💰 Total: ฿${total_price.toLocaleString()}`,
        `📱 Source: ${source}`,
      ].join('\n');

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
