import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { isValidLanguage } from '@/lib/liff/translations';
import { appCache } from '@/lib/cache';
import { persistCustomerLanguage } from '@/lib/i18n/persist-language';

export async function POST(request: NextRequest) {
  try {
    const { lineUserId, language } = await request.json();

    if (!lineUserId || typeof lineUserId !== 'string') {
      return NextResponse.json(
        { error: 'lineUserId is required' },
        { status: 400 }
      );
    }

    if (!language || !isValidLanguage(language)) {
      return NextResponse.json(
        { error: 'Invalid language. Must be one of: en, th, ja, zh' },
        { status: 400 }
      );
    }

    // Look up profile via admin client (LIFF has no NextAuth session).
    const supabase = createAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, customer_id')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .maybeSingle();

    if (profileError) {
      console.error('[LIFF Language] Profile query error:', profileError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }

    if (!profile || !profile.customer_id) {
      // No profile or no customer linked - not an error, just can't persist
      return NextResponse.json({ success: false, reason: 'no_customer' });
    }

    // Shared helper — validates locale + updates customers.preferred_language.
    const result = await persistCustomerLanguage({
      customerId: profile.customer_id,
      locale: language,
    });

    if (!result.ok) {
      console.error('[LIFF Language] Persist error:', result.reason);
      return NextResponse.json(
        { error: 'Failed to update language' },
        { status: 500 }
      );
    }

    // Invalidate user cache so next read picks up the change
    appCache.del(`booking_user_${lineUserId}`);
    appCache.del(`membership_data_${lineUserId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LIFF Language] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
