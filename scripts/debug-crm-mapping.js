#!/usr/bin/env node

/**
 * Debug CRM mapping issues
 * Usage: node scripts/debug-crm-mapping.js [profile_id]
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase configuration');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function debugCrmMapping(profileId) {
  console.log(`🔍 Debugging CRM mapping for profile: ${profileId}\n`);

  try {
    // 1. Check profiles_vip_staging
    console.log('1️⃣ Checking profiles_vip_staging...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles_vip_staging')
      .select('id, display_name, email, phone_number, vip_customer_data_id')
      .eq('id', profileId)
      .single();

    if (profileError) {
      console.error('❌ Profile not found:', profileError.message);
      return;
    }

    console.log('✅ Profile found:', profile);

    // 2. Check vip_customer_data if linked
    if (profile.vip_customer_data_id) {
      console.log('\n2️⃣ Checking vip_customer_data...');
      const { data: vipData, error: vipError } = await supabase
        .from('vip_customer_data')
        .select('*')
        .eq('id', profile.vip_customer_data_id)
        .single();

      if (vipError) {
        console.error('❌ VIP customer data error:', vipError.message);
      } else {
        console.log('✅ VIP customer data:', vipData);
      }
    } else {
      console.log('\n2️⃣ No vip_customer_data linked');
    }

    // 3. Check crm_customer_mapping_vip_staging
    console.log('\n3️⃣ Checking crm_customer_mapping_vip_staging...');
    const { data: mappings, error: mappingError } = await supabase
      .from('crm_customer_mapping_vip_staging')
      .select('*')
      .eq('profile_id', profileId)
      .order('updated_at', { ascending: false });

    if (mappingError) {
      console.error('❌ Mapping error:', mappingError.message);
    } else if (mappings.length === 0) {
      console.log('⚠️ No CRM mappings found');
    } else {
      console.log(`✅ Found ${mappings.length} CRM mapping(s):`);
      mappings.forEach((mapping, index) => {
        console.log(`  ${index + 1}. ID: ${mapping.id}`);
        console.log(`     CRM Customer ID: ${mapping.crm_customer_id}`);
        console.log(`     Stable Hash ID: ${mapping.stable_hash_id}`);
        console.log(`     Is Matched: ${mapping.is_matched}`);
        console.log(`     Match Method: ${mapping.match_method}`);
        console.log(`     Match Confidence: ${mapping.match_confidence}`);
        console.log(`     Created: ${mapping.created_at}`);
        console.log(`     Updated: ${mapping.updated_at}`);
        console.log('');
      });
    }

    // 4. Check recent bookings
    console.log('4️⃣ Checking recent bookings...');
    const { data: bookings, error: bookingError } = await supabase
      .from('bookings_vip_staging')
      .select('id, name, date, start_time, stable_hash_id, created_at')
      .eq('user_id', profileId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (bookingError) {
      console.error('❌ Booking error:', bookingError.message);
    } else if (bookings.length === 0) {
      console.log('⚠️ No bookings found');
    } else {
      console.log(`✅ Found ${bookings.length} recent booking(s):`);
      bookings.forEach((booking, index) => {
        console.log(`  ${index + 1}. ID: ${booking.id}`);
        console.log(`     Date: ${booking.date} ${booking.start_time}`);
        console.log(`     Name: ${booking.name}`);
        console.log(`     Stable Hash ID: ${booking.stable_hash_id}`);
        console.log(`     Created: ${booking.created_at}`);
        console.log('');
      });
    }

    // 5. Check if stable_hash_id exists in customers table
    const stableHashIds = new Set();
    if (profile.vip_customer_data_id) {
      const { data: vipData } = await supabase
        .from('vip_customer_data')
        .select('stable_hash_id')
        .eq('id', profile.vip_customer_data_id)
        .single();
      if (vipData?.stable_hash_id) stableHashIds.add(vipData.stable_hash_id);
    }
    
    mappings?.forEach(m => {
      if (m.stable_hash_id) stableHashIds.add(m.stable_hash_id);
    });

    bookings?.forEach(b => {
      if (b.stable_hash_id) stableHashIds.add(b.stable_hash_id);
    });

    if (stableHashIds.size > 0) {
      console.log('5️⃣ Checking customers table for stable_hash_ids...');
      for (const hashId of stableHashIds) {
        const { data: customer, error: customerError } = await supabase
          .from('customers')
          .select('id, customer_name, contact_number, email, stable_hash_id')
          .eq('stable_hash_id', hashId)
          .single();

        if (customerError) {
          console.log(`❌ No customer found for stable_hash_id: ${hashId}`);
        } else {
          console.log(`✅ Customer found for ${hashId}:`, customer);
        }
      }
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

// Main execution
const profileId = process.argv[2];

if (!profileId) {
  console.error('❌ Usage: node scripts/debug-crm-mapping.js <profile_id>');
  process.exit(1);
}

debugCrmMapping(profileId)
  .then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Debug failed:', error);
    process.exit(1);
  }); 