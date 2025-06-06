import { NextRequest, NextResponse } from 'next/server';
import { bulkSyncPackagesForAllProfiles } from '@/utils/supabase/crm-packages';

// Security token for cron job authentication
const CRON_SECRET = process.env.CRON_SECRET || '2f93c28600516c88c346b197246515c6ce9b82aade54311a75031578bc75da42';

/**
 * Bulk sync packages for all profiles
 * This endpoint is designed to be called by Supabase cron jobs
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${CRON_SECRET}`;
    
    if (authHeader !== expectedAuth) {
      console.error('Unauthorized bulk package sync attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body for options
    const body = await request.json().catch(() => ({}));
    const { 
      batchSize = 20, 
      maxProfiles, 
      onlyNewProfiles = false 
    } = body;

    console.log('[API] Starting bulk package sync with options:', {
      batchSize,
      maxProfiles,
      onlyNewProfiles
    });

    const startTime = Date.now();
    
    // Run the bulk sync
    const result = await bulkSyncPackagesForAllProfiles({
      batchSize,
      maxProfiles,
      onlyNewProfiles
    });
    
    const duration = Date.now() - startTime;
    
    console.log('[API] Bulk package sync completed:', {
      ...result,
      durationMs: duration
    });

    return NextResponse.json({
      success: true,
      result: {
        ...result,
        duration: `${Math.round(duration / 1000)}s`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[API] Bulk package sync failed:', error);
    return NextResponse.json(
      { 
        error: 'Bulk sync failed', 
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for health check and status
 */
export async function GET() {
  return NextResponse.json({
    service: 'CRM Package Bulk Sync',
    status: 'ready',
    timestamp: new Date().toISOString(),
    usage: {
      POST: 'Trigger bulk sync with optional parameters: batchSize, maxProfiles, onlyNewProfiles',
      authentication: 'Bearer token required in Authorization header'
    }
  });
} 