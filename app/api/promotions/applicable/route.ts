import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('id, promotion_type, discount_value, free_hours, applies_to, conditions, title_en, title_th')
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
