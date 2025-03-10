import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { getCrmCustomerForProfile, matchProfileWithCrm } from '@/utils/customer-matching';

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

    const crmCustomer = await getCrmCustomerForProfile(profileId);

    return NextResponse.json({
      success: true,
      crmCustomer: crmCustomer || null
    });
  } catch (error) {
    console.error('Error getting CRM mapping:', error);
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
    console.error('Error matching profile:', error);
    return NextResponse.json({ error: 'Failed to match profile' }, { status: 500 });
  }
} 