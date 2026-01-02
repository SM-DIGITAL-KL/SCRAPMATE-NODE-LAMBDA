const SubscriptionPackage = require('../models/SubscriptionPackage');
const Invoice = require('../models/Invoice');
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

/**
 * Check and update subscription expiry
 * POST /api/v2/subscription-packages/check-expiry
 * Body: { user_id: string }
 */
exports.checkSubscriptionExpiry = async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        status: 'error',
        msg: 'user_id is required',
        data: null
      });
    }

    console.log(`🔍 Checking subscription expiry for user ${user_id}`);

    // Get all shops for this user
    const Shop = require('../models/Shop');
    const allShops = await Shop.findAllByUserId(user_id);
    const shop = allShops.find(s => s.shop_type === 3 || s.shop_type === 1); // B2C or B2B
    
    if (!shop) {
      return res.json({
        status: 'success',
        msg: 'No shop found for user',
        data: { expired: false }
      });
    }

    // Check if subscription has expired
    const subscriptionEndsAt = shop.subscription_ends_at;
    if (!subscriptionEndsAt) {
      // No subscription end date - not subscribed or already expired
      if (shop.is_subscribed) {
        // Update to set is_subscribed to false
        await Shop.update(shop.id, {
          is_subscribed: false,
          is_subscription_ends: true
        });
        console.log(`✅ Updated shop ${shop.id} - subscription expired (no end date)`);
        
        // Invalidate user profile cache
        await RedisCache.delete(RedisCache.userKey(String(user_id), 'profile'));
        await RedisCache.delete(RedisCache.userKey(String(user_id)));
        
        return res.json({
          status: 'success',
          msg: 'Subscription expired and updated',
          data: { expired: true, updated: true }
        });
      }
      return res.json({
        status: 'success',
        msg: 'No active subscription',
        data: { expired: false }
      });
    }

    const endDate = new Date(subscriptionEndsAt);
    const now = new Date();
    
    // Set time to midnight for date comparison
    endDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    
    // Check if subscription has expired (end date is in the past)
    if (endDate < now && shop.is_subscribed) {
      // Subscription has expired - update shop
      await Shop.update(shop.id, {
        is_subscribed: false,
        is_subscription_ends: true
      });
      console.log(`✅ Updated shop ${shop.id} - subscription expired (end date: ${subscriptionEndsAt})`);
      
      // Also update invoices to mark as expired (optional - for tracking)
      const invoices = await Invoice.getAll();
      const userInvoices = invoices.filter(inv => 
        inv.user_id === user_id && 
        inv.approval_status === 'approved' && 
        inv.type === 'Paid'
      );
      
      // Update the most recent approved invoice if any
      if (userInvoices.length > 0) {
        const latestInvoice = userInvoices.sort((a, b) => {
          const dateA = new Date(a.created_at || 0);
          const dateB = new Date(b.created_at || 0);
          return dateB - dateA;
        })[0];
        
        // We could add an 'expired' field or update notes, but for now just log
        console.log(`📋 Latest invoice for user ${user_id}: ${latestInvoice.id}`);
      }
      
      // Invalidate user profile cache
      await RedisCache.delete(RedisCache.userKey(String(user_id), 'profile'));
      await RedisCache.delete(RedisCache.userKey(String(user_id)));
      
      return res.json({
        status: 'success',
        msg: 'Subscription expired and updated',
        data: { expired: true, updated: true, endDate: subscriptionEndsAt }
      });
    }

    // Subscription is still active
    return res.json({
      status: 'success',
      msg: 'Subscription is active',
      data: { expired: false, endDate: subscriptionEndsAt }
    });
  } catch (error) {
    console.error('❌ checkSubscriptionExpiry error:', error);
    console.error('   Error stack:', error.stack);
    res.status(500).json({
      status: 'error',
      msg: 'Error checking subscription expiry',
      data: null
    });
  }
};

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
    if (cached !== null && cached !== undefined) {
      return res.json({
        status: 'success',
        data: cached,
        hitBy: 'Redis'
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
    
    // For B2B per-order subscriptions, change from fixed 999 to 0.5% of order value
    const processedPackages = filteredPackages.map(pkg => {
      // If it's a B2B per-order subscription, modify the price to indicate percentage-based pricing
      if (userType === 'b2b' && pkg.duration === 'order') {
        // Use stored percentage if available, otherwise default to 0.5%
        const pricePercentage = pkg.pricePercentage !== undefined && pkg.pricePercentage !== null 
          ? pkg.pricePercentage 
          : 0.5; // Default to 0.5% if not set
        
        return {
          ...pkg,
          price: 0, // Set price to 0 for percentage-based plans (will be calculated per order)
          pricePercentage: pricePercentage, // Percentage of order value (0.5 = 0.5%)
          originalPrice: pkg.price, // Keep original price for reference
          isPercentageBased: pkg.isPercentageBased !== undefined ? pkg.isPercentageBased : true
        };
      }
      return pkg;
    });

    // Sort by price (monthly first, then yearly)
    const sortedPackages = processedPackages.sort((a, b) => {
      if (a.duration === 'month' && b.duration === 'year') return -1;
      if (a.duration === 'year' && b.duration === 'month') return 1;
      if (a.duration === 'order' && b.duration === 'year') return -1;
      if (a.duration === 'year' && b.duration === 'order') return 1;
      // For percentage-based plans, use originalPrice for sorting
      const priceA = a.isPercentageBased ? (a.originalPrice || 0) : a.price;
      const priceB = b.isPercentageBased ? (b.originalPrice || 0) : b.price;
      return priceA - priceB;
    });

    // Cache for 1 hour
    await RedisCache.set(cacheKey, sortedPackages, 3600);

    res.json({
      status: 'success',
      data: sortedPackages,
      hitBy: 'DynamoDB'
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
 * Save user subscription package after payment (v2 endpoint)
 * POST /api/v2/subscription-packages/save
 * Body: { user_id, package_id, payment_moj_id, payment_req_id, pay_details }
 */
exports.saveUserSubscription = async (req, res) => {
  try {
    const { user_id, package_id, payment_moj_id, payment_req_id, pay_details } = req.body;

    if (!user_id || !package_id) {
      return res.status(400).json({
        status: 'error',
        msg: 'user_id and package_id are required',
        data: null
      });
    }

    // Verify transaction ID to prevent duplicate payments
    if (payment_moj_id) {
      const allInvoices = await Invoice.getAll();
      const duplicateInvoice = allInvoices.find(inv => 
        inv.payment_moj_id && String(inv.payment_moj_id) === String(payment_moj_id)
      );
      
      if (duplicateInvoice) {
        console.log(`⚠️  Duplicate transaction ID detected: ${payment_moj_id}`);
        return res.status(400).json({
          status: 'error',
          msg: 'This transaction has already been processed. Please contact support if you believe this is an error.',
          data: null
        });
      }
    }

    // Get package by ID (supports string IDs like "b2c-monthly")
    const packageData = await SubscriptionPackage.getById(package_id);
    if (!packageData) {
      console.error(`❌ Package not found: ${package_id}`);
      return res.status(404).json({
        status: 'error',
        msg: 'Package not found',
        data: null
      });
    }

    // Check if user has any active invoices to extend subscription
    const userInvoices = await Invoice.findByUserId(user_id);
    
    const latestActiveInvoice = userInvoices
      .filter(inv => {
        if (!inv.to_date) return false;
        const toDate = new Date(inv.to_date);
        return toDate >= new Date();
      })
      .sort((a, b) => new Date(b.to_date) - new Date(a.to_date))[0];

    // Calculate subscription dates based on duration
    let fromDate = new Date().toISOString().split('T')[0];
    if (latestActiveInvoice && latestActiveInvoice.to_date) {
      // Extend from the end of existing subscription
      fromDate = latestActiveInvoice.to_date;
    }

    const toDate = new Date(fromDate);
    
    // Calculate duration based on package duration type
    if (packageData.duration === 'month') {
      toDate.setMonth(toDate.getMonth() + 1);
    } else if (packageData.duration === 'year') {
      toDate.setFullYear(toDate.getFullYear() + 1);
    } else if (packageData.duration === 'order') {
      // Per-order subscriptions don't have an end date
      // They are valid until explicitly cancelled
      toDate.setFullYear(toDate.getFullYear() + 100); // Set far future date
    } else {
      // Legacy support: if duration is a number, treat as days
      const durationDays = parseInt(packageData.duration) || 30;
      toDate.setDate(toDate.getDate() + durationDays);
    }
    
    const toDateStr = toDate.toISOString().split('T')[0];
    const subscriptionEndsAt = toDate.toISOString();

    // Parse pay_details if it's a string
    let parsedPayDetails = pay_details;
    if (typeof pay_details === 'string') {
      try {
        parsedPayDetails = JSON.parse(pay_details);
      } catch (e) {
        parsedPayDetails = pay_details;
      }
    }

    // Create invoice with payment details and pending approval status
    const newInvoice = await Invoice.create({
      user_id: user_id,
      package_id: package_id, // Store package ID for reference
      from_date: fromDate,
      to_date: toDateStr,
      name: packageData.name,
      displayname: packageData.name, // Use name as displayname if not provided
      type: 'Paid',
      price: packageData.price || 0,
      duration: packageData.duration,
      payment_moj_id: payment_moj_id || null,
      payment_req_id: payment_req_id || null,
      pay_details: typeof parsedPayDetails === 'object' ? JSON.stringify(parsedPayDetails) : parsedPayDetails,
      approval_status: 'pending', // Set to pending - admin needs to approve
      approval_notes: null
    });

    console.log(`📝 Subscription invoice created with pending approval status for user ${user_id}`, {
      invoice_id: newInvoice.id,
      payment_moj_id: payment_moj_id,
      package_id: package_id
    });

    // Invalidate paid subscriptions cache so admin panel shows new payment immediately
    try {
      await RedisCache.delete(RedisCache.listKey('paid_subscriptions'));
      console.log('🗑️  Invalidated paid subscriptions cache after new payment');
    } catch (cacheErr) {
      console.error('Cache invalidation error:', cacheErr);
    }

    // Don't update shop subscription yet - wait for admin approval
    // Shop subscription will be activated when admin approves the subscription

    // Forward transaction to PHP admin panel (fire and forget)
    // This is done server-side to avoid mobile device connectivity issues
    // The Node.js backend can reach localhost, so this will work even if mobile app can't
    try {
      const adminPanelUrl = process.env.ADMIN_PANEL_URL || 'http://127.0.0.1:8000/paidSubscriptions';
      
      // Forward if admin panel URL is configured
      if (adminPanelUrl && adminPanelUrl.trim() !== '') {
        const http = require('http');
        const https = require('https');
        
        const transactionData = {
          userId: String(user_id),
          packageId: package_id,
          transactionId: payment_moj_id || '',
          transactionRef: payment_req_id || payment_moj_id || '',
          amount: String(packageData.price || 0),
          responseCode: '00',
          approvalRefNo: payment_req_id || payment_moj_id || '',
          paymentMethod: 'UPI',
        };
        
        const parsedUrl = new URL(adminPanelUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const postData = JSON.stringify(transactionData);
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 5000, // 5 second timeout
        };
        
        console.log('📤 Forwarding transaction to PHP admin panel:', {
          url: adminPanelUrl,
          userId: user_id,
          packageId: package_id,
          transactionId: payment_moj_id,
        });
        
        const req = client.request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200 || res.statusCode === 201) {
              try {
                const parsed = JSON.parse(responseData);
                if (parsed.success) {
                  console.log('✅ Transaction forwarded to PHP admin panel successfully');
                } else {
                  console.warn('⚠️ PHP admin panel returned error:', parsed.message);
                }
              } catch (e) {
                console.warn('⚠️ Failed to parse PHP admin panel response');
              }
            } else {
              console.warn(`⚠️ PHP admin panel returned status ${res.statusCode}`);
            }
          });
        });
        
        req.on('error', (err) => {
          console.warn('⚠️ Failed to forward transaction to PHP admin panel (non-critical):', err.message);
        });
        
        req.on('timeout', () => {
          req.destroy();
          console.warn('⚠️ Request to PHP admin panel timed out');
        });
        
        req.write(postData);
        req.end();
      }
    } catch (adminPanelErr) {
      // Don't fail the request if admin panel forwarding fails
      console.warn('⚠️ Error forwarding to PHP admin panel (non-critical):', adminPanelErr.message);
    }

    res.json({
  status: 'success',
  msg: 'Subscription saved successfully',
  data: {
    package_id: package_id,
    from_date: fromDate,
    to_date: toDateStr,
    subscription_ends_at: subscriptionEndsAt
  }
});
  } catch (error) {
    console.error('❌ Save user subscription error:', error);
    res.status(500).json({
      status: 'error',
      msg: 'Failed to save subscription: ' + error.message,
      data: null
    });
  }
};

