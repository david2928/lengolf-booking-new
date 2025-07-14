/**
 * Google Tag Manager (GTM) utilities
 */

interface UserProfileData {
  profileId: string | null;
  customerId?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  // Legacy fields for backward compatibility
  stableHashId?: string | null;
  customerID?: string | null;
}

/**
 * Push user profile data to the GTM data layer
 * @param profileData - User profile data to push to the data layer
 */
export function pushProfileDataToGtm(profileData: UserProfileData): void {
  if (typeof window === 'undefined') return;
  
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'userProfileAvailable',
    profileId: profileData.profileId,
    // New customer fields
    customerId: profileData.customerId || null,
    customerCode: profileData.customerCode || null,
    customerName: profileData.customerName || null,
    // Legacy fields for backward compatibility
    stableHashId: profileData.stableHashId || null,
    customerID: profileData.customerID || profileData.customerCode || null
  });
}

/**
 * Push a generic event to the GTM data layer
 * @param eventName - Name of the event to push
 * @param eventData - Additional data to include with the event
 */
export function pushEventToGtm(eventName: string, eventData?: Record<string, any>): void {
  if (typeof window === 'undefined') return;
  
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    ...eventData
  });
}

// TypeScript definition for global dataLayer
declare global {
  interface Window {
    dataLayer: any[];
  }
} 