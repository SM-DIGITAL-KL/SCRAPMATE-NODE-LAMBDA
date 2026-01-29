#!/usr/bin/env node

/**
 * Script to clear all dashboard-related cache keys
 * Usage: node scripts/clear-dashboard-cache.js
 */

require('dotenv').config();
const RedisCache = require('../utils/redisCache');

async function clearDashboardCache() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗑️  Clearing Dashboard Cache');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let totalDeleted = 0;

  try {
    // 1. Clear main dashboard cache keys
    const dashboardKeys = [
      'dashboard_kpis',
      'dashboard_charts',
      'dashboard',
      'v2_user_types_dashboard',
      'dashboard_call_logs'
    ];

    console.log('📋 Clearing main dashboard cache keys...');
    for (const key of dashboardKeys) {
      const cacheKey = RedisCache.adminKey(key);
      const deleted = await RedisCache.delete(cacheKey);
      if (deleted) {
        console.log(`   ✅ Deleted: ${cacheKey}`);
        totalDeleted++;
      } else {
        console.log(`   ⚠️  Not found: ${cacheKey}`);
      }
    }

    // 2. Clear dashboard recent orders cache (with different limits)
    console.log('\n📋 Clearing dashboard recent orders cache...');
    const limits = [10, 20, 50, 100];
    for (const limit of limits) {
      const cacheKey = RedisCache.adminKey(`dashboard_recent_orders_${limit}`);
      const deleted = await RedisCache.delete(cacheKey);
      if (deleted) {
        console.log(`   ✅ Deleted: ${cacheKey}`);
        totalDeleted++;
      }
    }

    // 3. Clear user count caches (v2)
    console.log('\n📋 Clearing user count caches (v2)...');
    const userTypes = ['N', 'R', 'S', 'SR', 'D', 'C'];
    const appTypes = ['customer_app', 'vendor_app'];
    
    for (const userType of userTypes) {
      for (const appType of appTypes) {
        const cacheKey = `user:count_v2:${userType}:${appType}`;
        const deleted = await RedisCache.delete(cacheKey);
        if (deleted) {
          console.log(`   ✅ Deleted: ${cacheKey}`);
          totalDeleted++;
        }
      }
    }

    // 4. Clear monthly count caches (v2)
    console.log('\n📋 Clearing monthly count caches (v2)...');
    const currentYear = new Date().getFullYear();
    for (const userType of userTypes) {
      for (const appType of appTypes) {
        const cacheKey = `user:monthly_v2:${userType}:${appType}:${currentYear}`;
        const deleted = await RedisCache.delete(cacheKey);
        if (deleted) {
          console.log(`   ✅ Deleted: ${cacheKey}`);
          totalDeleted++;
        }
      }
    }

    // 5. Clear all admin dashboard patterns using pattern matching
    console.log('\n📋 Clearing admin dashboard patterns...');
    try {
      const patterns = [
        'admin:dashboard*',
        'admin:v2_user_types_dashboard*',
        'user:count_v2:*',
        'user:monthly_v2:*'
      ];

      for (const pattern of patterns) {
        const deleted = await RedisCache.deleteByPattern(pattern);
        if (deleted > 0) {
          console.log(`   ✅ Deleted ${deleted} keys matching: ${pattern}`);
          totalDeleted += deleted;
        }
      }
    } catch (patternErr) {
      console.log(`   ⚠️  Pattern deletion not supported, skipping...`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Dashboard cache cleared successfully!`);
    console.log(`   Total keys deleted: ${totalDeleted}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error clearing dashboard cache:', error);
    console.error('   Error stack:', error.stack);
    process.exit(1);
  }
}

// Run the script
clearDashboardCache()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });
