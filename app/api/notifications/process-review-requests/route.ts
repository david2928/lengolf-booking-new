import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { formatInTimeZone, zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';
import { subMinutes, addMinutes } from 'date-fns';

const TIMEZONE = 'Asia/Bangkok';
const GOOGLE_REVIEW_URL = 'https://g.page/r/CXwvpW56UsBgEAE/review';
// Use different images for LINE and email (with HTTPS)
const LINE_VOUCHER_IMAGE_URL = 'https://www.len.golf/wp-content/uploads/2025/03/google_review_voucher.png';
const EMAIL_VOUCHER_IMAGE_URL = 'https://www.len.golf/wp-content/uploads/2025/03/google_review_voucher_email.png';

/**
 * This endpoint processes scheduled review requests that are due to be sent.
 * It is designed to be called by a cron job every 5 minutes.
 * 
 * Security: This endpoint requires a secret API key for authentication.
 * 
 * Timezone handling:
 * - Scheduled times are stored in UTC in the database
 * - We use Bangkok timezone (Asia/Bangkok) for business logic
 * - We process requests from a 20-minute window:
 *   - From 10 minutes in the past
 *   - To 10 minutes in the future
 *   This ensures we don't miss any requests due to timing issues.
 */
export async function POST(request: NextRequest) {
  console.log('⭐️ Processing review requests - starting...');
  try {
    // 1. Check API key for cron job authentication
    const authHeader = request.headers.get('Authorization');
    const apiKey = process.env.CRON_API_KEY;
    
    if (!apiKey || !authHeader || authHeader !== `Bearer ${apiKey}`) {
      console.error('❌ Authentication failed - invalid API key:', authHeader?.substring(0, 10) + '...');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.log('✅ Authentication successful');

    // 2. Get current time and create processing window (±10 minutes)
    const now = new Date();
    const bangkokNow = utcToZonedTime(now, TIMEZONE);
    const tenMinutesAgo = subMinutes(bangkokNow, 10);
    const tenMinutesAhead = addMinutes(bangkokNow, 10);
    
    // Convert times to UTC ISO strings for database comparison
    const tenMinutesAgoUtc = zonedTimeToUtc(tenMinutesAgo, TIMEZONE).toISOString();
    const tenMinutesAheadUtc = zonedTimeToUtc(tenMinutesAhead, TIMEZONE).toISOString();
    
    // Format for readable logging (both Thai and UTC time)
    const currentTimeStr = formatInTimeZone(now, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssxxx");
    const windowStartThai = formatInTimeZone(tenMinutesAgo, TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    const windowEndThai = formatInTimeZone(tenMinutesAhead, TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    
    console.log(`📅 Current time (Bangkok): ${currentTimeStr}`);
    console.log(`📅 Processing window (Thai): ${windowStartThai} to ${windowEndThai}`);
    console.log(`📅 Processing window (UTC): ${tenMinutesAgoUtc} to ${tenMinutesAheadUtc}`);

    // 2.5 Get total count of pending review requests for monitoring
    const supabase = createServerClient();
    console.log('📊 Checking total pending review requests...');
    const { count: totalPendingCount, error: countError } = await supabase
      .from('scheduled_review_requests')
      .select('*', { count: 'exact', head: true })
      .eq('sent', false);
    
    if (countError) {
      console.error('⚠️ Error counting total pending requests:', countError);
    } else {
      console.log(`📈 Total pending review requests in system: ${totalPendingCount}`);
    }

    // 3. Get pending review requests within the processing window (±10 minutes from now)
    console.log('🔍 Fetching pending review requests in the processing window...');
    const { data: pendingRequests, error: fetchError } = await supabase
      .from('scheduled_review_requests')
      .select('*')  // Don't try to join with bookings table
      .eq('sent', false)
      .gte('scheduled_time', tenMinutesAgoUtc)   // Not older than 10 minutes
      .lte('scheduled_time', tenMinutesAheadUtc) // Not more than 10 minutes in future
      .order('scheduled_time', { ascending: true })
      .limit(10); // Process in batches to avoid timeout

    if (fetchError) {
      console.error('❌ Error fetching pending review requests:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch pending review requests', details: fetchError },
        { status: 500 }
      );
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      console.log('ℹ️ No pending review requests found in the processing window');
      return NextResponse.json({ 
        message: 'No pending review requests in the processing window',
        processingWindow: {
          from: tenMinutesAgoUtc,
          to: tenMinutesAheadUtc,
          fromThai: windowStartThai,
          toThai: windowEndThai
        },
        totalPending: totalPendingCount || 0
      });
    }

    console.log(`🔔 Found ${pendingRequests.length} pending review requests to process in this batch (of ${totalPendingCount} total)`);
    console.log('📄 Requests:', JSON.stringify(pendingRequests, null, 2));

    // For testing purposes, process all requests without checking booking status
    const validRequests = pendingRequests;
    
    if (validRequests.length === 0) {
      console.log('ℹ️ No valid review requests to process');
      return NextResponse.json({ message: 'No valid review requests to process' });
    }

    // 4. Process each valid request
    // For local development, we need to make sure we're using the right URL
    // In production, NEXT_PUBLIC_APP_URL should be set correctly
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   (request.url ? new URL(request.url).origin : 'http://localhost:3000');
    
    console.log(`🌐 Using base URL: ${baseUrl}`);
    
    // Use the predefined voucher image URL or override with env var if provided
    const voucherImageUrl = process.env.REVIEW_VOUCHER_IMAGE_URL || LINE_VOUCHER_IMAGE_URL;
    console.log(`🖼️ Using voucher image URL: ${voucherImageUrl}`);
    
    const results = await Promise.all(
      validRequests.map(async (request) => {
        console.log(`⏳ Processing request ID ${request.id} for ${request.provider}: ${request.contact_info}`);
        try {
          // Look up the booking and customer information
          const { data: bookingData, error: bookingError } = await supabase
            .from('bookings')
            .select('id, name, email, user_id')
            .eq('id', request.booking_id)
            .single();
          
          if (bookingError) {
            console.error(`❌ Error retrieving booking ${request.booking_id}:`, bookingError);
            throw new Error(`Failed to retrieve booking: ${bookingError.message}`);
          }
          
          // Try to get customer name from CRM if possible
          let customerName = bookingData.name; // Default to booking name
          
          // Check if there's a CRM mapping for this user
          if (bookingData.user_id) {
            const { data: crmMapping, error: crmError } = await supabase
              .from('crm_customer_mapping')
              .select('crm_customer_data')
              .eq('profile_id', bookingData.user_id)
              .eq('is_matched', true)
              .order('match_confidence', { ascending: false })
              .maybeSingle();
            
            if (!crmError && crmMapping?.crm_customer_data?.name) {
              // Use customer name from CRM if available
              customerName = crmMapping.crm_customer_data.name;
              console.log(`ℹ️ Using CRM customer name: ${customerName}`);
            }
          }
          
          // Send review request based on provider
          if (request.provider === 'line') {
            // Send LINE notification
            console.log(`📱 Sending LINE notification to ${request.contact_info}`);
            const lineEndpoint = `${baseUrl}/api/notifications/line/review-request`;
            console.log(`🔗 LINE endpoint: ${lineEndpoint}`);
            
            // For LINE, use provider_id instead of user_id/contact_info
            // and use the LINE-specific voucher image
            const lineVoucherUrl = process.env.LINE_VOUCHER_IMAGE_URL || LINE_VOUCHER_IMAGE_URL;
            console.log(`🖼️ Using LINE voucher image: ${lineVoucherUrl}`);
            
            const lineResponse = await fetch(lineEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: request.contact_info, // This is actually the LINE provider_id
                bookingName: bookingData.name,
                customerName: customerName, // Use actual customer name
                reviewUrl: GOOGLE_REVIEW_URL,
                voucherImageUrl: lineVoucherUrl
              })
            });

            const lineResponseText = await lineResponse.text();
            console.log(`📤 LINE API response: ${lineResponse.status} ${lineResponseText}`);

            if (!lineResponse.ok) {
              throw new Error(`LINE notification failed: ${lineResponse.status} ${lineResponse.statusText} - ${lineResponseText}`);
            }
          } else {
            // Send email notification
            console.log(`📧 Sending email notification to ${request.contact_info}`);
            const emailEndpoint = `${baseUrl}/api/notifications/email/review-request`;
            console.log(`🔗 Email endpoint: ${emailEndpoint}`);
            
            // Use the email-specific voucher image
            const emailVoucherUrl = process.env.EMAIL_VOUCHER_IMAGE_URL || EMAIL_VOUCHER_IMAGE_URL;
            console.log(`🖼️ Using email voucher image: ${emailVoucherUrl}`);
            
            const emailResponse = await fetch(emailEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: request.contact_info,
                userName: customerName, // Use actual customer name
                bookingName: bookingData.name,
                reviewUrl: GOOGLE_REVIEW_URL,
                voucherImageUrl: emailVoucherUrl
              })
            });

            const emailResponseText = await emailResponse.text();
            console.log(`📤 Email API response: ${emailResponse.status} ${emailResponseText}`);

            if (!emailResponse.ok) {
              throw new Error(`Email notification failed: ${emailResponse.status} ${emailResponse.statusText} - ${emailResponseText}`);
            }
          }

          // Mark request as sent
          console.log(`✏️ Marking request ${request.id} as sent`);
          const { data: updateData, error: updateError } = await supabase
            .from('scheduled_review_requests')
            .update({ sent: true })
            .eq('id', request.id)
            .select()
            .single();

          if (updateError) {
            console.error(`❌ Failed to update request status for ${request.id}:`, updateError);
            throw new Error(`Failed to update request status: ${updateError.message}`);
          }

          console.log(`✅ Successfully processed request ${request.id}`);
          return {
            id: request.id,
            provider: request.provider,
            contact_info: request.contact_info,
            status: 'sent',
            success: true
          };
        } catch (error) {
          console.error(`❌ Error processing review request ${request.id}:`, error);
          return {
            id: request.id,
            provider: request.provider,
            contact_info: request.contact_info,
            status: 'error',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    // 5. Return results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`🏁 Processing complete: ${successful} successful, ${failed} failed`);
    
    // 6. Log remaining pending requests after processing
    const { count: remainingCount, error: remainingError } = await supabase
      .from('scheduled_review_requests')
      .select('*', { count: 'exact', head: true })
      .eq('sent', false);
      
    if (!remainingError) {
      console.log(`📉 Remaining pending review requests: ${remainingCount}`);
    }
    
    return NextResponse.json({
      processed: results.length,
      successful,
      failed,
      totalPending: totalPendingCount,
      remainingPending: remainingCount || 0,
      processingWindow: {
        from: tenMinutesAgoUtc,
        to: tenMinutesAheadUtc,
        fromThai: windowStartThai,
        toThai: windowEndThai
      },
      results
    });
  } catch (error) {
    console.error('❌ Exception in processing review requests:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing review requests', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 