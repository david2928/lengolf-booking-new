import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';
import { getPackagesForProfile } from '@/utils/supabase/crm-packages';

// Extend the default session type to include our custom properties
interface ExtendedSession {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    phone?: string | null;
    provider?: string;
  };
}

export async function GET() {
  try {
    // Get the current session
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    
    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get packages for the current user
    const packages = await getPackagesForProfile(session.user.id);
    
    return NextResponse.json({
      success: true,
      packages
    });
  } catch (error) {
    console.error('Error fetching user packages:', error);
    
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Set the revalidation time to 0 to ensure the function runs every time
export const dynamic = 'force-dynamic';
export const revalidate = 0; 