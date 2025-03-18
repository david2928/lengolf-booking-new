#!/usr/bin/env node

/**
 * Script to schedule a test review request directly in the database
 * 
 * Usage:
 *   SUPABASE_URL=your-url SUPABASE_SERVICE_KEY=your-key node scripts/schedule-test-review.js --provider=email --to=user@example.com --name="John Doe" --when="2025-03-17 16:25:00"
 *   SUPABASE_URL=your-url SUPABASE_SERVICE_KEY=your-key node scripts/schedule-test-review.js --provider=line --to=Uf4177a1781df7fd215e6d2749fd00296 --name="Jane Smith" --when="2025-03-17 16:25:00"
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// Constants
const GOOGLE_REVIEW_URL = 'https://g.page/r/CXwvpW56UsBgEAE/review';
const LINE_VOUCHER_IMAGE_URL = 'https://www.len.golf/wp-content/uploads/2025/03/google_review_voucher.png';
const EMAIL_VOUCHER_IMAGE_URL = 'https://www.len.golf/wp-content/uploads/2025/03/google_review_voucher_email.png';

// Check for required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Error: Missing required environment variables: ' + missingEnvVars.join(', '));
  console.error('\nUsage:');
  console.error('  SUPABASE_URL=your-url SUPABASE_SERVICE_KEY=your-key node scripts/schedule-test-review.js [options]');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) {
    acc[match[1]] = match[2];
  }
  return acc;
}, {});

// Validate required arguments
const requiredArgs = ['provider', 'to', 'name'];
const missingArgs = requiredArgs.filter(arg => !args[arg]);

if (missingArgs.length > 0) {
  console.error('Error: Missing required arguments: ' + missingArgs.join(', '));
  console.error('\nUsage:');
  console.error('  node scripts/schedule-test-review.js --provider=email --to=user@example.com --name="John Doe" --when="2025-03-17 16:25:00"');
  console.error('  node scripts/schedule-test-review.js --provider=line --to=Uf4177a1781df7fd215e6d2749fd00296 --name="Jane Smith" --when="2025-03-17 16:25:00"');
  process.exit(1);
}

// Validate provider
if (args.provider !== 'email' && args.provider !== 'line') {
  console.error('Error: Provider must be either "email" or "line"');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function scheduleTestReviewRequest() {
  try {
    // Generate mock booking ID if not provided
    const bookingId = args.bookingId || `TEST-${new Date().getTime()}`;
    
    // Parse scheduled time (default to now + 5 minutes if not provided)
    let scheduledTime;
    if (args.when) {
      // Parse the provided time string
      scheduledTime = new Date(args.when);
      
      // Check if it's a valid date
      if (isNaN(scheduledTime.getTime())) {
        console.error('Error: Invalid date/time format. Please use YYYY-MM-DD HH:MM:SS format.');
        process.exit(1);
      }
    } else {
      // Default to 5 minutes from now
      scheduledTime = new Date();
      scheduledTime.setMinutes(scheduledTime.getMinutes() + 5);
    }
    
    // Format date for display
    const formattedDate = scheduledTime.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    
    // Use the predefined voucher image URL or override with env var if provided
    const voucherImageUrl = process.env.REVIEW_VOUCHER_IMAGE_URL || (args.provider === 'line' ? LINE_VOUCHER_IMAGE_URL : EMAIL_VOUCHER_IMAGE_URL);
    
    console.log(`
=== TEST REVIEW REQUEST ===
Provider:       ${args.provider}
Recipient:      ${args.to}
Name:           ${args.name}
Booking:        ${bookingId}
Scheduled Time: ${formattedDate}
Review URL:     ${GOOGLE_REVIEW_URL}
Voucher Image:  ${voucherImageUrl}
=====================
`);
    
    // Create a test booking if needed (for foreign key constraint)
    let userId = '00000000-0000-0000-0000-000000000000';
    
    // Check if the test booking already exists
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', bookingId)
      .maybeSingle();
    
    if (!existingBooking) {
      console.log(`Creating test booking with ID: ${bookingId}`);
      
      // Create a test booking
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          id: bookingId,
          name: args.name,
          email: args.provider === 'email' ? args.to : 'test@example.com',
          phone_number: '0000000000',
          date: new Date().toISOString().split('T')[0],
          start_time: '12:00',
          duration: 1,
          number_of_people: 1,
          user_id: userId,
          bay: 'test-bay',
          status: 'confirmed'
        });
      
      if (bookingError) {
        console.error('Error creating test booking:', bookingError);
        console.log('Continuing with schedule request...');
      }
    } else {
      console.log(`Using existing booking with ID: ${bookingId}`);
    }
    
    // Insert scheduled review request
    const { data, error } = await supabase
      .from('scheduled_review_requests')
      .insert({
        id: uuidv4(),
        booking_id: bookingId,
        user_id: userId,
        scheduled_time: scheduledTime.toISOString(),
        provider: args.provider,
        contact_info: args.to,
        sent: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error scheduling review request:', error);
      process.exit(1);
    }
    
    console.log('✅ Test review request scheduled successfully!');
    console.log(data);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the function
scheduleTestReviewRequest(); 