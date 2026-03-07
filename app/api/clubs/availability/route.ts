import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { RentalClubSetWithAvailability } from '@/types/golf-club-rental';

const DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rentalType = searchParams.get('type') || 'indoor';
    const date = searchParams.get('date');
    const startTime = searchParams.get('start_time') || null;
    const durationParam = searchParams.get('duration');
    const durationHours = durationParam ? parseFloat(durationParam) : null;

    if (!date) {
      return NextResponse.json({ error: 'date parameter is required' }, { status: 400 });
    }

    if (!DATE_REGEX.test(date)) {
      return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 });
    }

    if (!['indoor', 'course'].includes(rentalType)) {
      return NextResponse.json({ error: 'type must be "indoor" or "course"' }, { status: 400 });
    }

    // For course rentals, end_date can span multiple days
    const endDate = searchParams.get('end_date') || date;
    if (!DATE_REGEX.test(endDate)) {
      return NextResponse.json({ error: 'end_date must be in YYYY-MM-DD format' }, { status: 400 });
    }

    if (startTime && !TIME_REGEX.test(startTime)) {
      return NextResponse.json({ error: 'start_time must be in HH:MM format' }, { status: 400 });
    }

    if (durationHours !== null && (isNaN(durationHours) || durationHours <= 0 || durationHours > 24)) {
      return NextResponse.json({ error: 'duration must be a positive number up to 24' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc('get_available_club_sets', {
      p_rental_type: rentalType,
      p_start_date: date,
      p_end_date: endDate,
      p_start_time: startTime,
      p_duration_hours: durationHours,
    });

    if (error) {
      console.error('[ClubAvailability] RPC error:', error);
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
    }

    const sets: RentalClubSetWithAvailability[] = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      tier: row.tier as 'premium' | 'premium-plus',
      gender: row.gender as 'mens' | 'womens',
      brand: row.brand as string | null,
      model: row.model as string | null,
      description: row.description as string | null,
      specifications: row.specifications as string[],
      image_url: row.image_url as string | null,
      rental_type: row.rental_type as 'indoor' | 'course' | 'both',
      indoor_price_1h: Number(row.indoor_price_1h),
      indoor_price_2h: Number(row.indoor_price_2h),
      indoor_price_4h: Number(row.indoor_price_4h),
      course_price_1d: Number(row.course_price_1d),
      course_price_3d: Number(row.course_price_3d),
      course_price_7d: Number(row.course_price_7d),
      course_price_14d: Number(row.course_price_14d),
      quantity: row.quantity as number,
      display_order: row.display_order as number,
      rented_count: Number(row.rented_count),
      available_count: Number(row.available_count),
    }));

    return NextResponse.json({
      sets,
      date,
      rental_type: rentalType,
    });
  } catch (error) {
    console.error('[ClubAvailability] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
