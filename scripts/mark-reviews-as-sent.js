#!/usr/bin/env node

/**
 * Script to mark all pending review requests as sent
 * 
 * Usage:
 *   node scripts/mark-reviews-as-sent.js
 */

const { createClient } = require('@supabase/supabase-js');

// Configure Supabase client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

// Create a Supabase client with the service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function markReviewsAsSent() {
  console.log('Marking all pending review requests as sent...');
  
  try {
    // Get all pending review requests
    const { data: pendingRequests, error: fetchError } = await supabase
      .from('scheduled_review_requests')
      .select('*')
      .eq('sent', false);

    if (fetchError) {
      console.error('Error fetching pending review requests:', fetchError);
      return;
    }
    
    if (!pendingRequests || pendingRequests.length === 0) {
      console.log('No pending review requests found');
      return;
    }
    
    console.log(`Found ${pendingRequests.length} pending review requests`);
    
    // Mark each request as sent
    const { data: updateResult, error: updateError } = await supabase
      .from('scheduled_review_requests')
      .update({ sent: true })
      .eq('sent', false);
    
    if (updateError) {
      console.error('Error updating review requests:', updateError);
      return;
    }
    
    console.log(`✅ Successfully marked all pending review requests as sent`);
    return pendingRequests.length;
  } catch (error) {
    console.error('Error in markReviewsAsSent:', error);
    throw error;
  }
}

// Execute the function
markReviewsAsSent()
  .then((count) => {
    if (count) {
      console.log(`Marked ${count} review requests as sent`);
    }
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 