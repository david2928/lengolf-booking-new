import { createAdminClient } from '@/utils/supabase/admin';

export interface CrmPackage {
  id: string;
  crm_package_id: string;
  first_use_date?: string;
  expiration_date: string;
  remaining_hours?: number;
  package_type_name: string;
  customer_name: string;
  stable_hash_id: string;
}

/**
 * @deprecated This function is deprecated as part of the migration away from legacy CRM systems.
 * Use customer-service.ts functions instead which work with the new public.customers table.
 */
export async function getPackagesForProfile(...args: any[]): Promise<CrmPackage[]> {
  console.warn('⚠️ getPackagesForProfile() is deprecated. Use customer-service.ts instead.');
  throw new Error('This function has been removed. Use customer-service.ts getPackageInfoForCustomer() instead.');
}

/**
 * @deprecated This function is deprecated as part of the migration away from legacy CRM systems.
 * Use customer-service.ts functions instead which work with the new public.customers table.
 */
export async function syncPackagesForProfile(...args: any[]): Promise<void> {
  console.warn('⚠️ syncPackagesForProfile() is deprecated. Use customer-service.ts instead.');
  throw new Error('This function has been removed. Use customer-service.ts instead.');
}

/**
 * @deprecated This function is deprecated as part of the migration away from legacy CRM systems.
 * Use customer-service.ts functions instead which work with the new public.customers table.
 */
export async function bulkSyncPackagesForAllProfiles(...args: any[]): Promise<any> {
  console.warn('⚠️ bulkSyncPackagesForAllProfiles() is deprecated. Use customer-service.ts instead.');
  throw new Error('This function has been removed. Use customer-service.ts instead.');
}