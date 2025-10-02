import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { lineUserId, phoneNumber, displayName } = await request.json();

    if (!lineUserId || !phoneNumber) {
      return NextResponse.json(
        { error: 'lineUserId and phoneNumber are required' },
        { status: 400 }
      );
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^[0-9+\-\s()]+$/;
    if (!phoneRegex.test(phoneNumber)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Check if profile exists
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, phone_number')
      .eq('provider', 'line')
      .eq('provider_id', lineUserId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[save-phone] Error checking profile:', profileError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    let profileId: string;

    if (existingProfile) {
      // Update existing profile with phone number
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({
          phone_number: phoneNumber,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProfile.id)
        .select()
        .single();

      if (updateError) {
        console.error('[save-phone] Error updating profile:', updateError);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
      }

      profileId = updatedProfile.id;
    } else {
      // Create new profile for LINE user
      const newProfileId = uuidv4();
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: newProfileId,
          provider: 'line',
          provider_id: lineUserId,
          display_name: displayName,
          phone_number: phoneNumber,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('[save-phone] Error creating profile:', createError);
        return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
      }

      profileId = newProfile.id;
    }

    return NextResponse.json({
      success: true,
      profileId
    });

  } catch (error) {
    console.error('[save-phone] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
