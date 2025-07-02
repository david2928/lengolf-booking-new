import NodeCache from 'node-cache';

// Cache instances
export const authCache = new NodeCache({
  stdTTL: 60, // 1 minute
  checkperiod: 30, // Check for expired entries every 30 seconds
});

// Generic cache for other application needs
export const appCache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60, // Check for expired entries every minute
});

// Cache keys
export const getCacheKey = {
  auth: (userId: string) => `auth_${userId}`,
  generic: (key: string) => `app_${key}`,
}; 