import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { RentalClubSetWithAvailability } from '@/types/golf-club-rental';

const supabase = createAdminClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rentalType = searchParams.get('type') || 'indoor';
    const date = searchParams.get('date');
    const startTime = searchParams.get('start_time') || null;
    const durationHours = searchParams.get('duration') ? parseFloat(searchParams.get('duration')!) : null;

    if (!date) {
      return NextResponse.json({ error: 'date parameter is required' }, { status: 400 });
    }

    if (!['indoor', 'course'].includes(rentalType)) {
      return NextResponse.json({ error: 'type must be "indoor" or "course"' }, { status: 400 });
    }

    // For course rentals, end_date can span multiple days
    const endDate = searchParams.get('end_date') || date;

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
