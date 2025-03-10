import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { matchProfileWithCrm } from '@/utils/customer-matching';

/**
 * Get the CRM customer mapped to a profile
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const profileId = url.searchParams.get('profileId');

    if (!profileId) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    // Users can only access their own mapping
    if (session.user.id !== profileId) {
      return NextResponse.json({ error: 'You can only access your own mapping' }, { status: 403 });
    }

    const supabase = createServerClient();
    const { data: mapping, error } = await supabase
      .from('crm_customer_mapping')
      .select('crm_customer_id, crm_customer_data')
      .eq('profile_id', profileId)
      .eq('is_matched', true)
      .maybeSingle();
      
    if (error) {
      console.error('Error retrieving CRM mapping:', error);
    }

    return NextResponse.json({
      success: true,
      mapping: mapping || null
    });
  } catch (error) {
    console.error('Exception in CRM mapping request:', error);
    return NextResponse.json({ error: 'Failed to get CRM mapping' }, { status: 500 });
  }
}

/**
 * Force a new matching attempt for a profile
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileId } = await request.json();
    if (!profileId) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    // Users can only match their own profile
    if (session.user.id !== profileId) {
      return NextResponse.json({ error: 'You can only match your own profile' }, { status: 403 });
    }

    const result = await matchProfileWithCrm(profileId);
    
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Exception in CRM matching request:', error);
    return NextResponse.json({ error: 'Failed to match profile' }, { status: 500 });
  }
} 