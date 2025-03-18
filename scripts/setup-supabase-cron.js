#!/usr/bin/env node

/**
 * Script to set up Supabase Cron settings
 * 
 * This script helps configure the required database settings for the 
 * review request scheduler using Supabase Cron.
 * 
 * Usage:
 *   SUPABASE_URL=https://bisimqmtxjsptehhqpeg.supabase.co SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpc2ltcW10eGpzcHRlaGhxcGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgzOTY5MzEsImV4cCI6MjA1Mzk3MjkzMX0.NZ_mEOOoaKEG1p9LBXkULWwSIr-rWmCbksVZq3OzSYE API_KEY=15e6434f4d5cda3725f9935dd3ad44eaf2a4e803f603c9d50eff9cd7e64bcfe4 WEBHOOK_URL=https://41fb-2405-9800-b870-9483-5481-cfba-8c6e-7e71.ngrok-free.app/api/notifications/process-review-requests node scripts/setup-supabase-cron.js
 */

const { createClient } = require('@supabase/supabase-js');

// Check for required environment variables
const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'API_KEY', 'WEBHOOK_URL'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Error: Missing required environment variables: ' + missingVars.join(', '));
  console.error('\nUsage:');
  console.error('  SUPABASE_URL=your-supabase-url SUPABASE_SERVICE_KEY=your-service-key API_KEY=your-api-key WEBHOOK_URL=your-webhook-url node scripts/setup-supabase-cron.js');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

async function setupCronSettings() {
  console.log('Setting up Supabase Cron settings...');
  
  try {
    // 1. Set the API key using Postgres settings
    const { data: apiKeyResult, error: apiKeyError } = await supabase.rpc(
      'set_pg_setting',
      { 
        setting_name: 'app.cron_api_key', 
        setting_value: process.env.API_KEY 
      }
    );
    
    if (apiKeyError) {
      throw new Error(`Failed to set API key: ${apiKeyError.message}`);
    }
    
    console.log('✅ API key set successfully');
    
    // 2. Set the webhook URL using Postgres settings
    const { data: webhookResult, error: webhookError } = await supabase.rpc(
      'set_pg_setting',
      { 
        setting_name: 'app.review_request_webhook_url', 
        setting_value: process.env.WEBHOOK_URL 
      }
    );
    
    if (webhookError) {
      throw new Error(`Failed to set webhook URL: ${webhookError.message}`);
    }
    
    console.log('✅ Webhook URL set successfully');
    
    // 3. Verify the cron extension exists
    const { data: extensionData, error: extensionError } = await supabase.from('pg_extension')
      .select('*')
      .eq('extname', 'pg_cron')
      .maybeSingle();
    
    if (extensionError) {
      console.warn('Warning: Could not verify pg_cron extension:', extensionError.message);
    } else {
      if (extensionData) {
        console.log('✅ pg_cron extension is installed');
      } else {
        console.warn('⚠️ pg_cron extension may not be installed. Run the migration first.');
      }
    }
    
    // 4. Check for existing cron job
    const { data: jobData, error: jobError } = await supabase
      .rpc('check_cron_job', { job_name: 'check-review-requests' });
    
    if (jobError) {
      console.warn('Warning: Could not check cron job:', jobError.message);
    } else {
      if (jobData && jobData.exists) {
        console.log('✅ Cron job is scheduled');
      } else {
        console.warn('⚠️ Cron job may not be scheduled. Run the migration to create it.');
      }
    }
    
    console.log('\nSetup complete!');
    console.log('\nIMPORTANT: Make sure you have run the migration scripts to create the pg_cron extension and scheduled job.');
    
  } catch (error) {
    console.error('Error setting up Supabase Cron:', error);
    process.exit(1);
  }
}

// Create the stored procedures if they don't exist
async function createHelperFunctions() {
  try {
    // Create function to set PostgreSQL settings
    const setSettingSQL = `
      create or replace function set_pg_setting(setting_name text, setting_value text)
      returns boolean
      language plpgsql
      security definer
      as $$
      begin
        execute format('alter database %I set %s = %L', current_database(), setting_name, setting_value);
        return true;
      exception
        when others then
          raise exception 'Failed to set setting %: %', setting_name, sqlerrm;
      end;
      $$;
    `;
    
    // Create function to check if a cron job exists
    const checkJobSQL = `
      create or replace function check_cron_job(job_name text)
      returns json
      language plpgsql
      security definer
      as $$
      declare
        job_exists boolean;
      begin
        select exists(select 1 from cron.job where jobname = job_name) into job_exists;
        return json_build_object('exists', job_exists);
      exception
        when others then
          raise exception 'Failed to check job %: %', job_name, sqlerrm;
      end;
      $$;
    `;
    
    // Execute SQL statements
    const { error: setSettingError } = await supabase.rpc('exec_sql', { sql: setSettingSQL });
    if (setSettingError) {
      throw new Error(`Failed to create set_pg_setting function: ${setSettingError.message}`);
    }
    
    const { error: checkJobError } = await supabase.rpc('exec_sql', { sql: checkJobSQL });
    if (checkJobError) {
      throw new Error(`Failed to create check_cron_job function: ${checkJobError.message}`);
    }
    
    console.log('✅ Helper functions created');
    
  } catch (error) {
    console.error('Error creating helper functions:', error);
    console.error('You may need to create these functions manually in the SQL editor.');
  }
}

// Create exec_sql function if it doesn't exist
async function createExecSqlFunction() {
  try {
    const { data, error } = await supabase.query(`
      create or replace function exec_sql(sql text)
      returns void
      language plpgsql
      security definer
      as $$
      begin
        execute sql;
      exception
        when others then
          raise exception 'SQL execution failed: %', sqlerrm;
      end;
      $$;
    `);
    
    if (error) {
      console.error('Error creating exec_sql function:', error.message);
      console.log('Continuing with setup...');
    } else {
      console.log('✅ exec_sql function created');
    }
  } catch (error) {
    console.error('Error creating exec_sql function:', error);
    console.log('Continuing with setup...');
  }
}

// Run the setup
async function run() {
  try {
    await createExecSqlFunction();
    await createHelperFunctions();
    await setupCronSettings();
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

run(); 