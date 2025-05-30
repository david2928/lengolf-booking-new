#!/usr/bin/env ts-node

// Load environment variables from multiple possible locations
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Try to load environment variables from various locations
const envFiles = ['.env.local', '.env', '.env.development'];
let envLoaded = false;

for (const envFile of envFiles) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    console.log(`📁 Loading environment variables from ${envFile}`);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.log('⚠️  No environment file found. Checking process environment...');
}

/**
 * LENGOLF VIP Feature Announcement Script
 * 
 * Sends LINE messages to announce the new VIP customer portal to top users.
 * 
 * Features:
 * - Test mode for single user verification
 * - Top 10 users identification based on booking frequency
 * - Professional announcement message
 * - Error handling and retry logic
 * - List mode to preview top users without sending
 * 
 * Usage:
 * - Test mode: npm run send-vip-announcement -- --test
 * - Production mode: npm run send-vip-announcement -- --production
 * - Custom recipient: npm run send-vip-announcement -- --test --recipient=Uf4177a1781df7fd215e6d2749fd00296
 * - List top users: npm run send-vip-announcement -- --list-users
 * - Preview production: npm run send-vip-announcement -- --production --dry-run
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!supabaseUrl || !supabaseServiceKey || !lineChannelAccessToken) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('   - LINE_CHANNEL_ACCESS_TOKEN');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface TopUser {
  id: string;
  display_name: string;
  provider_id: string;
  provider: string;
  email?: string;
  booking_count: number;
  latest_booking: string;
  total_hours: number;
  profile_count: number;
}

interface AnnouncementOptions {
  testMode: boolean;
  testRecipient?: string;
  dryRun?: boolean;
  listUsers?: boolean;
}

const VIP_ANNOUNCEMENT_MESSAGE = `🎉 EXCITING NEWS FROM LENGOLF! 🎉

Hello! We're thrilled to introduce our brand new VIP Customer Portal - exclusively for valued customers like you!

✨ What's New:
🔹 Manage your profile & preferences
🔹 View complete booking history
🔹 Modify & Cancel bookings with instant confirmation
🔹 Track your lesson and practice packages

🚀 How to Access:
Simply log in at https://booking.len.golf/vip with your usual account (Google, Facebook, or LINE)

💡 This self-service portal gives you 24/7 control over your golf sessions - no more waiting for business hours to make changes!

🌟 Coming Soon: VIP Tiers with exclusive benefits and rewards for our most loyal customers! Stay tuned for exciting announcements.

We built this with YOUR convenience in mind. Try it out and let us know what you think!

⛳ Happy golfing!
- The LENGOLF Team
`;

async function getTopUsers(limit: number = 10): Promise<TopUser[]> {
  console.log(`🔍 Finding top ${limit} users based on booking activity...`);
  
  try {
    // Query to find LINE users with their stable_hash_id for deduplication
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        display_name,
        provider_id,
        provider,
        email,
        updated_at,
        vip_customer_data!left(stable_hash_id),
        crm_customer_mapping!left(stable_hash_id, is_matched),
        bookings!inner(id, duration, date, created_at)
      `)
      .eq('provider', 'line')
      .not('provider_id', 'is', null)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      console.warn('⚠️  No LINE users found in database');
      return [];
    }

    // First pass: collect all user data with their stable_hash_id
    const userDataByStableHash = new Map<string, {
      profiles: any[],
      totalBookings: any[],
      stableHashId: string
    }>();

    const userDataByProfileId = new Map<string, {
      user: any,
      bookingCount: number,
      totalHours: number,
      latestBooking: string,
      stableHashId: string | null
    }>();

    data.forEach(user => {
      const userId = user.id;
      const bookings = user.bookings || [];
      
      // Determine stable_hash_id (prefer vip_customer_data, fallback to crm_customer_mapping)
      const vipData = Array.isArray(user.vip_customer_data) ? user.vip_customer_data[0] : user.vip_customer_data;
      const mappingData = Array.isArray(user.crm_customer_mapping) ? user.crm_customer_mapping[0] : user.crm_customer_mapping;
      
      const stableHashId = vipData?.stable_hash_id || 
                          (mappingData?.is_matched ? mappingData?.stable_hash_id : null);

      // Store individual profile data
      userDataByProfileId.set(userId, {
        user,
        bookingCount: bookings.length,
        totalHours: bookings.reduce((sum: number, booking: any) => sum + (booking.duration || 0), 0),
        latestBooking: bookings.length > 0 ? 
          bookings.reduce((latest: string, booking: any) => {
            return booking.date > latest ? booking.date : latest;
          }, '1970-01-01') : '1970-01-01',
        stableHashId
      });

      // Group by stable_hash_id for deduplication
      if (stableHashId) {
        if (!userDataByStableHash.has(stableHashId)) {
          userDataByStableHash.set(stableHashId, {
            profiles: [],
            totalBookings: [],
            stableHashId
          });
        }
        const hashGroup = userDataByStableHash.get(stableHashId)!;
        hashGroup.profiles.push(user);
        hashGroup.totalBookings.push(...bookings);
      }
    });

    console.log(`📊 Found ${data.length} LINE profiles, ${userDataByStableHash.size} unique customers`);

    // Process deduplicated users by stable_hash_id
    const deduplicatedUsers: any[] = [];

    // First, add users with stable_hash_id (deduplicated)
    for (const [stableHashId, group] of userDataByStableHash.entries()) {
      const allBookings = group.totalBookings;
      const bookingCount = allBookings.length;
      
      if (bookingCount === 0) continue; // Skip users with no bookings

      // Choose the most recently updated profile as the representative
      const representativeProfile = group.profiles.sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )[0];

      const totalHours = allBookings.reduce((sum: number, booking: any) => sum + (booking.duration || 0), 0);
      const latestBooking = allBookings.length > 0 ?
        allBookings.reduce((latest: string, booking: any) => {
          return booking.date > latest ? booking.date : latest;
        }, '1970-01-01') : '1970-01-01';

      deduplicatedUsers.push({
        id: representativeProfile.id,
        display_name: representativeProfile.display_name || 'VIP Customer',
        provider_id: representativeProfile.provider_id,
        provider: representativeProfile.provider,
        email: representativeProfile.email,
        booking_count: bookingCount,
        latest_booking: latestBooking,
        total_hours: totalHours,
        stable_hash_id: stableHashId,
        profile_count: group.profiles.length // Track how many profiles this customer has
      });
    }

    // Then, add users without stable_hash_id (but filter out those with 0 bookings)
    for (const [profileId, userData] of userDataByProfileId.entries()) {
      if (!userData.stableHashId && userData.bookingCount > 0) {
        deduplicatedUsers.push({
          id: userData.user.id,
          display_name: userData.user.display_name || 'VIP Customer',
          provider_id: userData.user.provider_id,
          provider: userData.user.provider,
          email: userData.user.email,
          booking_count: userData.bookingCount,
          latest_booking: userData.latestBooking,
          total_hours: userData.totalHours,
          stable_hash_id: null,
          profile_count: 1
        });
      }
    }

    // Sort and limit
    const rankedUsers = deduplicatedUsers
      .sort((a, b) => {
        // Primary: booking count
        if (b.booking_count !== a.booking_count) {
          return b.booking_count - a.booking_count;
        }
        // Secondary: total hours
        if (b.total_hours !== a.total_hours) {
          return b.total_hours - a.total_hours;
        }
        // Tertiary: recent activity
        return b.latest_booking.localeCompare(a.latest_booking);
      })
      .slice(0, limit);

    console.log(`✅ Found ${rankedUsers.length} unique customers (deduplicated)`);
    
    // Log deduplication info
    const duplicateCustomers = rankedUsers.filter(user => user.profile_count > 1);
    if (duplicateCustomers.length > 0) {
      console.log(`🔄 Deduplicated ${duplicateCustomers.length} customers with multiple LINE accounts:`);
      duplicateCustomers.forEach(user => {
        console.log(`   • ${user.display_name}: ${user.profile_count} LINE accounts`);
      });
    }

    return rankedUsers;

  } catch (error) {
    console.error('❌ Error fetching top users:', error);
    throw error;
  }
}

async function sendLineMessage(providerId: string, message: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lineChannelAccessToken}`,
      },
      body: JSON.stringify({
        to: providerId,
        messages: [{ type: 'text', text: message }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      console.error(`❌ LINE API error for ${providerId}:`, response.status, errorData);
      return false;
    }

    console.log(`✅ Message sent successfully to ${providerId}`);
    return true;

  } catch (error) {
    console.error(`❌ Error sending message to ${providerId}:`, error);
    return false;
  }
}

async function displayTopUsers(users: TopUser[]): Promise<void> {
  console.log('🏆 TOP 10 LINE USERS BY BOOKING ACTIVITY');
  console.log('=========================================\n');

  if (users.length === 0) {
    console.log('❌ No LINE users found with booking history');
    console.log('   Make sure you have:');
    console.log('   • LINE users in your profiles table');
    console.log('   • Bookings associated with those users');
    return;
  }

  console.log(`📊 Found ${users.length} active LINE users:\n`);

  users.forEach((user, index) => {
    const rank = index + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏆';
    
    console.log(`${medal} #${rank} ${user.display_name || 'Unknown User'}`);
    console.log(`   📱 LINE ID: ${user.provider_id}`);
    console.log(`   📧 Email: ${user.email || 'Not provided'}`);
    if (user.profile_count > 1) {
      console.log(`   🔄 Multiple Accounts: ${user.profile_count} LINE profiles (deduplicated)`);
    }
    console.log(`   📅 Total Bookings: ${user.booking_count}`);
    console.log(`   ⏱️  Total Hours: ${user.total_hours}h`);
    console.log(`   🗓️  Latest Booking: ${user.latest_booking}`);
    
    // Calculate engagement level
    let engagementLevel = '';
    if (user.booking_count >= 20) engagementLevel = '🔥 Super Active';
    else if (user.booking_count >= 10) engagementLevel = '⭐ Very Active';
    else if (user.booking_count >= 5) engagementLevel = '✨ Active';
    else engagementLevel = '💙 Regular';
    
    console.log(`   🎯 Engagement: ${engagementLevel}`);
    console.log('');
  });

  // Summary statistics
  const totalBookings = users.reduce((sum, user) => sum + user.booking_count, 0);
  const totalHours = users.reduce((sum, user) => sum + user.total_hours, 0);
  const avgBookings = Math.round(totalBookings / users.length * 10) / 10;
  const avgHours = Math.round(totalHours / users.length * 10) / 10;

  console.log('📈 SUMMARY STATISTICS');
  console.log('====================');
  console.log(`📊 Total Bookings: ${totalBookings}`);
  console.log(`⏱️  Total Hours: ${totalHours}h`);
  console.log(`📊 Average Bookings per User: ${avgBookings}`);
  console.log(`⏱️  Average Hours per User: ${avgHours}h`);
  
  console.log('\n💡 These users would receive VIP announcements in production mode.');
  console.log('   Use --production --dry-run to preview the actual message.');
}

async function sendVipAnnouncements(options: AnnouncementOptions): Promise<void> {
  console.log('📢 LENGOLF VIP Feature Announcement');
  console.log('====================================\n');

  if (options.listUsers) {
    console.log('📋 LIST USERS MODE - No messages will be sent');
    console.log('');
    
    const topUsers = await getTopUsers(10);
    await displayTopUsers(topUsers);
    return;
  }

  if (options.testMode) {
    console.log('🧪 Running in TEST MODE');
    if (options.testRecipient) {
      console.log(`📱 Test recipient: ${options.testRecipient}`);
    } else {
      console.log('📱 Will use your provider ID for testing');
    }
  } else {
    console.log('🚀 Running in PRODUCTION MODE');
    console.log('📱 Will send to top 10 users');
  }

  if (options.dryRun) {
    console.log('🔍 DRY RUN - No messages will be sent');
  }

  console.log('');

  let recipients: TopUser[] = [];

  if (options.testMode && options.testRecipient) {
    // Test mode with specific recipient
    recipients = [{
      id: 'test-user',
      display_name: 'Test User',
      provider_id: options.testRecipient,
      provider: 'line',
      email: 'test@example.com',
      booking_count: 0,
      latest_booking: new Date().toISOString().split('T')[0],
      total_hours: 0,
      profile_count: 1
    }];
  } else if (options.testMode) {
    // Test mode with your provider ID
    const yourProviderId = 'Uf4177a1781df7fd215e6d2749fd00296';
    recipients = [{
      id: 'your-account',
      display_name: 'Your Account (Test)',
      provider_id: yourProviderId,
      provider: 'line',
      email: 'your@email.com',
      booking_count: 0,
      latest_booking: new Date().toISOString().split('T')[0],
      total_hours: 0,
      profile_count: 1
    }];
  } else {
    // Production mode - get top users
    recipients = await getTopUsers(10);
  }

  if (recipients.length === 0) {
    console.log('❌ No recipients found. Exiting.');
    return;
  }

  console.log('📋 Recipients:');
  console.log('==============');
  recipients.forEach((user, index) => {
    console.log(`${index + 1}. ${user.display_name}`);
    console.log(`   LINE ID: ${user.provider_id}`);
    console.log(`   Bookings: ${user.booking_count} (${user.total_hours}h total)`);
    console.log(`   Latest: ${user.latest_booking}`);
    console.log('');
  });

  if (options.dryRun) {
    console.log('🔍 DRY RUN: Would send the following message:');
    console.log('═'.repeat(50));
    console.log(VIP_ANNOUNCEMENT_MESSAGE);
    console.log('═'.repeat(50));
    console.log('\n✅ Dry run completed. No messages were sent.');
    return;
  }

  // Confirm before sending
  if (!options.testMode) {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirmed = await new Promise<boolean>((resolve) => {
      readline.question('\n❓ Send VIP announcements to these users? (type "SEND" to confirm): ', (answer: string) => {
        readline.close();
        resolve(answer.trim().toUpperCase() === 'SEND');
      });
    });

    if (!confirmed) {
      console.log('\n❌ Operation cancelled by user');
      return;
    }
  }

  console.log('\n📤 Sending announcements...');
  console.log('============================');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < recipients.length; i++) {
    const user = recipients[i];
    console.log(`\n📤 Sending to ${user.display_name} (${i + 1}/${recipients.length})`);
    
    const success = await sendLineMessage(user.provider_id, VIP_ANNOUNCEMENT_MESSAGE);
    
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }

    // Rate limiting: wait 1 second between messages
    if (i < recipients.length - 1) {
      console.log('   ⏳ Waiting 1 second...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n🎉 Announcement Summary:');
  console.log('========================');
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`📊 Total attempted: ${recipients.length}`);

  if (successCount > 0) {
    console.log('\n🎊 VIP announcements sent successfully!');
    console.log('   Users can now access the VIP portal at https://len.golf/vip');
  }

  if (errorCount > 0) {
    console.log('\n⚠️  Some messages failed to send.');
    console.log('   Check error messages above for details.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  const testMode = args.includes('--test');
  const productionMode = args.includes('--production');
  const dryRun = args.includes('--dry-run');
  const listUsers = args.includes('--list-users');
  
  // Find custom recipient
  const recipientArg = args.find(arg => arg.startsWith('--recipient='));
  const testRecipient = recipientArg ? recipientArg.split('=')[1] : undefined;

  if (!testMode && !productionMode && !listUsers) {
    console.error('❌ Please specify a mode: --test, --production, or --list-users');
    console.error('');
    console.error('Usage examples:');
    console.error('  npx ts-node scripts/send-vip-announcement.ts --test');
    console.error('  npx ts-node scripts/send-vip-announcement.ts --test --recipient=Uf4177a1781df7fd215e6d2749fd00296');
    console.error('  npx ts-node scripts/send-vip-announcement.ts --list-users');
    console.error('  npx ts-node scripts/send-vip-announcement.ts --production --dry-run');
    console.error('  npx ts-node scripts/send-vip-announcement.ts --production');
    process.exit(1);
  }

  if ([testMode, productionMode, listUsers].filter(Boolean).length > 1) {
    console.error('❌ Please specify only one mode: --test, --production, or --list-users');
    process.exit(1);
  }

  const options: AnnouncementOptions = {
    testMode,
    testRecipient,
    dryRun,
    listUsers
  };

  try {
    await sendVipAnnouncements(options);
  } catch (error) {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  }
}

// Execute the script
if (require.main === module) {
  main();
}

module.exports = { sendVipAnnouncements }; 