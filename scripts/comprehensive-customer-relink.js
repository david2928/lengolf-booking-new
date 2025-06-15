#!/usr/bin/env node

/**
 * Comprehensive Customer Re-linking Script
 * 
 * This script re-runs the customer matching logic for all users to fix
 * stable_hash_id inconsistencies between the mapping tables and the 
 * source of truth in backoffice.customers.
 * 
 * Usage: node scripts/comprehensive-customer-relink.js [options]
 * 
 * Options:
 *   --dry-run: Show what would be changed without making changes
 *   --batch-size=N: Process N profiles at a time (default: 50)
 *   --start-from=ID: Start processing from a specific profile ID
 *   --force: Clear existing mappings and rebuild from scratch
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  batchSize: parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 50,
  dryRun: process.argv.includes('--dry-run'),
  force: process.argv.includes('--force'),
  startFrom: process.argv.find(arg => arg.startsWith('--start-from='))?.split('=')[1] || null,
  confidenceThreshold: 0.6, // Same as the main matching logic
  timeoutMs: 10000 // 10 second timeout per profile
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
  unmatched: 0,
  errors: 0,
  skipped: 0,
  updated: 0,
  created: 0,
  startTime: Date.now()
};

// Utility functions (copied from customer-matching.ts)
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  return phone.replace(/[\s\-\(\)\+]/g, '').replace(/^66/, '').replace(/^0/, '');
}

function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/[^\w\s]/g, '');
}

function extractNameParts(fullName) {
  if (!fullName) return { first: '', last: '' };
  const parts = fullName.trim().split(/\s+/);
  return {
    first: parts[0] || '',
    last: parts.slice(1).join(' ') || ''
  };
}

function phoneNumberSimilarity(phone1, phone2) {
  if (!phone1 || !phone2) return 0;
  if (phone1 === phone2) return 1;
  
  const maxLength = Math.max(phone1.length, phone2.length);
  if (maxLength === 0) return 1;
  
  let matches = 0;
  const minLength = Math.min(phone1.length, phone2.length);
  
  for (let i = 0; i < minLength; i++) {
    if (phone1[i] === phone2[i]) matches++;
  }
  
  return matches / maxLength;
}

function calculateMatchConfidence(profile, customer) {
  let score = 0;
  const reasons = [];
  
  // Extract name parts
  const profileNameParts = extractNameParts(profile.display_name || profile.name);
  const customerNameParts = extractNameParts(customer.name);
  
  // Normalize data
  const normalizedProfilePhone = normalizePhoneNumber(profile.phone_number);
  const normalizedProfileFirstName = normalizeText(profileNameParts.first);
  const normalizedProfileLastName = normalizeText(profileNameParts.last);
  const normalizedProfileEmail = normalizeText(profile.email);
  
  const normalizedCustomerPhone = normalizePhoneNumber(customer.phone_number);
  const normalizedCustomerFirstName = normalizeText(customerNameParts.first);
  const normalizedCustomerLastName = normalizeText(customerNameParts.last);
  const normalizedCustomerEmail = normalizeText(customer.email);
  
  // Phone number matching
  if (normalizedProfilePhone && normalizedCustomerPhone) {
    const phoneSimilarity = phoneNumberSimilarity(normalizedProfilePhone, normalizedCustomerPhone);
    
    if (phoneSimilarity === 1) {
      score += 0.7;
      reasons.push('exact_phone_match');
    } else if (phoneSimilarity >= 0.9) {
      score += 0.6;
      reasons.push('very_similar_phone_match');
    } else if (phoneSimilarity >= 0.8) {
      score += 0.5;
      reasons.push('similar_phone_match');
    } else if (phoneSimilarity >= 0.7) {
      score += 0.3;
      reasons.push('partial_phone_match');
    } else if (normalizedProfilePhone.includes(normalizedCustomerPhone) || 
              normalizedCustomerPhone.includes(normalizedProfilePhone)) {
      score += 0.2;
      reasons.push('substring_phone_match');
    }
  }
  
  // Name matching
  if (normalizedProfileFirstName && normalizedCustomerFirstName) {
    if (normalizedProfileFirstName === normalizedCustomerFirstName) {
      score += 0.5;
      reasons.push('exact_first_name_match');
    } else if (normalizedProfileFirstName.includes(normalizedCustomerFirstName) || 
              normalizedCustomerFirstName.includes(normalizedProfileFirstName)) {
      score += 0.2;
      reasons.push('partial_first_name_match');
    }
  }
  
  if (normalizedProfileLastName && normalizedCustomerLastName) {
    if (normalizedProfileLastName === normalizedCustomerLastName) {
      score += 0.5;
      reasons.push('exact_last_name_match');
    } else if (normalizedProfileLastName.includes(normalizedCustomerLastName) || 
              normalizedCustomerLastName.includes(normalizedProfileLastName)) {
      score += 0.2;
      reasons.push('partial_last_name_match');
    }
  }
  
  // Email matching
  if (normalizedProfileEmail && normalizedCustomerEmail && 
      normalizedProfileEmail === normalizedCustomerEmail) {
    score += 0.5;
    reasons.push('exact_email_match');
  }
  
  return { confidence: Math.min(score, 1.0), reasons };
}

async function matchProfileWithCustomers(profile, customers) {
  let bestMatch = null;
  let bestConfidence = 0;
  let bestReasons = [];
  
  for (const customer of customers) {
    const { confidence, reasons } = calculateMatchConfidence(profile, {
      id: customer.id,
      name: customer.customer_name || '',
      email: customer.email || '',
      phone_number: customer.contact_number || '',
      stable_hash_id: customer.stable_hash_id || ''
    });
    
    if (confidence > bestConfidence) {
      bestMatch = customer;
      bestConfidence = confidence;
      bestReasons = reasons;
    }
  }
  
  // Apply confidence boosting for borderline matches with phone matches
  if (bestMatch && bestConfidence >= CONFIG.confidenceThreshold - 0.1 && 
      (bestReasons.includes('exact_phone_match') || bestReasons.includes('very_similar_phone_match'))) {
    const originalConfidence = bestConfidence;
    bestConfidence = CONFIG.confidenceThreshold;
    bestReasons.push('boosted_phone_match');
    console.log(`  Boosted confidence from ${originalConfidence.toFixed(2)} to ${bestConfidence.toFixed(2)}`);
  }
  
  return {
    matched: bestConfidence >= CONFIG.confidenceThreshold,
    confidence: bestConfidence,
    customer: bestMatch,
    reasons: bestReasons
  };
}

async function processProfile(profile, customers) {
  try {
    console.log(`\nProcessing profile: ${profile.display_name} (${profile.id})`);
    console.log(`  Phone: ${profile.phone_number}, Email: ${profile.email}`);
    
    // Skip profiles with insufficient data
    if (!profile.phone_number && !profile.email && !profile.display_name) {
      console.log('  ⏭️  Skipping - insufficient data for matching');
      stats.skipped++;
      return;
    }
    
    // Check for existing mapping
    const { data: existingMapping } = await supabase
      .from('crm_customer_mapping')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle();
    
    // Perform matching
    const matchResult = await matchProfileWithCustomers(profile, customers);
    
    if (matchResult.matched) {
      console.log(`  ✅ Match found: ${matchResult.customer.customer_name} (confidence: ${matchResult.confidence.toFixed(2)})`);
      console.log(`  📞 Customer phone: ${matchResult.customer.contact_number}`);
      console.log(`  🔗 Stable hash: ${matchResult.customer.stable_hash_id}`);
      console.log(`  📋 Reasons: ${matchResult.reasons.join(', ')}`);
      
      const mappingData = {
        profile_id: profile.id,
        crm_customer_id: matchResult.customer.id,
        stable_hash_id: matchResult.customer.stable_hash_id,
        is_matched: true,
        match_method: `relink_script_${matchResult.reasons[0] || 'unknown'}`,
        match_confidence: matchResult.confidence,
        crm_customer_data: matchResult.customer,
        updated_at: new Date().toISOString()
      };
      
      if (!CONFIG.dryRun) {
        const { error } = await supabase
          .from('crm_customer_mapping')
          .upsert(mappingData, { onConflict: 'profile_id' });
        
        if (error) {
          console.error(`  ❌ Error saving mapping: ${error.message}`);
          stats.errors++;
          return;
        }
        
        // Also update crm_profile_links if it exists
        await supabase
          .from('crm_profile_links')
          .upsert({
            profile_id: profile.id,
            stable_hash_id: matchResult.customer.stable_hash_id,
            match_confidence: matchResult.confidence,
            match_method: `relink_script_${matchResult.reasons[0] || 'unknown'}`,
            linked_at: new Date().toISOString(),
            last_verified: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'profile_id' });
      }
      
      if (existingMapping) {
        if (existingMapping.stable_hash_id !== matchResult.customer.stable_hash_id) {
          console.log(`  🔄 Updated mapping (was: ${existingMapping.stable_hash_id})`);
          stats.updated++;
        } else {
          console.log(`  ✓ Confirmed existing mapping`);
        }
      } else {
        console.log(`  ➕ Created new mapping`);
        stats.created++;
      }
      
      stats.matched++;
    } else {
      console.log(`  ❌ No match found (best confidence: ${matchResult.confidence.toFixed(2)})`);
      
      // If there was an existing mapping but no good match found, we might want to remove it
      if (existingMapping && CONFIG.force) {
        console.log(`  🗑️  Removing existing low-confidence mapping`);
        if (!CONFIG.dryRun) {
          await supabase
            .from('crm_customer_mapping')
            .delete()
            .eq('profile_id', profile.id);
        }
      }
      
      stats.unmatched++;
    }
    
    stats.processed++;
    
  } catch (error) {
    console.error(`  ❌ Error processing profile ${profile.id}: ${error.message}`);
    stats.errors++;
  }
}

async function main() {
  console.log('🚀 Starting Comprehensive Customer Re-linking Script');
  console.log(`📊 Configuration:`, CONFIG);
  
  if (CONFIG.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
  }
  
  try {
    // Create backup if not dry run and force mode
    if (!CONFIG.dryRun && CONFIG.force) {
      console.log('\n📦 Creating backup of existing mappings...');
      const backupTableName = `crm_customer_mapping_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
      
      const { error: backupError } = await supabase.rpc('create_table_backup', {
        source_table: 'crm_customer_mapping',
        backup_table: backupTableName
      });
      
      if (backupError) {
        console.log('⚠️  Could not create automatic backup, proceeding anyway...');
      } else {
        console.log(`✅ Backup created: ${backupTableName}`);
      }
    }
    
    // Fetch all customers from backoffice
    console.log('\n📋 Fetching CRM customers...');
    const { data: customers, error: customersError } = await supabase
      .schema('backoffice')
      .from('customers')
      .select('id, customer_name, email, contact_number, stable_hash_id');
    
    if (customersError) {
      throw new Error(`Failed to fetch customers: ${customersError.message}`);
    }
    
    console.log(`✅ Loaded ${customers.length} CRM customers`);
    
    // Fetch all profiles
    console.log('\n👥 Fetching user profiles...');
    let profilesQuery = supabase
      .from('profiles')
      .select('id, display_name, phone_number, email')
      .order('updated_at', { ascending: false });
    
    if (CONFIG.startFrom) {
      profilesQuery = profilesQuery.gte('id', CONFIG.startFrom);
    }
    
    const { data: profiles, error: profilesError } = await profilesQuery;
    
    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }
    
    stats.totalProfiles = profiles.length;
    console.log(`✅ Loaded ${profiles.length} user profiles`);
    
    // Process profiles in batches
    console.log(`\n🔄 Processing profiles in batches of ${CONFIG.batchSize}...`);
    
    for (let i = 0; i < profiles.length; i += CONFIG.batchSize) {
      const batch = profiles.slice(i, i + CONFIG.batchSize);
      const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
      const totalBatches = Math.ceil(profiles.length / CONFIG.batchSize);
      
      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (profiles ${i + 1}-${Math.min(i + CONFIG.batchSize, profiles.length)})`);
      
      // Process batch with timeout
      const batchPromises = batch.map(profile => 
        Promise.race([
          processProfile(profile, customers),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile processing timeout')), CONFIG.timeoutMs)
          )
        ]).catch(error => {
          console.error(`  ⏰ Timeout or error for profile ${profile.id}: ${error.message}`);
          stats.errors++;
        })
      );
      
      await Promise.all(batchPromises);
      
      // Progress update
      const progress = ((i + CONFIG.batchSize) / profiles.length * 100).toFixed(1);
      const elapsed = (Date.now() - stats.startTime) / 1000;
      const rate = stats.processed / elapsed;
      const eta = (profiles.length - stats.processed) / rate;
      
      console.log(`📊 Progress: ${progress}% | Processed: ${stats.processed} | Matched: ${stats.matched} | Rate: ${rate.toFixed(1)}/s | ETA: ${Math.round(eta)}s`);
      
      // Small delay between batches to avoid overwhelming the database
      if (i + CONFIG.batchSize < profiles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Final statistics
    const totalTime = (Date.now() - stats.startTime) / 1000;
    
    console.log('\n🎉 Re-linking Complete!');
    console.log('📊 Final Statistics:');
    console.log(`  Total Profiles: ${stats.totalProfiles}`);
    console.log(`  Processed: ${stats.processed}`);
    console.log(`  Matched: ${stats.matched} (${(stats.matched / stats.processed * 100).toFixed(1)}%)`);
    console.log(`  Unmatched: ${stats.unmatched}`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Created: ${stats.created}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  Total Time: ${totalTime.toFixed(1)}s`);
    console.log(`  Average Rate: ${(stats.processed / totalTime).toFixed(1)} profiles/second`);
    
    if (CONFIG.dryRun) {
      console.log('\n🔍 This was a DRY RUN - no changes were made');
      console.log('   Run without --dry-run to apply changes');
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