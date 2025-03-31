/**
 * Google Authentication Test
 * 
 * This script tests whether the Google service account is properly configured
 * Use: npx ts-node scripts/test-google-auth.ts
 */

import { auth } from '../lib/googleApiConfig';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function testGoogleAuth() {
  console.log('=== GOOGLE AUTH TEST ===\n');
  
  try {
    console.log('Testing service account authentication...');
    
    // Attempt to get an access token from the credentials
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    
    if (token && token.token) {
      console.log('✅ Authentication successful!');
      console.log(`   Access token obtained: ${token.token.substring(0, 10)}...`);
      
      // Access token type if available
      const tokenType = token.res?.headers?.['token-type'] || 'Bearer';
      console.log(`   Token type: ${tokenType}`);
      
      console.log(`   Token expires in: ${token.res?.data?.expires_in} seconds`);
      
      // Check if service account key is properly loaded
      const decoded = Buffer.from(process.env.SERVICE_ACCOUNT_KEY_BASE64 || '', 'base64').toString('utf8');
      const credentials = JSON.parse(decoded);
      
      console.log('\nService Account Details:');
      console.log(`   Client Email: ${credentials.client_email}`);
      console.log(`   Project ID: ${credentials.project_id}`);
      
      return true;
    } else {
      console.log('❌ Authentication failed: No token received');
      return false;
    }
  } catch (error: any) {
    console.log('❌ Authentication failed with error:');
    console.log(`   Error message: ${error.message}`);
    
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Status Text: ${error.response.statusText}`);
      console.log(`   Error Details:`, error.response.data?.error || {});
    }
    
    return false;
  }
}

// Run the test
testGoogleAuth()
  .then((success) => {
    console.log('\nGoogle authentication test completed');
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Error running authentication test:', error);
    process.exit(1);
  }); 