#!/usr/bin/env node

/**
 * Script to test the process-review-requests endpoint with detailed logging
 * 
 * Usage:
 *   CRON_API_KEY=your_api_key node scripts/test-process-reviews.js
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CRON_API_KEY = process.env.CRON_API_KEY || '2f93c28600516c88c346b197246515c6ce9b82aade54311a75031578bc75da42';
const LOG_FILE = path.join(__dirname, 'process-reviews-test.log');

if (!CRON_API_KEY) {
  console.error('Error: CRON_API_KEY environment variable is not set and no default provided');
  process.exit(1);
}

// Function to log to both console and file
function log(message, isError = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  if (isError) {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }
  
  // Also log to file
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

async function processReviewRequests() {
  log('--- Starting test of process-review-requests endpoint ---');
  log(`API URL: ${API_URL}`);
  log(`API Key: ${CRON_API_KEY.substring(0, 5)}...${CRON_API_KEY.substring(CRON_API_KEY.length - 5)}`);
  
  try {
    // First make a request without the Authorization header to test auth
    log('Testing authentication - making request without auth header...');
    try {
      const noAuthResponse = await fetch(`${API_URL}/api/notifications/process-review-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const noAuthResult = await noAuthResponse.json();
      
      if (noAuthResponse.status === 401) {
        log('✅ Authentication check passed - received 401 without auth header');
      } else {
        log(`❌ Authentication check failed - expected 401 but got ${noAuthResponse.status}`, true);
        log(`Response: ${JSON.stringify(noAuthResult)}`, true);
      }
    } catch (noAuthError) {
      log(`Error in no-auth test: ${noAuthError.message}`, true);
    }
    
    // Make the actual request with auth
    log('Making request with authorization...');
    const fullUrl = `${API_URL}/api/notifications/process-review-requests`;
    log(`Full URL: ${fullUrl}`);
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_API_KEY}`
      }
    });
    
    log(`Response status: ${response.status} ${response.statusText}`);
    
    // Log the response headers
    const headers = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    log(`Response headers: ${JSON.stringify(headers)}`);
    
    // Get the response body
    const responseText = await response.text();
    log(`Response body (raw): ${responseText}`);
    
    let result;
    try {
      result = JSON.parse(responseText);
      log(`Response parsed: ${JSON.stringify(result, null, 2)}`);
    } catch (parseError) {
      log(`Failed to parse response as JSON: ${parseError.message}`, true);
      log('Response was not valid JSON', true);
    }
    
    if (!response.ok) {
      log(`Error from API: ${result?.error || response.statusText}`, true);
      if (result?.details) {
        log(`Details: ${JSON.stringify(result.details)}`, true);
      }
    } else {
      log('✅ Request successful');
      
      if (result?.processed === 0) {
        log('No pending review requests to process');
      } else {
        log(`Processed ${result?.processed} review requests`);
        log(`  ✅ Successful: ${result?.successful}`);
        log(`  ❌ Failed: ${result?.failed}`);
        
        if (result?.failed > 0) {
          log('Failed requests:');
          result.results
            .filter(r => !r.success)
            .forEach(r => {
              log(`  - ID ${r.id}: ${r.error}`, true);
            });
        }
        
        if (result?.successful > 0) {
          log('Successful requests:');
          result.results
            .filter(r => r.success)
            .forEach(r => {
              log(`  - ID ${r.id} (${r.provider}): ${r.contact_info}`);
            });
        }
      }
    }
    
    log('--- Test completed ---');
    
    return result;
  } catch (error) {
    log(`Execution error: ${error.message}`, true);
    if (error.stack) {
      log(`Stack trace: ${error.stack}`, true);
    }
    log('--- Test failed ---', true);
    throw error;
  }
}

// Execute the function
processReviewRequests()
  .then(() => {
    log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    log(`Script failed: ${error.message}`, true);
    process.exit(1);
  }); 