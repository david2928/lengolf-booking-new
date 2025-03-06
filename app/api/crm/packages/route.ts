import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import type { NextRequest } from 'next/server';
import { getPackagesForProfile, syncPackagesForProfile } from '@/utils/supabase/crm-packages';

/**
 * Get packages for a profile
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

    // Users can only access their own packages
    if (session.user.id !== profileId) {
      return NextResponse.json({ error: 'You can only access your own packages' }, { status: 403 });
    }

    const packages = await getPackagesForProfile(profileId);

    return NextResponse.json({
      success: true,
      packages
    });
  } catch (error) {
    console.error('Error getting packages:', error);
    return NextResponse.json({ error: 'Failed to get packages' }, { status: 500 });
  }
}

/**
 * Force a package sync for a profile
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

    // Users can only sync their own packages
    if (session.user.id !== profileId) {
      return NextResponse.json({ error: 'You can only sync your own packages' }, { status: 403 });
    }

    await syncPackagesForProfile(profileId);
    const packages = await getPackagesForProfile(profileId);

    return NextResponse.json({
      success: true,
      packages
    });
  } catch (error) {
    console.error('Error syncing packages:', error);
    return NextResponse.json({ error: 'Failed to sync packages' }, { status: 500 });
  }
} 