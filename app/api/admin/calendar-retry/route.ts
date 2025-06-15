import { NextRequest, NextResponse } from 'next/server';
import { retryFailedCalendarEvent, batchRetryFailedCalendarEvents } from '@/utils/calendar-retry';

/**
 * POST /api/admin/calendar-retry
 * Retry failed calendar events manually
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingId, batchMode = false, limit = 10 } = body;

    if (batchMode) {
      // Batch retry multiple failed calendar events
      console.log(`[Calendar Retry API] Starting batch retry for up to ${limit} bookings`);
      
      const result = await batchRetryFailedCalendarEvents(limit);
      
      return NextResponse.json({
        success: true,
        message: `Batch retry completed: ${result.success} successful, ${result.failed} failed`,
        results: result
      });
    } else if (bookingId) {
      // Retry specific booking
      console.log(`[Calendar Retry API] Retrying calendar for booking: ${bookingId}`);
      
      const success = await retryFailedCalendarEvent({ bookingId });
      
      if (success) {
        return NextResponse.json({
          success: true,
          message: `Calendar event successfully created for booking ${bookingId}`
        });
      } else {
        return NextResponse.json({
          success: false,
          message: `Failed to create calendar event for booking ${bookingId}`
        }, { status: 500 });
      }
    } else {
      return NextResponse.json({
        success: false,
        message: 'Either bookingId or batchMode must be specified'
      }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Calendar Retry API] Error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error.message
    }, { status: 500 });
  }
}

/**
 * GET /api/admin/calendar-retry
 * Get statistics about failed calendar events
 */
export async function GET(request: NextRequest) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get statistics
    const [
      failedCount,
      pendingCount,
      syncedCount,
      totalCount
    ] = await Promise.all([
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('google_calendar_sync_status', 'failed')
        .eq('status', 'confirmed'),
      
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('google_calendar_sync_status', 'pending')
        .eq('status', 'confirmed'),
      
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('google_calendar_sync_status', 'synced')
        .eq('status', 'confirmed'),
      
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed')
    ]);

    // Get recent failed bookings for details
    const { data: recentFailed } = await supabase
      .from('bookings')
      .select('id, created_at, google_calendar_sync_status, date, start_time')
      .eq('google_calendar_sync_status', 'failed')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      statistics: {
        failed: failedCount.count || 0,
        pending: pendingCount.count || 0,
        synced: syncedCount.count || 0,
        total: totalCount.count || 0,
        successRate: totalCount.count ? 
          ((syncedCount.count || 0) / totalCount.count * 100).toFixed(2) + '%' : 
          '0%'
      },
      recentFailed: recentFailed || []
    });
  } catch (error: any) {
    console.error('[Calendar Retry API] Error fetching statistics:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    }, { status: 500 });
  }
} 