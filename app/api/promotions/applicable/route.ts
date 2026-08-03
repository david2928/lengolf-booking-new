import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: promotions, error } = await supabase
      .from('promotions')
      // This endpoint is unauthenticated and edge-cached for 5 minutes, so the
      // rule for adding a column here is: the client-side `calculateCost` must
      // actually read it. `pos_discount_id` failed that test and was removed —
      // nothing renders it, the quote does not need it, and it is an internal
      // POS mapping. /api/bookings/create keeps reading it server-side, where it
      // belongs.
      .select('id, promotion_type, discount_value, free_hours, applies_to, conditions, title_en, title_th, grants_credit')
      .eq('is_active', true)
      .eq('auto_apply', true)
      .not('promotion_type', 'is', null);

    if (error) {
      console.error('[applicable-promotions] Error:', error);
      return NextResponse.json({ promotions: [] });
    }

    // Return all auto-apply promotions — condition filtering happens in the client-side cost calculator
    // Strip internal conditions from the response but keep fields the calculator needs
    const sanitized = (promotions ?? []).map((promo) => ({
      id: promo.id,
      promotion_type: promo.promotion_type,
      discount_value: promo.discount_value,
      free_hours: promo.free_hours,
      applies_to: promo.applies_to,
      conditions: promo.conditions ?? {},
      title_en: promo.title_en,
      title_th: promo.title_th,
      // Read by `calculateCost`: it decides whether the one-hour bogo hint may
      // say "Or redeem your free hour within 7 days". Only a promotion that
      // actually mints a credit may make that promise, and the same column gates
      // the grant itself in /api/bookings/create, so the quote the customer sees
      // and the credit they get cannot disagree. A boolean, never a null:
      // absent means no credit.
      grants_credit: promo.grants_credit === true,
    }));

    return NextResponse.json(
      { promotions: sanitized },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('[applicable-promotions] Error:', error);
    return NextResponse.json({ promotions: [] });
  }
}
