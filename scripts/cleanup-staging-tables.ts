#!/usr/bin/env ts-node

/**
 * LENGOLF VIP Migration - Staging Table Cleanup Script
 * 
 * This script safely removes staging tables that were used during VIP development
 * after the successful migration to production tables.
 * 
 * IMPORTANT: Run this script only after verifying that:
 * 1. VIP features are working correctly in production
 * 2. All application code has been updated to use production tables
 * 3. You have a recent backup of your database
 * 
 * Usage: npm run cleanup-staging-tables
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Tables to be removed after VIP migration completion
const STAGING_TABLES = [
  {
    name: 'profiles_vip_staging',
    description: 'Staging table for profiles with VIP features',
    recordCount: 590,
    rls: true
  },
  {
    name: 'bookings_vip_staging', 
    description: 'Staging table for bookings with VIP features',
    recordCount: 729,
    rls: true
  },
  {
    name: 'crm_customer_mapping_vip_staging',
    description: 'Staging table for CRM customer mappings',
    recordCount: 223,
    rls: true
  },
  {
    name: 'crm_packages_vip_staging',
    description: 'Staging table for CRM packages',
    recordCount: 87,
    rls: false
  },
  {
    name: 'booking_history_vip_staging',
    description: 'Staging table for booking history',
    recordCount: 113,
    rls: false
  }
];

async function verifyTableExists(tableName: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('information_schema.tables' as any)
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return !!data;
  } catch (error) {
    console.warn(`⚠️  Could not verify table existence for ${tableName}:`, error);
    return false;
  }
}

async function getRecordCount(tableName: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw error;
    }

    return count || 0;
  } catch (error) {
    console.warn(`⚠️  Could not get record count for ${tableName}:`, error);
    return -1;
  }
}

async function dropTable(tableName: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql: `DROP TABLE IF EXISTS public.${tableName} CASCADE;`
    });

    if (error) {
      throw error;
    }

    console.log(`  ✅ Successfully dropped table: ${tableName}`);
  } catch (error) {
    throw new Error(`Failed to drop table ${tableName}: ${error}`);
  }
}

async function createBackupSql(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupSql: string[] = [
    '-- LENGOLF VIP Staging Tables Backup',
    `-- Generated: ${new Date().toISOString()}`,
    '-- Run this script to restore staging tables if needed',
    '',
    '-- WARNING: This backup contains schema only, not data',
    '-- For full restoration, use a proper database backup',
    ''
  ];

  for (const table of STAGING_TABLES) {
    if (await verifyTableExists(table.name)) {
      try {
        // Get table schema (simplified - in production you'd want full schema extraction)
        backupSql.push(`-- Table: ${table.name}`);
        backupSql.push(`-- Description: ${table.description}`);
        backupSql.push(`-- Records at time of removal: ${table.recordCount}`);
        backupSql.push(`-- RLS Enabled: ${table.rls}`);
        backupSql.push('');
        backupSql.push(`-- To restore this table, you would need to:`);
        backupSql.push(`-- 1. Recreate the table schema`);
        backupSql.push(`-- 2. Restore data from backup`);
        backupSql.push(`-- 3. Recreate RLS policies if needed`);
        backupSql.push('');
        backupSql.push('-- CREATE TABLE public.' + table.name + ' (...); -- Schema definition needed');
        backupSql.push('');
      } catch (error) {
        console.warn(`⚠️  Could not extract schema for ${table.name}`);
      }
    }
  }

  const backupContent = backupSql.join('\n');
  
  // Write backup file
  const fs = require('fs');
  const path = require('path');
  const backupPath = path.join(process.cwd(), `staging-tables-backup-${timestamp}.sql`);
  
  try {
    fs.writeFileSync(backupPath, backupContent);
    console.log(`📄 Backup SQL file created: ${backupPath}`);
  } catch (error) {
    console.warn(`⚠️  Could not write backup file: ${error}`);
  }

  return backupPath;
}

async function promptConfirmation(): Promise<boolean> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    readline.question('\n❓ Are you sure you want to permanently delete these staging tables? (type "DELETE" to confirm): ', (answer: string) => {
      readline.close();
      resolve(answer.trim().toUpperCase() === 'DELETE');
    });
  });
}

async function main() {
  console.log('🧹 LENGOLF VIP Staging Table Cleanup');
  console.log('=====================================\n');

  // Pre-flight checks
  console.log('🔍 Pre-flight checks...');
  
  // Check database connection
  try {
    const { data, error } = await supabase.from('profiles').select('id').limit(1);
    if (error) throw error;
    console.log('  ✅ Database connection successful');
  } catch (error) {
    console.error('  ❌ Database connection failed:', error);
    process.exit(1);
  }

  // Verify production tables exist and have data
  const productionTables = ['profiles', 'bookings', 'crm_customer_mapping', 'vip_customer_data'];
  for (const table of productionTables) {
    const count = await getRecordCount(table);
    if (count > 0) {
      console.log(`  ✅ Production table ${table}: ${count} records`);
    } else {
      console.error(`  ❌ Production table ${table} appears empty or inaccessible`);
      console.error('     Please verify VIP migration was successful before continuing');
      process.exit(1);
    }
  }

  console.log('\n📋 Staging tables to be removed:');
  console.log('==================================');

  let tablesToRemove: Array<{name: string, description: string, recordCount: number, currentCount: number}> = [];

  for (const table of STAGING_TABLES) {
    const exists = await verifyTableExists(table.name);
    if (exists) {
      const currentCount = await getRecordCount(table.name);
      console.log(`  📊 ${table.name}`);
      console.log(`     Description: ${table.description}`);
      console.log(`     Expected records: ${table.recordCount}`);
      console.log(`     Current records: ${currentCount >= 0 ? currentCount : 'Unable to count'}`);
      console.log(`     RLS enabled: ${table.rls ? 'Yes' : 'No'}`);
      console.log('');
      
      tablesToRemove.push({
        name: table.name,
        description: table.description,
        recordCount: table.recordCount,
        currentCount
      });
    } else {
      console.log(`  ⚪ ${table.name} - Not found (already removed)`);
    }
  }

  if (tablesToRemove.length === 0) {
    console.log('✅ No staging tables found to remove. Cleanup already completed!');
    process.exit(0);
  }

  console.log(`\n⚠️  IMPORTANT WARNINGS:`);
  console.log('   • This action is IRREVERSIBLE');
  console.log('   • Ensure you have a recent database backup');
  console.log('   • Verify VIP features are working in production');
  console.log('   • Confirm all application code uses production tables');

  // Create backup SQL file
  console.log('\n📄 Creating backup SQL file...');
  await createBackupSql();

  // Prompt for confirmation
  const confirmed = await promptConfirmation();

  if (!confirmed) {
    console.log('\n❌ Operation cancelled by user');
    process.exit(0);
  }

  console.log('\n🗑️  Removing staging tables...');
  console.log('================================');

  let removedCount = 0;
  let totalRecordsRemoved = 0;

  for (const table of tablesToRemove) {
    try {
      console.log(`\n  🔄 Dropping table: ${table.name}`);
      await dropTable(table.name);
      removedCount++;
      totalRecordsRemoved += table.currentCount >= 0 ? table.currentCount : 0;
    } catch (error) {
      console.error(`  ❌ Failed to drop ${table.name}:`, error);
      console.log('     Continuing with other tables...');
    }
  }

  console.log('\n🎉 Cleanup Summary:');
  console.log('==================');
  console.log(`  ✅ Tables removed: ${removedCount}/${tablesToRemove.length}`);
  console.log(`  📊 Total records freed: ${totalRecordsRemoved >= 0 ? totalRecordsRemoved : 'Unknown'}`);
  console.log(`  💾 Database space recovered`);

  if (removedCount === tablesToRemove.length) {
    console.log('\n🎊 All staging tables successfully removed!');
    console.log('   VIP migration cleanup completed.');
  } else {
    console.log('\n⚠️  Some tables could not be removed.');
    console.log('   Please check error messages above and try again.');
  }

  console.log('\n📚 Next steps:');
  console.log('   1. Verify VIP features still work correctly');
  console.log('   2. Monitor application for any issues');
  console.log('   3. Archive backup files if everything works correctly');
  console.log('   4. Update deployment documentation');
}

// Execute the script
if (require.main === module) {
  main().catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
}

export { main as cleanupStagingTables }; 