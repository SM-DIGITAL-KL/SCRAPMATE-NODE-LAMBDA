const SubscriptionPackage = require('../models/SubscriptionPackage');
const RedisCache = require('../utils/redisCache');

/**
 * Get all subscription packages
 */
exports.getSubscriptionPackages = async (req, res) => {
  try {
    const cacheKey = RedisCache.listKey('subscription_packages');
    
    // Try to get from cache
    const cached = await RedisCache.get(cacheKey);
    if (cached) {
      return res.json({
        status: 'success',
        data: cached,
      });
    }

    // Fetch from database
    let packages = [];
    try {
      packages = await SubscriptionPackage.getAll();
    } catch (error) {
      // If table doesn't exist, return empty array
      if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
        console.log('⚠️  Subscription packages table not found. Returning empty array.');
        packages = [];
      } else {
        throw error;
      }
    }
    
    // Sort by price (monthly first, then yearly)
    const sortedPackages = packages.sort((a, b) => {
      if (a.duration === 'month' && b.duration === 'year') return -1;
      if (a.duration === 'year' && b.duration === 'month') return 1;
      return a.price - b.price;
    });

    // Cache for 1 hour
    await RedisCache.set(cacheKey, sortedPackages, 3600);

    res.json({
      status: 'success',
      data: sortedPackages,
    });
  } catch (error) {
    console.error('Error fetching subscription packages:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscription packages',
      error: error.message,
    });
  }
};

/**
 * Get subscription package by ID
 */
exports.getSubscriptionPackageById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const packageData = await SubscriptionPackage.getById(id);
    
    if (!packageData) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription package not found',
      });
    }

    res.json({
      status: 'success',
      data: packageData,
    });
  } catch (error) {
    console.error('Error fetching subscription package:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscription package',
      error: error.message,
    });
  }
};

/**
 * Create or update subscription package
 */
exports.upsertSubscriptionPackage = async (req, res) => {
  try {
    const packageData = req.body;

    // Validate required fields
    if (!packageData.id || !packageData.name || !packageData.price || !packageData.duration) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: id, name, price, duration',
      });
    }

    // Validate price
    if (typeof packageData.price !== 'number' || packageData.price <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Price must be a positive number',
      });
    }

    // Validate duration
    if (!['month', 'year', 'order'].includes(packageData.duration)) {
      return res.status(400).json({
        status: 'error',
        message: 'Duration must be either "month", "year", or "order"',
      });
    }

    const result = await SubscriptionPackage.upsert(packageData);

    // Invalidate all subscription package caches (admin and v2)
    await RedisCache.delete(RedisCache.listKey('subscription_packages'));
    await RedisCache.delete(RedisCache.listKey('subscription_packages_b2b'));
    await RedisCache.delete(RedisCache.listKey('subscription_packages_b2c'));

    res.json({
      status: 'success',
      message: 'Subscription package saved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error upserting subscription package:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to save subscription package',
      error: error.message,
    });
  }
};

/**
 * Update subscription package
 */
exports.updateSubscriptionPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if package exists
    const existing = await SubscriptionPackage.getById(id);
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription package not found',
      });
    }

    const result = await SubscriptionPackage.update(id, updateData);

    // Invalidate all subscription package caches (admin and v2)
    await RedisCache.delete(RedisCache.listKey('subscription_packages'));
    await RedisCache.delete(RedisCache.listKey('subscription_packages_b2b'));
    await RedisCache.delete(RedisCache.listKey('subscription_packages_b2c'));

    res.json({
      status: 'success',
      message: 'Subscription package updated successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error updating subscription package:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update subscription package',
      error: error.message,
    });
  }
};

/**
 * Delete subscription package
 */
exports.deleteSubscriptionPackage = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await SubscriptionPackage.delete(id);

    // Invalidate all subscription package caches (admin and v2)
    await RedisCache.delete(RedisCache.listKey('subscription_packages'));
    await RedisCache.delete(RedisCache.listKey('subscription_packages_b2b'));
    await RedisCache.delete(RedisCache.listKey('subscription_packages_b2c'));

    res.json({
      status: 'success',
      message: 'Subscription package deleted successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error deleting subscription package:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete subscription package',
      error: error.message,
    });
  }
};

