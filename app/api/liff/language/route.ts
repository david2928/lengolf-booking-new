import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { isValidLanguage } from '@/lib/liff/translations';
import { appCache } from '@/lib/cache';

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

    const supabase = createAdminClient();

    // Look up profile
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

    // Update customer preferred_language
    const { error: updateError } = await supabase
      .from('customers')
      .update({ preferred_language: language })
      .eq('id', profile.customer_id);

    if (updateError) {
      console.error('[LIFF Language] Update error:', updateError);
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
