/**
 * @deprecated This entire file is deprecated and will be removed in a future version.
 * All customer management has been moved to utils/customer-service.ts
 * 
 * Legacy customer matching utilities - kept for backward compatibility only
 * DO NOT USE these functions in new code
 */

// === LEGACY FUNCTIONS - all deprecated, throw errors with helpful messages ===

/**
 * @deprecated Use findOrCreateCustomer() from utils/customer-service.ts instead
 */
export async function getOrCreateCrmMappingV2(...args: any[]): Promise<any> {
  console.warn('⚠️ getOrCreateCrmMappingV2 is deprecated. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
  throw new Error('This function has been removed. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
}

/**
 * @deprecated Use findOrCreateCustomer() from utils/customer-service.ts instead
 */
export async function matchProfileWithCrm(...args: any[]): Promise<any> {
  console.warn('⚠️ matchProfileWithCrm is deprecated. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
  throw new Error('This function has been removed. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
}

/**
 * @deprecated Use findOrCreateCustomer() from utils/customer-service.ts instead
 */
export async function matchProfileWithCrmV2(...args: any[]): Promise<any> {
  console.warn('⚠️ matchProfileWithCrmV2 is deprecated. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
  throw new Error('This function has been removed. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
}

/**
 * @deprecated Use findOrCreateCustomer() from utils/customer-service.ts instead
 */
export async function createProfileLink(...args: any[]): Promise<any> {
  console.warn('⚠️ createProfileLink is deprecated. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
  throw new Error('This function has been removed. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
}

/**
 * @deprecated Use findOrCreateCustomer() from utils/customer-service.ts instead
 */
export async function getOrCreateCrmMapping(...args: any[]): Promise<any> {
  console.warn('⚠️ getOrCreateCrmMapping is deprecated. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
  throw new Error('This function has been removed. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
}

/**
 * @deprecated Use findOrCreateCustomer() from utils/customer-service.ts instead
 */
export async function getCrmCustomerForProfile(...args: any[]): Promise<any> {
  console.warn('⚠️ getCrmCustomerForProfile is deprecated. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
  throw new Error('This function has been removed. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
}

/**
 * @deprecated Use findOrCreateCustomer() from utils/customer-service.ts instead
 */
export async function getRealTimeCustomerForProfile(...args: any[]): Promise<any> {
  console.warn('⚠️ getRealTimeCustomerForProfile is deprecated. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
  throw new Error('This function has been removed. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
}

/**
 * @deprecated Use findOrCreateCustomer() from utils/customer-service.ts instead
 */
export async function getProfileCustomerLink(...args: any[]): Promise<any> {
  console.warn('⚠️ getProfileCustomerLink is deprecated. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
  throw new Error('This function has been removed. Use findOrCreateCustomer() from utils/customer-service.ts instead.');
}