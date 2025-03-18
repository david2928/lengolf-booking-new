#!/usr/bin/env node

/**
 * Script to manually send a test review request
 * 
 * Usage:
 *   node scripts/send-test-review-request.js --provider=email --to=dgeiermann@gmail.com --name="John Doe"
 *   node scripts/send-test-review-request.js --provider=line --to=Uf4177a1781df7fd215e6d2749fd00296 --name="Jane Smith"
 */

const fetch = require('node-fetch');

// Configuration
const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const REVIEW_URL = 'https://g.page/r/CXwvpW56UsBgEAE/review';
const LINE_VOUCHER_IMAGE_URL = 'https://www.len.golf/wp-content/uploads/2025/03/google_review_voucher.png';
const EMAIL_VOUCHER_IMAGE_URL = 'https://www.len.golf/wp-content/uploads/2025/03/google_review_voucher_email.png';

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
  console.error('  node scripts/send-test-review-request.js --provider=email --to=user@example.com --name="John Doe"');
  console.error('  node scripts/send-test-review-request.js --provider=line --to=Uf4177a1781df7fd215e6d2749fd00296 --name="Jane Smith"');
  process.exit(1);
}

// Validate provider
if (args.provider !== 'email' && args.provider !== 'line') {
  console.error('Error: Provider must be either "email" or "line"');
  process.exit(1);
}

async function sendTestReviewRequest() {
  console.log(`Sending test ${args.provider} review request to ${args.to}...`);
  
  try {
    // Prepare request body based on provider
    let endpoint, body;
    
    if (args.provider === 'line') {
      endpoint = `${API_URL}/api/notifications/line/review-request`;
      body = {
        userId: args.to,
        bookingName: args.name,
        reviewUrl: REVIEW_URL,
        voucherImageUrl: LINE_VOUCHER_IMAGE_URL
      };
    } else {
      endpoint = `${API_URL}/api/notifications/email/review-request`;
      body = {
        email: args.to,
        userName: args.name,
        reviewUrl: REVIEW_URL,
        voucherImageUrl: EMAIL_VOUCHER_IMAGE_URL
      };
    }
    
    // Send request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error('Error from API:', result.error || response.statusText);
      if (result.details) {
        console.error('Details:', result.details);
      }
      process.exit(1);
    }
    
    console.log('✅ Review request sent successfully!');
    console.log(result);
    
    process.exit(0);
  } catch (error) {
    console.error('Execution error:', error);
    process.exit(1);
  }
}

// Run the main function
sendTestReviewRequest(); 