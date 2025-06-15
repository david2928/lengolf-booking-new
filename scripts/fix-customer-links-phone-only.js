#!/usr/bin/env node

/**
 * Fix Customer Links - Phone Number Only Script
 * 
 * This script fixes customer mappings using ONLY phone number matching
 * with high confidence thresholds. Focuses on ensuring future bookings
 * work correctly rather than fixing historical data.
 * 
 * Usage: node scripts/fix-customer-links-phone-only.js [options]
 * 
 * Options:
 *   --dry-run: Show what would be changed without making changes
 *   --batch-size=N: Process N profiles at a time (default: 50)
 *   --confidence=N: Minimum confidence threshold (default: 0.8)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  batchSize: parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 50,
  dryRun: process.argv.includes('--dry-run'),
  confidenceThreshold: parseFloat(process.argv.find(arg => arg.startsWith('--confidence='))?.split('=')[1]) || 0.8
};

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

// Statistics tracking
const stats = {
  totalProfiles: 0,
  processed: 0,
  matched: 0,
  updated: 0,
  created: 0,
  skipped: 0,
  errors: 0,
  startTime: Date.now()
};

// Phone number normalization (same as production - updated to match utils/customer-matching.ts)
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Convert to string if not already
  phone = String(phone);
  
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');
  
  // For Thai mobile numbers, if it starts with '0', convert to '+66'
  if (normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }
  
  // For international format, if it starts with country code, extract the last 9 digits
  if (normalized.startsWith('66') || normalized.startsWith('661')) {
    normalized = normalized.substring(2);
  }
  
  // For international format without +, if it starts with other country codes
  if (normalized.length > 9 && !normalized.startsWith('66')) {
    // Extract the last 9 digits for comparison
    normalized = normalized.substring(normalized.length - 9);
  }
  
  // Try to consistently extract the last N digits for comparison
  // This helps match numbers that might be formatted differently but are actually the same
  if (normalized.length > 8) {
    // Keep the last 9 digits for consistency when comparing
    normalized = normalized.substring(Math.max(0, normalized.length - 9));
  }
  
  return normalized;
}

// Levenshtein distance calculation (from utils/customer-matching.ts)
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // Initialize the first row and column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Calculate phone number similarity (from utils/customer-matching.ts)
function phoneNumberSimilarity(phone1, phone2) {
  if (!phone1 || !phone2) return 0;
  
  // For very short numbers, require exact match
  if (phone1.length < 8 || phone2.length < 8) {
    return phone1 === phone2 ? 1 : 0;
  }
  
  // Calculate edit distance
  const distance = levenshteinDistance(phone1, phone2);
  
  // Calculate similarity score
  // For longer phone numbers, we allow more differences
  const maxLength = Math.max(phone1.length, phone2.length);
  const maxPhoneEditDistance = 2; // CONFIG.maxPhoneEditDistance
  const similarityThreshold = Math.min(maxPhoneEditDistance, Math.floor(maxLength * 0.2)); 
  
  let similarity = 0;
  if (distance === 0) {
    similarity = 1; // Exact match
  } else if (distance === 1) {
    similarity = 0.9; // Off by just one digit
  } else if (distance === 2) {
    similarity = 0.8; // Off by two digits
  } else if (distance <= similarityThreshold) {
    similarity = 0.7; // Similar enough but not very close
  }
  
  return similarity;
}

// Phone-only matching with high confidence
function calculatePhoneMatchConfidence(profilePhone, customerPhone) {
  const normalizedProfilePhone = normalizePhoneNumber(profilePhone);
  const normalizedCustomerPhone = normalizePhoneNumber(customerPhone);
  
  if (!normalizedProfilePhone || !normalizedCustomerPhone) {
    return { confidence: 0, reason: 'missing_phone' };
  }
  
  // Require minimum phone length
  if (normalizedProfilePhone.length < 8 || normalizedCustomerPhone.length < 8) {
    return { confidence: 0, reason: 'phone_too_short' };
  }
  
  const similarity = phoneNumberSimilarity(normalizedProfilePhone, normalizedCustomerPhone);
  
  if (similarity === 1) {
    return { confidence: 1.0, reason: 'exact_phone_match' };
  } else if (similarity >= 0.95) {
    return { confidence: 0.9, reason: 'very_similar_phone_match' };
  } else if (similarity >= 0.9) {
    return { confidence: 0.85, reason: 'similar_phone_match' };
  } else {
    return { confidence: similarity, reason: 'partial_phone_match' };
  }
}

async function findPhoneMatch(profile, customers) {
  if (!profile.phone_number) {
    return { matched: false, confidence: 0, reason: 'no_profile_phone' };
  }
  
  let bestMatch = null;
  let bestConfidence = 0;
  let bestReason = '';
  
  for (const customer of customers) {
    if (!customer.contact_number) continue;
    
    const { confidence, reason } = calculatePhoneMatchConfidence(
      profile.phone_number, 
      customer.contact_number
    );
    
    if (confidence > bestConfidence) {
      bestMatch = customer;
      bestConfidence = confidence;
      bestReason = reason;
    }
  }
  
  return {
    matched: bestConfidence >= CONFIG.confidenceThreshold,
    confidence: bestConfidence,
    customer: bestMatch,
    reason: bestReason
  };
}

async function processProfile(profile, customers) {
  try {
    console.log(`\nProcessing: ${profile.display_name} (${profile.phone_number})`);
    
    // Skip profiles without phone numbers
    if (!profile.phone_number) {
      console.log('  ⏭️  Skipping - no phone number');
      stats.skipped++;
      return;
    }
    
    // Check for existing mapping
    const { data: existingMapping } = await supabase
      .from('crm_customer_mapping')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle();
    
    // Perform phone-only matching
    const matchResult = await findPhoneMatch(profile, customers);
    
    if (matchResult.matched) {
      console.log(`  ✅ Phone match: ${matchResult.customer.customer_name}`);
      console.log(`  📞 Customer phone: ${matchResult.customer.contact_number}`);
      console.log(`  🔗 Stable hash: ${matchResult.customer.stable_hash_id}`);
      console.log(`  📊 Confidence: ${matchResult.confidence.toFixed(3)} (${matchResult.reason})`);
      
      // Check if this is actually an update needed
      const needsUpdate = !existingMapping || 
                         existingMapping.stable_hash_id !== matchResult.customer.stable_hash_id ||
                         existingMapping.crm_customer_id !== matchResult.customer.id;
      
      if (!needsUpdate) {
        console.log('  ✓ Mapping already correct');
        stats.processed++;
        return;
      }
      
      if (existingMapping) {
        console.log(`  🔄 Updating mapping (was: ${existingMapping.stable_hash_id})`);
      } else {
        console.log('  ➕ Creating new mapping');
      }
      
      if (!CONFIG.dryRun) {
        const mappingData = {
          profile_id: profile.id,
          crm_customer_id: matchResult.customer.id,
          stable_hash_id: matchResult.customer.stable_hash_id,
          is_matched: true,
          match_method: `phone_only_${matchResult.reason}`,
          match_confidence: matchResult.confidence,
          crm_customer_data: matchResult.customer,
          updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase
          .from('crm_customer_mapping')
          .upsert(mappingData, { onConflict: 'profile_id' });
        
        if (error) {
          console.error(`  ❌ Error saving mapping: ${error.message}`);
          stats.errors++;
          return;
        }
        
        // Also update crm_profile_links
        await supabase
          .from('crm_profile_links')
          .upsert({
            profile_id: profile.id,
            stable_hash_id: matchResult.customer.stable_hash_id,
            match_confidence: matchResult.confidence,
            match_method: `phone_only_${matchResult.reason}`,
            linked_at: new Date().toISOString(),
            last_verified: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'profile_id' });
        
        console.log('  ✅ Mapping saved successfully');
      } else {
        console.log('  🔍 Would update (dry run)');
      }
      
      if (existingMapping) {
        stats.updated++;
      } else {
        stats.created++;
      }
      stats.matched++;
      
    } else {
      console.log(`  ❌ No high-confidence phone match (best: ${matchResult.confidence.toFixed(3)})`);
      
      // Don't remove existing mappings - just skip
      if (existingMapping) {
        console.log(`  ℹ️  Keeping existing mapping: ${existingMapping.stable_hash_id}`);
      }
    }
    
    stats.processed++;
    
  } catch (error) {
    console.error(`  ❌ Error processing profile ${profile.id}: ${error.message}`);
    stats.errors++;
  }
}

async function main() {
  console.log('🚀 Starting Phone-Only Customer Link Fix');
  console.log(`📊 Configuration:`, CONFIG);
  console.log(`📞 Phone matching only with confidence >= ${CONFIG.confidenceThreshold}`);
  
  if (CONFIG.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
  }
  
  try {
    // Fetch all customers from backoffice
    console.log('\n📋 Fetching CRM customers...');
    const { data: customers, error: customersError } = await supabase
      .schema('backoffice')
      .from('customers')
      .select('id, customer_name, contact_number, stable_hash_id')
      .not('contact_number', 'is', null)
      .not('contact_number', 'eq', '');
    
    if (customersError) {
      throw new Error(`Failed to fetch customers: ${customersError.message}`);
    }
    
    console.log(`✅ Loaded ${customers.length} CRM customers with phone numbers`);
    
    // Fetch profiles with phone numbers
    console.log('\n👥 Fetching user profiles with phone numbers...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, phone_number')
      .not('phone_number', 'is', null)
      .not('phone_number', 'eq', '')
      .order('updated_at', { ascending: false });
    
    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }
    
    stats.totalProfiles = profiles.length;
    console.log(`✅ Loaded ${profiles.length} user profiles with phone numbers`);
    
    // Process profiles in batches
    console.log(`\n🔄 Processing profiles in batches of ${CONFIG.batchSize}...`);
    
    for (let i = 0; i < profiles.length; i += CONFIG.batchSize) {
      const batch = profiles.slice(i, i + CONFIG.batchSize);
      const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
      const totalBatches = Math.ceil(profiles.length / CONFIG.batchSize);
      
      console.log(`\n📦 Batch ${batchNum}/${totalBatches} (profiles ${i + 1}-${Math.min(i + CONFIG.batchSize, profiles.length)})`);
      
      // Process batch sequentially for better logging
      for (const profile of batch) {
        await processProfile(profile, customers);
      }
      
      // Progress update
      const progress = ((i + CONFIG.batchSize) / profiles.length * 100).toFixed(1);
      const elapsed = (Date.now() - stats.startTime) / 1000;
      const rate = stats.processed / elapsed;
      const eta = (profiles.length - stats.processed) / rate;
      
      console.log(`📊 Progress: ${progress}% | Processed: ${stats.processed} | Matched: ${stats.matched} | Rate: ${rate.toFixed(1)}/s | ETA: ${Math.round(eta)}s`);
      
      // Small delay between batches
      if (i + CONFIG.batchSize < profiles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Final statistics
    const totalTime = (Date.now() - stats.startTime) / 1000;
    const matchRate = (stats.matched / stats.processed * 100).toFixed(1);
    
    console.log('\n🎉 Phone-Only Link Fix Complete!');
    console.log('📊 Final Statistics:');
    console.log(`  Total Profiles: ${stats.totalProfiles}`);
    console.log(`  Processed: ${stats.processed}`);
    console.log(`  Matched: ${stats.matched} (${matchRate}%)`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Created: ${stats.created}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  Total Time: ${totalTime.toFixed(1)}s`);
    console.log(`  Average Rate: ${(stats.processed / totalTime).toFixed(1)} profiles/second`);
    console.log(`  Confidence Threshold: ${CONFIG.confidenceThreshold}`);
    
    if (CONFIG.dryRun) {
      console.log('\n🔍 This was a DRY RUN - no changes were made');
      console.log('   Run without --dry-run to apply changes');
    } else {
      console.log('\n✅ Future bookings will now use correct customer mappings');
      console.log('   Historical bookings were left unchanged as requested');
    }
    
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Script interrupted by user');
  console.log('📊 Partial Statistics:');
  console.log(`  Processed: ${stats.processed}/${stats.totalProfiles}`);
  console.log(`  Matched: ${stats.matched}`);
  console.log(`  Errors: ${stats.errors}`);
  process.exit(0);
});

// Run the script
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
}); 