const SubscriptionPackage = require('../models/SubscriptionPackage');
const RedisCache = require('../utils/redisCache');

/**
 * Get subscription packages for a specific user type (B2B or B2C)
 * GET /api/v2/subscription-packages?userType=b2b|b2c
 */
exports.getSubscriptionPackages = async (req, res) => {
  try {
    const { userType } = req.query;
    
    if (!userType || !['b2b', 'b2c'].includes(userType)) {
      return res.status(400).json({
        status: 'error',
        message: 'userType query parameter is required and must be either "b2b" or "b2c"',
      });
    }

    const cacheKey = RedisCache.listKey(`subscription_packages_${userType}`);
    
    // Try to get from cache
    const cached = await RedisCache.get(cacheKey);
    if (cached) {
      return res.json({
        status: 'success',
        data: cached,
      });
    }

    // Fetch all packages from database
    let allPackages = [];
    try {
      allPackages = await SubscriptionPackage.getAll();
    } catch (error) {
      // If table doesn't exist, return empty array
      if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
        console.log('⚠️  Subscription packages table not found. Returning empty array.');
        allPackages = [];
      } else {
        throw error;
      }
    }
    
    // Filter packages by userType and isActive
    const filteredPackages = allPackages.filter(pkg => {
      // Only show active packages
      if (pkg.isActive === false) {
        return false;
      }
      
      // Check if package has userType field
      if (pkg.userType) {
        return pkg.userType === userType;
      }
      
      // Legacy support: filter by package ID pattern
      // B2B packages: 'b2b-*'
      // B2C packages: 'b2c-*' or packages without 'b2b' in ID
      if (userType === 'b2b') {
        return pkg.id.includes('b2b');
      } else if (userType === 'b2c') {
        return pkg.id.includes('b2c') || (!pkg.id.includes('b2b') && (pkg.id === 'monthly' || pkg.id === 'yearly'));
      }
      return false;
    });
    
    // Sort by price (monthly first, then yearly)
    const sortedPackages = filteredPackages.sort((a, b) => {
      if (a.duration === 'month' && b.duration === 'year') return -1;
      if (a.duration === 'year' && b.duration === 'month') return 1;
      if (a.duration === 'order' && b.duration === 'year') return -1;
      if (a.duration === 'year' && b.duration === 'order') return 1;
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

