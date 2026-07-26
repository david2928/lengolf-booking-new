import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('id, promotion_type, discount_value, free_hours, applies_to, conditions, title_en, title_th, pos_discount_id')
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
      // Carried so this projection stays byte-identical to the one the staff
      // note is computed from in /api/bookings/create — the two are required to
      // be the same row shape. Opaque id only; the POS discount's title is
      // resolved server-side and never reaches the browser.
      pos_discount_id: promo.pos_discount_id ?? null,
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
