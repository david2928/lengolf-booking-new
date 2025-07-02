/**
 * Review Request Scheduler using Supabase Cron
 * 
 * This module provides functions to schedule review requests using Supabase Cron,
 * which is tightly integrated with our Supabase database.
 * 
 * Instead of using an external service, we simply store the request in our database
 * and let Supabase Cron trigger our webhook endpoint at the appropriate time.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { addMinutes, addHours, parse } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';

const TIMEZONE = 'Asia/Bangkok';

// Create service role client for admin operations
const getServiceRoleClient = () => {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  );
};

interface ScheduleOptions {
  bookingId: string;
  userId: string;
  provider: 'line' | 'email';
  contactInfo: string;
  delayMinutes?: number; // Optional direct delay in minutes
}

/**
 * Schedule a review request using Supabase Database
 * Supabase Cron will be configured to periodically check for review requests that are due
 */
export async function scheduleReviewRequest(options: ScheduleOptions): Promise<boolean> {
  try {
    const supabase = getServiceRoleClient();
    let scheduledTime: Date;
    
    // If specific delay minutes are provided, use them from current time
    if (options.delayMinutes) {
      // Calculate scheduled time using provided delay
      const now = new Date();
      scheduledTime = addMinutes(now, options.delayMinutes);
      console.log(`Scheduling review request using delay of ${options.delayMinutes} minutes from now`);
    } else {
      // Look up the booking details to calculate based on end time
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('date, start_time, duration')
        .eq('id', options.bookingId)
        .single();
      
      if (bookingError || !booking) {
        console.error('Error fetching booking details for review scheduling:', bookingError);
        return false;
      }
      
      // Calculate the end time of the booking
      const parsedDateTime = parse(`${booking.date} ${booking.start_time}`, 'yyyy-MM-dd HH:mm', new Date());
      const startTimeUtc = zonedTimeToUtc(parsedDateTime, TIMEZONE);
      const endTimeUtc = addHours(startTimeUtc, booking.duration);
      
      // Add 30 minutes after the booking ends
      scheduledTime = addMinutes(endTimeUtc, 30);
      console.log(`Scheduling review request for 30 minutes after booking ends at ${scheduledTime.toISOString()}`);
    }
    
    // Create database record
    const { error } = await supabase
      .from('scheduled_review_requests')
      .insert({
        booking_id: options.bookingId,
        user_id: options.userId,
        scheduled_time: scheduledTime.toISOString(),
        provider: options.provider,
        contact_info: options.contactInfo,
        sent: false,
        status: 'pending'
      });
    
    if (error) {
      console.error('Error creating scheduled review request in database:', error);
      return false;
    }
    
    console.log(`Review request scheduled in database for ${scheduledTime.toISOString()}`);
    return true;
  } catch (error) {
    console.error('Error scheduling review request:', error);
    return false;
  }
} 