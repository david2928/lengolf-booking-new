import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { setManualCustomerMapping, getCrmCustomerForProfile } from '@/utils/customer-matching-service';
import { createServerClient } from '@/utils/supabase/server';

/**
 * API endpoint to manually set a mapping between a profile and a CRM customer
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate via NextAuth
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is an admin
    const supabase = createServerClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', token.sub)
      .single();

    if (!profile || profile.provider !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Get the mapping details from the request body
    const { profileId, crmCustomerId, isMatched = true } = await request.json();

    if (!profileId || !crmCustomerId) {
      return NextResponse.json(
        { error: 'Missing required fields', details: { profileId, crmCustomerId } },
        { status: 400 }
      );
    }

    // Set the mapping
    const result = await setManualCustomerMapping(profileId, crmCustomerId, isMatched);

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to set mapping' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: isMatched 
        ? 'CRM customer mapping set successfully' 
        : 'CRM customer mapping removed successfully',
      mapping: result
    });
  } catch (error) {
    console.error('Error setting CRM mapping:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * API endpoint to get the CRM customer mapped to a profile
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate via NextAuth
    const token = await getToken({ req: request as any });
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get the profile ID from the query parameters
    const url = new URL(request.url);
    const profileId = url.searchParams.get('profileId');

    if (!profileId) {
      return NextResponse.json(
        { error: 'Missing profileId parameter' },
        { status: 400 }
      );
    }

    // Check if the user is requesting their own mapping or is an admin
    const supabase = createServerClient();
    const { data: requestingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', token.sub)
      .single();

    const isAdmin = requestingProfile?.provider === 'admin';
    const isOwnProfile = token.sub === profileId;

    if (!isAdmin && !isOwnProfile) {
      return NextResponse.json(
        { error: 'Forbidden - You can only access your own mapping unless you are an admin' },
        { status: 403 }
      );
    }

    // Get the CRM customer for the profile
    const crmCustomer = await getCrmCustomerForProfile(profileId);

    if (!crmCustomer) {
      return NextResponse.json(
        { success: true, message: 'No CRM customer mapped to this profile', crmCustomer: null }
      );
    }

    return NextResponse.json({
      success: true,
      crmCustomer
    });
  } catch (error) {
    console.error('Error getting CRM mapping:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
} 