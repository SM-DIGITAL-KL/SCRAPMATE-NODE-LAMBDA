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
      const { location, category } = req.query;

      // Check Redis cache first
      const cacheKey = RedisCache.listKey('live_prices', { location: location || 'all', category: category || 'all' });
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          console.log('⚡ Live prices cache hit');
          return res.json({
            status: 'success',
            msg: 'Live prices retrieved successfully',
            data: cached,
            cached: true
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
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

      // Cache for 1 hour (only if we have data)
      if (prices.length > 0) {
        try {
          await RedisCache.set(cacheKey, prices, 3600); // 1 hour TTL
        } catch (err) {
          console.error('Redis set error:', err);
        }
      }

      return res.json({
        status: 'success',
        msg: prices.length > 0 ? 'Live prices retrieved successfully' : 'No live prices available. Please sync prices first.',
        data: prices,
        cached: false
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

      // Invalidate cache
      try {
        await RedisCache.invalidateV2ApiCache('live_prices', null, {});
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: `Successfully synced ${result.count} live prices from admin panel`,
        data: {
          synced: result.count,
          timestamp: new Date().toISOString()
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
