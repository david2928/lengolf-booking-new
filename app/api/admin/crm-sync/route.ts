import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { syncCrmCustomers } from '@/utils/customer-matching-service';
import { createServerClient } from '@/utils/supabase/server';

/**
 * API endpoint to trigger a sync of CRM customers
 * This is intended to be called periodically (e.g., via a cron job)
 * or manually by an admin
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

    // Get the last sync timestamp from the request body, if provided
    const { lastSyncTimestamp } = await request.json().catch(() => ({}));

    // Perform the sync
    const result = await syncCrmCustomers(lastSyncTimestamp);

    return NextResponse.json({
      success: true,
      message: 'CRM customer sync completed successfully',
      result
    });
  } catch (error) {
    console.error('Error in CRM sync:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * API endpoint to get the status of the last sync
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

    // Get statistics about the mappings
    const { data: stats, error } = await supabase
      .from('crm_customer_mapping')
      .select('match_method, is_matched')
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Calculate statistics
    const totalMappings = stats.length;
    const autoMatched = stats.filter(s => s.match_method === 'auto' && s.is_matched).length;
    const manualMatched = stats.filter(s => s.match_method === 'manual' && s.is_matched).length;
    const unmatched = stats.filter(s => !s.is_matched).length;

    return NextResponse.json({
      success: true,
      statistics: {
        totalMappings,
        autoMatched,
        manualMatched,
        unmatched,
        matchRate: totalMappings > 0 ? ((autoMatched + manualMatched) / totalMappings) * 100 : 0
      }
    });
  } catch (error) {
    console.error('Error getting CRM sync status:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
} 