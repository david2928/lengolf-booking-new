import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import type { NextRequest } from 'next/server';
import { matchProfileWithCrm } from '@/utils/customer-matching';

/**
 * Get a profile with its CRM data
 * This endpoint:
 * 1. Checks/updates CRM mapping
 * 2. Returns the profile with its CRM data
 * 
 * Query parameters:
 * - force=true: Force a new matching attempt
 */
export async function GET(request: NextRequest) {
  try {
    // Get session to verify the user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for force param to bypass cached results
    const url = new URL(request.url);
    const forceCheck = url.searchParams.get('force') === 'true';

    // Log the request
    console.log(`Profile check for user ${session.user.id}${forceCheck ? ' (forced)' : ''}`);

    // If forcing, do a fresh match attempt
    let result = null;
    if (forceCheck) {
      result = await matchProfileWithCrm(session.user.id);
    }

    // Add timestamp to response
    const responseData = {
      success: true,
      timestamp: new Date().toISOString(),
      mapping: result
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error checking profile:', error);
    return NextResponse.json(
      {
        error: 'Failed to check profile',
        details: (error as Error).message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Ensure the function runs every time
export const dynamic = 'force-dynamic';
export const revalidate = 0; 