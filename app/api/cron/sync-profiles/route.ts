import { NextResponse } from 'next/server';
import { main as syncProfiles } from '@/scripts/sync-all-profiles';

// Set a secret token to secure the endpoint
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  try {
    // Verify the secret token
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (secret !== CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log('Starting CRM profile sync via cron job...');
    
    // Run the sync process
    const result = await syncProfiles();
    
    console.log('CRM profile sync completed via cron job');
    
    return NextResponse.json({
      success: true,
      message: 'CRM profile sync completed successfully',
      result
    });
  } catch (error) {
    console.error('Error in CRM profile sync cron job:', error);
    
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Set the revalidation time to 0 to ensure the function runs every time
export const dynamic = 'force-dynamic';
export const revalidate = 0; 