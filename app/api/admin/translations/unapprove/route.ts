import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // TODO: Re-enable authentication before production deployment
    // Currently disabled for feature branch development
    
    const { keyId, locale } = await request.json();
    console.log('Unapprove request:', { keyId, locale });
    
    // Use service role key for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Convert keyId to number if it's a string
    const numericKeyId = typeof keyId === 'string' ? parseInt(keyId, 10) : keyId;

    // Update the translation to unapproved
    const { error: updateError } = await supabase
      .from('translations')
      .update({
        is_approved: false,
        updated_at: new Date().toISOString()
      })
      .eq('key_id', numericKeyId)
      .eq('locale', locale);
    
    if (updateError) {
      console.error('Unapprove error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}