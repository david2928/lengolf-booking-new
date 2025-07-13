#!/usr/bin/env node

/**
 * Data Migration Script: Fix Wrong or Null stable_hash_id Values in Bookings
 * 
 * This script identifies bookings with incorrect or null stable_hash_id values 
 * and fixes them by re-matching to the correct customers using name and phone number matching.
 * 
 * Problem: Some bookings have a non-matching stable_hash_id, while others have a null value,
 * breaking package lookups, notifications, and VIP features.
 * 
 * Usage: node scripts/fix-booking-stable-hash-ids.js [--dry-run] [--profile-id=UUID]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  batchSize: 50,
  debugMode: process.argv.includes('--debug'),
  dryRun: process.argv.includes('--dry-run'),
  profileId: process.argv.find(arg => arg.startsWith('--profile-id='))?.split('=')[1] || null,
  confidence_threshold: 0.7
};

// Supabase client with admin privileges
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Logging
const logFileName = `fix-booking-stable-hash-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
const logFilePath = path.join(__dirname, '..', 'logs', logFileName);

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  
  if (data) {
    console.log(logEntry, data);
    fs.appendFileSync(logFilePath, `${logEntry}\n${JSON.stringify(data, null, 2)}\n`);
  } else {
    console.log(logEntry);
    fs.appendFileSync(logFilePath, `${logEntry}\n`);
  }
}

// Phone number normalization (same logic as customer-matching.ts)
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  phone = String(phone);
  let normalized = phone.replace(/\D/g, '');
  
  if (normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }
  
  if (normalized.startsWith('66') || normalized.startsWith('661')) {
    normalized = normalized.substring(2);
  }
  
  if (normalized.length > 9 && !normalized.startsWith('66')) {
    normalized = normalized.substring(normalized.length - 9);
  }
  
  if (normalized.length > 8) {
    return normalized.substring(normalized.length - 9);
  }
  
  return normalized;
}

// Name similarity calculation
function calculateNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;
  
  const normalize = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  if (n1 === n2) return 1.0;
  
  // Check if one name contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;
  
  // Check first name match
  const parts1 = n1.split(/\s+/);
  const parts2 = n2.split(/\s+/);
  
  if (parts1[0] === parts2[0] && parts1[0].length > 2) return 0.7;
  
  return 0;
}

// Phone similarity calculation
function calculatePhoneSimilarity(phone1, phone2) {
  const norm1 = normalizePhoneNumber(phone1);
  const norm2 = normalizePhoneNumber(phone2);
  
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;
  
  // Check if one phone contains the other (for different formats)
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
  
  return 0;
}

// Find matching customer for a booking
async function findMatchingCustomer(booking, allCustomers) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const customer of allCustomers) {
      let score = 0;
      let reasons = [];
      
      // Phone number matching (most important)
      const phoneScore = calculatePhoneSimilarity(booking.phone_number, customer.contact_number);
      if (phoneScore > 0) {
        score += phoneScore * 0.8; // 80% weight
        reasons.push(`phone_match_${phoneScore}`);
      }
      
      // Name matching
      const nameScore = calculateNameSimilarity(booking.name, customer.customer_name);
      if (nameScore > 0) {
        score += nameScore * 0.2; // 20% weight
        reasons.push(`name_match_${nameScore}`);
      }
      
      // Require minimum phone similarity to consider it a potential match
      if (phoneScore >= 0.9 && score > bestScore) {
        bestMatch = {
          customer,
          score,
          reasons,
          phoneScore,
          nameScore
        };
        bestScore = score;
      }
    }
    
    return bestMatch && bestScore >= config.confidence_threshold ? bestMatch : null;
}

// Get bookings with wrong or null stable_hash_id
async function getProblematicBookings() {
  try {
    log('info', 'Fetching all bookings since 2025-01-01 to check stable_hash_id...');
    
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, user_id, name, phone_number, email, date, stable_hash_id')
      .gte('date', '2025-01-01')
      .order('date', { ascending: false });
    
    if (error) {
      throw new Error(`Error fetching bookings: ${error.message}`);
    }
    
    log('info', `Found ${bookings.length} total bookings to check.`);
    
    // Get all valid customer hashes
    const { data: customers, error: customerError } = await supabase
      .schema('backoffice')
      .from('customers')
      .select('id, customer_name, contact_number, email, stable_hash_id');
    
    if (customerError) {
      throw new Error(`Error fetching customer hashes: ${customerError.message}`);
    }
    
    const validHashes = new Set(customers.map(c => c.stable_hash_id));
    const problematicBookings = bookings.filter(b => !b.stable_hash_id || !validHashes.has(b.stable_hash_id));
    
    log('info', `Found ${problematicBookings.length} bookings with incorrect or null stable_hash_id.`);
    
    // Pass all customers to avoid re-fetching
    return { problematicBookings, allCustomers: customers };
    
  } catch (error) {
    log('error', 'Error fetching problematic bookings:', error);
    throw error;
  }
}

// Fix a batch of bookings
async function fixBookingBatch(bookings, allCustomers) {
  const results = {
    fixed: 0,
    skipped: 0,
    errors: 0,
    details: []
  };
  
  for (const booking of bookings) {
    try {
      log('info', `Processing booking ${booking.id} - ${booking.name} (${booking.phone_number})`);
      
      // NEW: Try to derive stable_hash_id via existing CRM mapping before fuzzy matching
      try {
        const { data: mapping, error: mappingError } = await supabase
          .from('crm_customer_mapping')
          .select('stable_hash_id')
          .eq('profile_id', booking.user_id)
          .eq('is_matched', true)
          .maybeSingle();

        if (mappingError) {
          log('warn', `Unable to fetch CRM mapping for profile ${booking.user_id}:`, mappingError);
        }

        if (mapping && mapping.stable_hash_id) {
          const correctHash = mapping.stable_hash_id;

          if (booking.stable_hash_id !== correctHash) {
            if (config.dryRun) {
              log('info', `DRY RUN: Would update booking ${booking.id} stable_hash_id from ${booking.stable_hash_id} to ${correctHash} (via CRM mapping)`);
              results.fixed++;
              results.details.push({
                bookingId: booking.id,
                status: 'fixed_dry_run',
                method: 'crm_mapping',
                oldHash: booking.stable_hash_id,
                newHash: correctHash
              });
            } else {
              const { error: updateError } = await supabase
                .from('bookings')
                .update({ stable_hash_id: correctHash })
                .eq('id', booking.id);

              if (updateError) {
                log('error', `Error updating booking ${booking.id}:`, updateError);
                results.errors++;
                results.details.push({
                  bookingId: booking.id,
                  status: 'error',
                  method: 'crm_mapping',
                  error: updateError.message
                });
              } else {
                log('info', `Successfully updated booking ${booking.id} via CRM mapping.`);
                results.fixed++;
                results.details.push({
                  bookingId: booking.id,
                  status: 'fixed',
                  method: 'crm_mapping',
                  oldHash: booking.stable_hash_id,
                  newHash: correctHash
                });
              }
            }
            // Skip fuzzy matching since mapping provided the answer
            continue;
          }
        }
      } catch (mappingException) {
        log('error', `Unexpected error while checking CRM mapping for booking ${booking.id}:`, mappingException);
      }

      // Find matching customer (fuzzy match as fallback)
      const match = await findMatchingCustomer(booking, allCustomers);
      
      if (!match) {
        log('warn', `No matching customer found for booking ${booking.id}`);
        results.skipped++;
        results.details.push({
          bookingId: booking.id,
          status: 'skipped',
          reason: 'no_matching_customer'
        });
        continue;
      }
      
      const { customer, score, reasons, phoneScore, nameScore } = match;
      
      log('info', `Found match for booking ${booking.id}:`, {
        customer: customer.customer_name,
        currentHash: booking.stable_hash_id,
        correctHash: customer.stable_hash_id,
        score,
        phoneScore,
        nameScore,
        reasons
      });
      
      if (config.dryRun) {
        log('info', `DRY RUN: Would update booking ${booking.id} stable_hash_id from ${booking.stable_hash_id} to ${customer.stable_hash_id}`);
        results.fixed++;
      } else {
        // Update the booking
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ stable_hash_id: customer.stable_hash_id })
          .eq('id', booking.id);
        
        if (updateError) {
          log('error', `Error updating booking ${booking.id}:`, updateError);
          results.errors++;
          results.details.push({
            bookingId: booking.id,
            status: 'error',
            error: updateError.message
          });
        } else {
          log('info', `Successfully updated booking ${booking.id}`);
          results.fixed++;
          results.details.push({
            bookingId: booking.id,
            status: 'fixed',
            oldHash: booking.stable_hash_id,
            newHash: customer.stable_hash_id,
            customer: customer.customer_name,
            score
          });
        }
      }
      
    } catch (error) {
      log('error', `Error processing booking ${booking.id}:`, error);
      results.errors++;
      results.details.push({
        bookingId: booking.id,
        status: 'error',
        error: error.message
      });
    }
  }
  
  return results;
}

// Main execution
async function main() {
  try {
    log('info', 'Starting booking stable_hash_id fix process', config);
    
    // Get problematic bookings and all customer data
    const { problematicBookings, allCustomers } = await getProblematicBookings();
    
    if (problematicBookings.length === 0) {
      log('info', 'No problematic bookings found. All stable_hash_id values are correct!');
      return;
    }
    
    log('info', `Processing ${problematicBookings.length} problematic bookings in batches of ${config.batchSize}...`);
    
    const totalResults = {
      fixed: 0,
      skipped: 0,
      errors: 0,
      details: []
    };
    
    // Process in batches
    for (let i = 0; i < problematicBookings.length; i += config.batchSize) {
      const batch = problematicBookings.slice(i, i + config.batchSize);
      log('info', `Processing batch ${Math.floor(i / config.batchSize) + 1} (${batch.length} bookings)...`);
      
      const batchResults = await fixBookingBatch(batch, allCustomers);
      
      totalResults.fixed += batchResults.fixed;
      totalResults.skipped += batchResults.skipped;
      totalResults.errors += batchResults.errors;
      totalResults.details.push(...batchResults.details);
      
      log('info', `Batch completed: ${batchResults.fixed} fixed, ${batchResults.skipped} skipped, ${batchResults.errors} errors`);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Final summary
    log('info', 'Migration completed!', {
      totalProcessed: problematicBookings.length,
      fixed: totalResults.fixed,
      skipped: totalResults.skipped,
      errors: totalResults.errors,
      successRate: problematicBookings.length > 0 ? `${((totalResults.fixed / problematicBookings.length) * 100).toFixed(1)}%` : '100.0%'
    });
    
    // Write detailed results to file
    const resultsFile = logFilePath.replace('.log', '-results.json');
    fs.writeFileSync(resultsFile, JSON.stringify(totalResults, null, 2));
    log('info', `Detailed results written to: ${resultsFile}`);
    
  } catch (error) {
    log('error', 'Migration failed:', error);
    process.exit(1);
  }
}

// Handle script termination
process.on('SIGINT', () => {
  log('info', 'Migration interrupted by user');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception:', error);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main, normalizePhoneNumber, calculateNameSimilarity, calculatePhoneSimilarity };