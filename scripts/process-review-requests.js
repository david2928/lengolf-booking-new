#!/usr/bin/env node

/**
 * Script to process scheduled review requests
 * 
 * This script can be run via a cron job every 5 minutes to process
 * any pending review requests that are due to be sent.
 * 
 * Usage:
 *   CRON_API_KEY=your_secret_key node scripts/process-review-requests.js
 */

const fetch = require('node-fetch');

// Configuration
const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CRON_API_KEY = process.env.CRON_API_KEY;

if (!CRON_API_KEY) {
  console.error('Error: CRON_API_KEY environment variable is not set');
  process.exit(1);
}

async function processReviewRequests() {
  console.log(`[${new Date().toISOString()}] Processing scheduled review requests...`);
  
  try {
    const response = await fetch(`${API_URL}/api/notifications/process-review-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_API_KEY}`
      }
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error('Error from API:', result.error || response.statusText);
      process.exit(1);
    }
    
    // Log results
    if (result.processed === 0) {
      console.log('No pending review requests to process');
    } else {
      console.log(`Processed ${result.processed} review requests`);
      console.log(`  ✅ Successful: ${result.successful}`);
      console.log(`  ❌ Failed: ${result.failed}`);
      
      if (result.failed > 0) {
        console.log('\nFailed requests:');
        result.results
          .filter(r => !r.success)
          .forEach(r => {
            console.log(`  - ID ${r.id}: ${r.error}`);
          });
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Execution error:', error.message);
    process.exit(1);
  }
}

// Run the main function
processReviewRequests(); 