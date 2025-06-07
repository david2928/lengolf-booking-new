import { createServerClient } from './server';
import type { Database } from '@/types/supabase';

/**
 * @deprecated CRM data has been migrated to the main Supabase instance under the 'backoffice' schema.
 * Use createServerClient() instead and query backoffice.* tables.
 * 
 * This function now redirects to the main Supabase client to maintain compatibility
 * during the migration period. Update your code to:
 * 1. Import createServerClient instead of createCrmClient
 * 2. Use backoffice.customers instead of customers
 * 3. Use backoffice.crm_packages instead of crm_packages
 */
export function createCrmClient(): ReturnType<typeof createServerClient> {
  console.warn(
    '⚠️  createCrmClient() is deprecated. CRM data has been migrated to the main Supabase instance.\n' +
    '   Please update your code to:\n' +
    '   1. Use createServerClient() instead of createCrmClient()\n' +
    '   2. Query backoffice.customers instead of customers\n' +
    '   3. Query backoffice.crm_packages instead of crm_packages'
  );
  
  return createServerClient();
}
