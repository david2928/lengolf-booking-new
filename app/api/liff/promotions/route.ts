import { NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('promotions')
      .select('id, title_en, title_th, description_en, description_th, image_url, valid_until, cta_type, cta_url, badge_en, badge_th, terms_en, terms_th')
      .eq('is_active', true)
      .eq('is_customer_facing', true)
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching promotions:', error);
      return NextResponse.json({ error: 'Failed to fetch promotions' }, { status: 500 });
    }

    return NextResponse.json(
      { promotions: data || [] },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (error) {
    console.error('Error in promotions API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
