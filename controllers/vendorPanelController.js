const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

class VendorPanelController {
  static async vendors(req, res) {
    res.json({
      status: 'success',
      msg: 'Vendors page data',
      data: { pagename: 'Vendor Manage' }
    });
  }

  static async getVendorById(req, res) {
    try {
      const { id } = req.params;
      
      // Check Redis cache first
      const cacheKey = RedisCache.shopKey(id, 'vendor');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Vendor cache hit:', cacheKey);
          return res.json({ status: 'success', msg: 'Vendor retrieved', data: cached });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Shop model
      const vendorData = await Shop.findById(id);
      
      // Cache vendor data for 30 minutes
      if (vendorData) {
        try {
          await RedisCache.set(cacheKey, vendorData, '30days');
          console.log('💾 Vendor data cached:', cacheKey);
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }
      
      res.json({ status: 'success', msg: 'Vendor retrieved', data: vendorData });
    } catch (error) {
      res.status(500).json({ status: 'error', msg: 'Error fetching vendor', data: null });
    }
  }

  static async createVendor(req, res) {
    // Invalidate related caches
    try {
      await RedisCache.invalidateTableCache('shops');
      await RedisCache.invalidateTableCache('users');
      console.log('🗑️  Invalidated vendor caches after create');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Vendor created', data: null });
  }

  static async updateVendor(req, res) {
    const { id } = req.params;
    // Invalidate related caches
    try {
      await RedisCache.invalidateTableCache('shops');
      await RedisCache.delete(RedisCache.shopKey(id, 'vendor'));
      console.log('🗑️  Invalidated vendor caches after update');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Vendor updated', data: null });
  }

  static async deleteVendor(req, res) {
    const { id } = req.params;
    // Invalidate related caches
    try {
      await RedisCache.invalidateTableCache('shops');
      await RedisCache.invalidateTableCache('users');
      await RedisCache.delete(RedisCache.shopKey(id, 'vendor'));
      console.log('🗑️  Invalidated vendor caches after delete');
    } catch (err) {
      console.error('Redis cache invalidation error:', err);
    }
    res.json({ status: 'success', msg: 'Vendor deleted', data: null });
  }
}

module.exports = VendorPanelController;

