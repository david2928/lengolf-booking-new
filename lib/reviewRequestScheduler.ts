/**
 * Review Request Scheduler using Supabase Cron
 * 
 * This module provides functions to schedule review requests using Supabase Cron,
 * which is tightly integrated with our Supabase database.
 * 
 * Instead of using an external service, we simply store the request in our database
 * and let Supabase Cron trigger our webhook endpoint at the appropriate time.
 */

import { createAdminClient } from '@/utils/supabase/admin';
import { addMinutes, addHours, parse } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';

const TIMEZONE = 'Asia/Bangkok';

interface ScheduleOptions {
  bookingId: string;
  userId: string;
  provider: 'line' | 'email';
  contactInfo: string;
  delayMinutes?: number; // Optional direct delay in minutes
  /**
   * The booking's own scheduling inputs. Callers that just wrote the booking row
   * already hold these — passing them skips a redundant SELECT. Omit them and we
   * fall back to reading the row (staff/legacy callers).
   */
  booking?: {
    date: string;
    start_time: string;
    duration: number;
  };
}

/**
 * Schedule a review request using Supabase Database
 * Supabase Cron will be configured to periodically check for review requests that are due
 */
export async function scheduleReviewRequest(options: ScheduleOptions): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    let scheduledTime: Date;

    // If specific delay minutes are provided, use them from current time
    if (options.delayMinutes) {
      // Calculate scheduled time using provided delay
      const now = new Date();
      scheduledTime = addMinutes(now, options.delayMinutes);
      console.log(`Scheduling review request using delay of ${options.delayMinutes} minutes from now`);
    } else {
      // Prefer the caller's copy of the booking; only read the row if we weren't given one.
      let booking = options.booking;

      if (!booking) {
        const { data: fetched, error: bookingError } = await supabase
          .from('bookings')
          .select('date, start_time, duration')
          .eq('id', options.bookingId)
          .single();

        if (bookingError || !fetched) {
          console.error('Error fetching booking details for review scheduling:', bookingError);
          return false;
        }
        booking = fetched;
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