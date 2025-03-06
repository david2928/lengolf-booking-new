const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Set up paths to env files
const dotenvPath = path.resolve(process.cwd(), '../.env.local');
const fallbackPath = path.resolve(process.cwd(), '../.env');

console.log('Current directory:', process.cwd());
console.log('.env.local exists:', fs.existsSync(dotenvPath));
console.log('.env exists:', fs.existsSync(fallbackPath));

// Try to load from .env.local first
if (fs.existsSync(dotenvPath)) {
  console.log(`Loading environment from ${dotenvPath}`);
  dotenv.config({ path: dotenvPath });
} else if (fs.existsSync(fallbackPath)) {
  console.log(`Loading environment from ${fallbackPath}`);
  dotenv.config({ path: fallbackPath });
} else {
  console.log('No .env.local or .env file found');
}

// List all environment variables (safely)
console.log('\nEnvironment Variables:');
const envVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRM_API_URL',
  'CRM_API_KEY'
];

envVars.forEach(varName => {
  const value = process.env[varName];
  console.log(`${varName}: ${value ? value.substring(0, 5) + '...' : 'Missing'}`);
});

// Try creating a Supabase client
try {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.error('Missing Supabase URL or key');
    process.exit(1);
  }
  
  console.log('\nTrying to create Supabase client...');
  const supabase = createClient(url, key);
  console.log('Supabase client created successfully');
  
  // Test a simple query
  console.log('\nTesting a simple query...');
  supabase
    .from('profiles')
    .select('count')
    .limit(1)
    .then(({ data, error }) => {
      if (error) {
        console.error('Query error:', error);
      } else {
        console.log('Query successful:', data);
      }
    })
    .catch(err => {
      console.error('Error during query:', err);
    });
} catch (error) {
  console.error('Error creating Supabase client:', error);
} 