#!/usr/bin/env ts-node
/**
 * Redis Cleanup Script
 * 
 * Expires all keys older than their TTL
 * Run via cron: 0 2 * * * (daily at 2am)
 * 
 * Usage: npx ts-node src/scripts/redis-cleanup.ts
 */

import { redis } from '@/lib/cache';

async function cleanup() {
  if (!redis) {
    console.log('Redis not configured, nothing to clean up');
    return;
  }

  console.log('Starting Redis cleanup...');
  const startTime = Date.now();

  try {
    // Get all keys
    // Note: In production with large datasets, consider using SCAN instead of KEYS
    const keys = await redis.keys('*');
    console.log(`Found ${keys.length} total keys`);

    let expired = 0;
    let kept = 0;

    for (const key of keys) {
      // Check TTL
      const ttl = await redis.ttl(key);
      
      if (ttl === -2) {
        // Key doesn't exist (already expired)
        expired++;
      } else if (ttl === -1) {
        // Key has no expiration - check if it's a session key that should have one
        if (key.startsWith('session:')) {
          // Apply default TTL to session keys without expiration
          await redis.expire(key, 3600); // 1 hour
          console.log(`Set TTL for session key: ${key}`);
          kept++;
        } else if (key.startsWith('restaurant:')) {
          // Apply restaurant TTL
          await redis.expire(key, 86400); // 24 hours
          console.log(`Set TTL for restaurant key: ${key}`);
          kept++;
        } else {
          kept++;
        }
      } else if (ttl > 0) {
        // Key has a valid TTL
        kept++;
      } else {
        // ttl === 0 means key is expiring right now
        expired++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Cleanup complete in ${duration}ms:`);
    console.log(`  - Keys checked: ${keys.length}`);
    console.log(`  - Already expired: ${expired}`);
    console.log(`  - Active: ${kept}`);

  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  cleanup().then(() => process.exit(0));
}

export { cleanup };
