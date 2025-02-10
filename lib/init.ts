import { startCacheUpdates } from './cache';

// Start background processes
if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_CACHE_IN_DEV === 'true') {
  console.log('Starting background cache updates...');
  startCacheUpdates();
}

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  process.exit(0);
}); 