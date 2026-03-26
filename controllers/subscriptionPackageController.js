const SubscriptionPackage = require('../models/SubscriptionPackage');
const RedisCache = require('../utils/redisCache');

function zoneFromEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const match = value.match(/^zone(\d{1,2})@scrapmate\.co\.in$/i);
  if (!match) return '';
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 48) return '';
  return `Z${String(n).padStart(2, '0')}`;
}

function getRequestZone(req) {
  const email = req.user?.email || req.session?.userEmail || req.headers['x-user-email'] || '';
  return zoneFromEmail(email);
}

function applyZoneOverrides(packages, zoneCode) {
  if (!zoneCode) return packages;
  return (packages || []).map((pkg) => {
    const zonePriceEntry = pkg?.zonePrices?.[zoneCode];
    const zonePrice = zonePriceEntry && zonePriceEntry.price !== undefined
      ? Number(zonePriceEntry.price)
      : null;
    if (zonePrice === null || Number.isNaN(zonePrice)) return pkg;
    return {
      ...pkg,
      price: zonePrice
    };
  });
}

async function invalidateSubscriptionPackageCaches(zoneCode = '') {
  const zones = ['all'];
  if (zoneCode) {
    zones.push(zoneCode);
  } else {
    for (let i = 1; i <= 48; i += 1) {
      zones.push(`Z${String(i).padStart(2, '0')}`);
    }
  }

  const userTypes = ['b2b', 'b2c'];
  const languages = ['en', 'hi', 'ta', 'te', 'ml', 'kn'];
  const keysToDelete = new Set([
    RedisCache.listKey('subscription_packages'),
    RedisCache.listKey('subscription_packages', { zone: 'all' }),
    RedisCache.listKey('subscription_packages_b2b'),
    RedisCache.listKey('subscription_packages_b2c'),
  ]);

  zones.forEach((zone) => {
    keysToDelete.add(RedisCache.listKey('subscription_packages', { zone }));
    userTypes.forEach((userType) => {
      languages.forEach((lang) => {
        keysToDelete.add(RedisCache.listKey(`subscription_packages_${userType}_${lang}`, { zone }));
      });
    });
  });

  await Promise.all(Array.from(keysToDelete).map((key) => RedisCache.delete(key)));
}

/**
 * Get all subscription packages
 */
exports.getSubscriptionPackages = async (req, res) => {
  try {
    const requestZone = getRequestZone(req);
    const cacheKey = RedisCache.listKey('subscription_packages', { zone: requestZone || 'all' });
    
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
    
    const effectivePackages = applyZoneOverrides(packages, requestZone);

    // Sort by price (monthly first, then yearly)
    const sortedPackages = effectivePackages.sort((a, b) => {
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
    const requestZone = getRequestZone(req);

    // Validate required fields
    if (!packageData.id || !packageData.name || !packageData.price || !packageData.duration) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: id, name, price, duration',
      });
    }

    // Validate price
    // Allow price 0 for percentage-based plans
    if (typeof packageData.price !== 'number' || packageData.price < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Price must be a non-negative number',
      });
    }
    
    // If price is 0, it should be a percentage-based plan
    if (packageData.price === 0 && !packageData.isPercentageBased) {
      console.warn('⚠️  Price is 0 but isPercentageBased is not set. Setting isPercentageBased to true.');
      packageData.isPercentageBased = true;
    }

    // Validate duration
    if (!['month', 'year', 'order'].includes(packageData.duration)) {
      return res.status(400).json({
        status: 'error',
        message: 'Duration must be either "month", "year", or "order"',
      });
    }

    // Zone admins update month/year pricing as zone-specific overrides.
    if (requestZone && ['month', 'year'].includes(String(packageData.duration || '').toLowerCase())) {
      const existing = await SubscriptionPackage.getById(packageData.id);
      if (!existing) {
        return res.status(404).json({
          status: 'error',
          message: 'Subscription package not found',
        });
      }

      const zonePrices = { ...(existing.zonePrices || {}) };
      zonePrices[requestZone] = {
        price: Number(packageData.price),
        updatedAt: new Date().toISOString(),
        updatedBy: req.headers['x-user-email'] || req.user?.email || ''
      };

      const result = await SubscriptionPackage.update(packageData.id, { zonePrices });
      await invalidateSubscriptionPackageCaches(requestZone);

      return res.json({
        status: 'success',
        message: `Subscription package zone price saved for ${requestZone}`,
        data: result,
      });
    }

    const result = await SubscriptionPackage.upsert(packageData);

    // Invalidate all subscription package caches (admin and v2)
    await invalidateSubscriptionPackageCaches(requestZone);

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
    const requestZone = getRequestZone(req);

    // Check if package exists
    const existing = await SubscriptionPackage.getById(id);
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription package not found',
      });
    }

    const targetDuration = String(updateData.duration || existing.duration || '').toLowerCase();
    if (requestZone && ['month', 'year'].includes(targetDuration) && updateData.price !== undefined) {
      const zonePrices = { ...(existing.zonePrices || {}) };
      zonePrices[requestZone] = {
        price: Number(updateData.price),
        updatedAt: new Date().toISOString(),
        updatedBy: req.headers['x-user-email'] || req.user?.email || ''
      };
      const result = await SubscriptionPackage.update(id, { zonePrices });
      await invalidateSubscriptionPackageCaches(requestZone);
      return res.json({
        status: 'success',
        message: `Subscription package zone price updated for ${requestZone}`,
        data: result,
      });
    }

    const result = await SubscriptionPackage.update(id, updateData);

    // Invalidate all subscription package caches (admin and v2)
    await invalidateSubscriptionPackageCaches(requestZone);

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
    await invalidateSubscriptionPackageCaches();

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
