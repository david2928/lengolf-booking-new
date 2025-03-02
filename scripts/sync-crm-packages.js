#!/usr/bin/env node
/**
 * This script syncs package information from the CRM system to our local database.
 * 
 * It will:
 * 1. Fetch all available packages from the CRM
 * 2. Update our local crm_packages table
 * 3. Link packages to customers based on customer mappings
 * 
 * Usage:
 * 1. Run `node scripts/sync-crm-packages.js`
 * 2. Check the console output for results
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Import the syncCrmPackages function directly
const { syncCrmPackages } = require('../utils/supabase/crm-packages');

/**
 * Main function to sync CRM packages
 */
async function main() {
  try {
    console.log('Starting CRM package sync...');
    
    // Sync packages
    const result = await syncCrmPackages();
    
    // Output results
    console.log('\nPackage Sync Complete. Results:');
    console.log(`Total packages processed: ${result.totalPackages}`);
    console.log(`New packages created: ${result.newPackages}`);
    console.log(`Existing packages updated: ${result.updatedPackages}`);
    console.log(`Errors: ${result.errors}`);
    
    return result;
  } catch (error) {
    console.error('Error in package sync:', error);
    return {
      error: error.message
    };
  }
}

// Run the main function if called directly
if (require.main === module) {
  main().catch(console.error);
}

// Export the main function
module.exports = { main }; 