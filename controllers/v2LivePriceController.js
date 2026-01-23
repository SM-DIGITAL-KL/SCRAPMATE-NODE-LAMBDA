const LivePrice = require('../models/LivePrice');
const RedisCache = require('../utils/redisCache');
const axios = require('axios');

/**
 * V2 Live Price Controller
 * Fetches live prices from admin panel and stores in DynamoDB
 */
class V2LivePriceController {
  /**
   * GET /api/v2/live-prices
   * Get all live prices from DynamoDB
   * Query params:
   *   - location: filter by location (optional)
   *   - category: filter by category (optional)
   */
  static async getLivePrices(req, res) {
    try {
      const { location, category, refresh } = req.query;

      // Check if refresh parameter is set to bypass cache
      const forceRefresh = refresh === '1' || refresh === 'true' || refresh === true;
      
      // Check Redis cache first (unless refresh is requested)
      const cacheKey = RedisCache.listKey('live_prices', { location: location || 'all', category: category || 'all' });
      
      if (!forceRefresh) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached !== null && cached !== undefined) {
            console.log('⚡ Live prices cache hit');
            // Get remaining TTL from Redis to calculate next refresh time
            const redis = require('../config/redis');
            let remainingTtl = 43200; // Default 12 hours
            try {
              const ttl = await redis.ttl(cacheKey);
              if (ttl > 0) {
                remainingTtl = ttl;
              }
            } catch (ttlErr) {
              console.warn('Could not get TTL from Redis:', ttlErr.message);
            }
            
            // Get the most recent updated_at from cached prices
            let lastUpdated = null;
            if (Array.isArray(cached) && cached.length > 0) {
              const timestamps = cached
                .map(p => p.updated_at || p.created_at)
                .filter(t => t)
                .sort()
                .reverse();
              if (timestamps.length > 0) {
                lastUpdated = timestamps[0];
              }
            }
            
            return res.json({
              status: 'success',
              msg: 'Live prices retrieved successfully',
              data: cached,
              cached: true,
              last_updated: lastUpdated || new Date().toISOString(),
              next_refresh: new Date(Date.now() + (remainingTtl * 1000)).toISOString(),
              cache_ttl_seconds: remainingTtl
            });
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      } else {
        // If refresh is requested, invalidate all live prices cache keys
        console.log('🔄 Refresh requested - bypassing cache and invalidating all live prices cache');
        try {
          // Delete the specific cache key
          await RedisCache.delete(cacheKey);
          // Also invalidate all live prices cache patterns
          await RedisCache.invalidateV2ApiCache('live_prices', null, {});
          console.log('🗑️  Invalidated all live prices cache keys');
        } catch (err) {
          console.error('Redis delete error:', err);
        }
      }

      // Fetch from DynamoDB
      let prices = [];
      try {
        if (location) {
          prices = await LivePrice.findByLocation(location);
        } else if (category) {
          prices = await LivePrice.findByCategory(category);
        } else {
          prices = await LivePrice.getAll();
        }
        console.log(`✅ Fetched ${prices.length} live prices from DynamoDB`);
      } catch (err) {
        // If table doesn't exist, return empty array
        if (err.name === 'ResourceNotFoundException' || err.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          console.log('⚠️  Live prices table does not exist yet. Returning empty array.');
          prices = [];
        } else {
          throw err;
        }
      }

      // Cache for 12 hours (only if we have data) - long cache period for performance
      if (prices.length > 0) {
        try {
          await RedisCache.set(cacheKey, prices, 43200); // 12 hours TTL
        } catch (err) {
          console.error('Redis set error:', err);
        }
      }

      // Get the most recent updated_at timestamp from prices
      let lastUpdated = null;
      if (prices.length > 0) {
        const timestamps = prices
          .map(p => p.updated_at || p.created_at)
          .filter(t => t)
          .sort()
          .reverse();
        if (timestamps.length > 0) {
          lastUpdated = timestamps[0];
        }
      }

      return res.json({
        status: 'success',
        msg: prices.length > 0 ? 'Live prices retrieved successfully' : 'No live prices available. Please sync prices first.',
        data: prices,
        cached: false,
        last_updated: lastUpdated || new Date().toISOString(),
        next_refresh: new Date(Date.now() + 43200000).toISOString(), // 12 hours from now
        cache_ttl_seconds: 43200
      });
    } catch (error) {
      console.error('❌ Error fetching live prices:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch live prices: ' + error.message,
        data: null
      });
    }
  }

  /**
   * POST /api/v2/live-prices/sync
   * Sync live prices from admin panel to DynamoDB
   * Accepts prices data directly in request body, or fetches from admin panel API
   * Body (optional): { prices: [...] } - If provided, uses this data directly
   */
  static async syncLivePrices(req, res) {
    try {
      console.log('🔄 Starting live prices sync...');
      console.log('📦 Request body keys:', Object.keys(req.body || {}));
      console.log('📦 Request body type:', typeof req.body);
      console.log('📦 Request body is array:', Array.isArray(req.body));
      if (req.body && req.body.prices) {
        console.log('📦 Prices array length:', Array.isArray(req.body.prices) ? req.body.prices.length : 'not an array');
      }

      let pricesData = [];

      // Check if prices data is provided directly in request body
      if (req.body && req.body.prices && Array.isArray(req.body.prices) && req.body.prices.length > 0) {
        console.log(`✅ Received ${req.body.prices.length} prices directly from request body`);
        pricesData = req.body.prices;
      } else if (req.body && Array.isArray(req.body) && req.body.length > 0) {
        // Handle case where prices array is sent directly as body
        console.log(`✅ Received ${req.body.length} prices directly as array`);
        pricesData = req.body;
      } else {
        // Fallback: Fetch from admin panel API
        console.log('📡 No prices in request body, fetching from admin panel API...');
        
        const adminPanelUrl = process.env.ADMIN_PANEL_URL || 
          (process.env.NODE_ENV === 'production' 
            ? 'https://mono.scrapmate.co.in'
            : 'http://127.0.0.1:8000');

        // Fetch from API endpoint (without refresh to use cached data if available)
        const apiUrl = `${adminPanelUrl}/api/liveprices`;
        console.log(`📡 Fetching live prices from: ${apiUrl}`);
        
        const response = await axios.get(apiUrl, {
          timeout: 60000, // Increased to 60 seconds for cached data
          headers: {
            'Accept': 'application/json'
          }
        });

        if (response.data && response.data.status === 'success' && Array.isArray(response.data.data)) {
          pricesData = response.data.data;
        } else if (response.data && Array.isArray(response.data)) {
          pricesData = response.data;
        } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
          pricesData = response.data.data;
        } else if (response.data && response.data.prices && Array.isArray(response.data.prices)) {
          pricesData = response.data.prices;
        }
      }

      if (pricesData.length === 0) {
        return res.status(404).json({
          status: 'error',
          msg: 'No price data provided or found',
          data: null
        });
      }

      console.log(`✅ Fetched ${pricesData.length} prices from admin panel`);

      // Delete all existing prices (for fresh sync)
      try {
        await LivePrice.deleteAll();
        console.log('🗑️  Deleted existing live prices');
      } catch (deleteErr) {
        // If table doesn't exist, that's okay - we'll create it when we write
        if (deleteErr.name !== 'ResourceNotFoundException' && deleteErr.__type !== 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
          throw deleteErr;
        }
        console.log('ℹ️  Live prices table does not exist yet. Will be created on first write.');
      }

      // Batch create/update prices
      let result;
      try {
        result = await LivePrice.batchCreateOrUpdate(pricesData);
        console.log(`✅ Synced ${result.count} live prices to DynamoDB`);
      } catch (syncErr) {
        // If table doesn't exist, provide helpful error message
        if (syncErr.name === 'ResourceNotFoundException' || syncErr.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException' || syncErr.message?.includes('does not exist')) {
          return res.status(400).json({
            status: 'error',
            msg: `Live prices table does not exist in DynamoDB. Please create the 'live_prices' table first with primary key 'id' (Number).`,
            data: null
          });
        }
        throw syncErr;
      }

      // Fetch the synced data from DynamoDB to update cache
      let syncedPrices = [];
      try {
        console.log('🔄 [SYNC] Fetching synced data from DynamoDB for cache update...');
        syncedPrices = await LivePrice.getAll();
        console.log(`✅ [SYNC] Fetched ${syncedPrices.length} prices from DynamoDB for cache update`);
        
        // Log sample data to verify it's fresh
        if (syncedPrices.length > 0) {
          const samplePrice = syncedPrices[0];
          console.log('📊 [SYNC] Sample price data:', {
            location: samplePrice.location,
            item: samplePrice.item,
            buy_price: samplePrice.buy_price,
            updated_at: samplePrice.updated_at || samplePrice.created_at
          });
        }
      } catch (fetchErr) {
        console.error('❌ [SYNC] Error fetching prices for cache update:', fetchErr);
        // Use the input data as fallback
        syncedPrices = pricesData;
        console.log(`⚠️  [SYNC] Using input data as fallback (${syncedPrices.length} prices)`);
      }

      // Update Redis cache with fresh data (not just invalidate)
      let invalidatedCount = 0;
      let syncTimestamp = new Date().toISOString();
      try {
        console.log('🔄 [SYNC] Updating Redis cache with fresh data...');
        
        // Step 1: Invalidate all existing cache keys comprehensively
        console.log('🗑️  [SYNC] Step 1: Invalidating all live prices cache keys...');
        invalidatedCount = await RedisCache.invalidateV2ApiCache('live_prices', null, {});
        console.log(`🗑️  [SYNC] Invalidated ${invalidatedCount} live prices cache key(s)`);
        
        // Step 2: Also try to delete the main cache key explicitly (in case it wasn't caught by invalidation)
        const mainCacheKey = RedisCache.listKey('live_prices', { location: 'all', category: 'all' });
        try {
          await RedisCache.delete(mainCacheKey);
          console.log(`🗑️  [SYNC] Explicitly deleted main cache key: ${mainCacheKey}`);
        } catch (delErr) {
          console.warn(`⚠️  [SYNC] Could not delete main cache key (may not exist): ${delErr.message}`);
        }
        
        // Step 3: Set a cache version/timestamp to track when sync happened
        syncTimestamp = new Date().toISOString();
        const cacheVersionKey = 'live_prices:sync_timestamp';
        await RedisCache.set(cacheVersionKey, syncTimestamp, 43200); // Same TTL as cache (12 hours)
        console.log(`📅 [SYNC] Set cache version timestamp: ${syncTimestamp}`);
        
        // Step 4: Update the main cache key with fresh data
        console.log(`💾 [SYNC] Step 2: Setting fresh cache data...`);
        await RedisCache.set(mainCacheKey, syncedPrices, 43200); // 12 hours TTL - long cache period
        
        // Verify cache was set
        const verifyCache = await RedisCache.get(mainCacheKey);
        if (verifyCache && Array.isArray(verifyCache)) {
          console.log(`✅ [SYNC] Successfully updated Redis cache with ${syncedPrices.length} fresh prices`);
          console.log(`✅ [SYNC] Cache verification: ${verifyCache.length} prices in cache`);
          
          // Log sample from cache to verify
          if (verifyCache.length > 0) {
            const cachedSample = verifyCache[0];
            console.log('📊 [SYNC] Sample cached data:', {
              location: cachedSample.location,
              item: cachedSample.item,
              buy_price: cachedSample.buy_price,
              updated_at: cachedSample.updated_at || cachedSample.created_at
            });
          }
        } else {
          console.error('❌ [SYNC] Cache verification failed - cache not set properly');
        }
      } catch (err) {
        console.error('❌ [SYNC] Cache update error:', err);
        // Try to at least invalidate if update fails
        try {
          await RedisCache.invalidateV2ApiCache('live_prices', null, {});
          console.log('🗑️  [SYNC] At least invalidated cache as fallback');
        } catch (invalidateErr) {
          console.error('❌ [SYNC] Cache invalidation also failed:', invalidateErr);
        }
      }

      // Get the sync timestamp (already set in try block above)
      try {
        const cacheVersionKey = 'live_prices:sync_timestamp';
        const cachedTimestamp = await RedisCache.get(cacheVersionKey);
        // Handle both string timestamps and Date objects
        if (cachedTimestamp) {
          if (typeof cachedTimestamp === 'string') {
            // Validate it's a proper ISO timestamp
            const date = new Date(cachedTimestamp);
            if (!isNaN(date.getTime())) {
              syncTimestamp = cachedTimestamp;
            } else {
              console.warn('Invalid timestamp format in cache:', cachedTimestamp);
              syncTimestamp = new Date().toISOString();
            }
          } else if (cachedTimestamp instanceof Date) {
            syncTimestamp = cachedTimestamp.toISOString();
          } else {
            console.warn('Unexpected timestamp type in cache:', typeof cachedTimestamp);
            syncTimestamp = new Date().toISOString();
          }
        }
      } catch (err) {
        console.warn('Could not retrieve sync timestamp:', err.message);
        syncTimestamp = new Date().toISOString();
      }

      return res.json({
        status: 'success',
        msg: `Successfully synced ${result.count} live prices from admin panel. Cache invalidated and updated.`,
        data: {
          synced: result.count,
          timestamp: syncTimestamp,
          cache_invalidated: true,
          cache_keys_invalidated: invalidatedCount || 0
        }
      });
    } catch (error) {
      console.error('❌ Error syncing live prices:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to sync live prices: ' + error.message,
        data: null
      });
    }
  }

  /**
   * POST /api/v2/live-prices/invalidate-cache
   * Invalidate Redis cache for live prices (without re-scraping)
   */
  static async invalidateCache(req, res) {
    try {
      console.log('🔄 Invalidating live prices Redis cache...');

      // Invalidate all live prices cache patterns
      try {
        await RedisCache.invalidateV2ApiCache('live_prices', null, {});
        console.log('✅ Successfully invalidated live prices Redis cache');
      } catch (err) {
        console.error('❌ Error invalidating cache:', err);
        // Don't fail the request if cache invalidation fails
      }

      return res.json({
        status: 'success',
        msg: 'Live prices cache invalidated successfully. Next request will fetch fresh data from DynamoDB.',
        data: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('❌ Error invalidating live prices cache:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to invalidate cache: ' + error.message,
        data: null
      });
    }
  }
}

module.exports = V2LivePriceController;
