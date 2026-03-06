const SubscriptionPackage = require('../models/SubscriptionPackage');
const Invoice = require('../models/Invoice');
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');
const Address = require('../models/Address');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const ZONE_TABLE = 'district_pincode_prefixes';
const ZONE_CACHE_TTL_MS = 10 * 60 * 1000;
let zoneMappingsCache = {
  loadedAt: 0,
  prefixToZones: new Map()
};

function normalizeZoneFromEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const match = value.match(/^zone(\d{1,2})@scrapmate\.co\.in$/i);
  if (!match) return '';
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 48) return '';
  return `Z${String(n).padStart(2, '0')}`;
}

function normalizeZoneCode(zoneValue) {
  const raw = String(zoneValue || '').trim().toUpperCase();
  if (!raw) return '';
  const match = raw.match(/^(?:ZONE|Z)\s*0*(\d{1,2})$/);
  if (!match) return raw;
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 48) return raw;
  return `Z${String(n).padStart(2, '0')}`;
}

function getPrefix3(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 3 ? digits.slice(0, 3) : '';
}

function extractPincode(text) {
  const match = String(text || '').match(/\b(\d{6})\b/);
  return match ? match[1] : '';
}

async function loadZonePrefixMappings() {
  const now = Date.now();
  if ((now - zoneMappingsCache.loadedAt) < ZONE_CACHE_TTL_MS && zoneMappingsCache.prefixToZones.size > 0) {
    return zoneMappingsCache;
  }

  const { getDynamoDBClient } = require('../config/dynamodb');
  const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
  const client = getDynamoDBClient();
  const prefixToZones = new Map();
  let lastKey = null;

  const zoneCodeFromItem = (item) => {
    if (item.zone) return normalizeZoneCode(item.zone);
    if (item.zone_code) return normalizeZoneCode(item.zone_code);
    if (item.zone_no !== undefined && item.zone_no !== null && item.zone_no !== '') {
      const n = Number(item.zone_no);
      if (!Number.isNaN(n)) return `Z${String(n).padStart(2, '0')}`;
    }
    return '';
  };

  do {
    const response = await client.send(new ScanCommand({
      TableName: ZONE_TABLE,
      ProjectionExpression: 'pincode_prefixes, #z, zone_code, zone_no',
      ExpressionAttributeNames: { '#z': 'zone' },
      ExclusiveStartKey: lastKey || undefined
    }));

    for (const item of response.Items || []) {
      const zone = zoneCodeFromItem(item);
      if (!zone) continue;
      const prefixes = Array.isArray(item.pincode_prefixes) ? item.pincode_prefixes : [];
      for (const prefix of prefixes) {
        const key = getPrefix3(prefix);
        if (!key) continue;
        if (!prefixToZones.has(key)) prefixToZones.set(key, new Set());
        prefixToZones.get(key).add(zone);
      }
    }
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  zoneMappingsCache = {
    loadedAt: now,
    prefixToZones
  };
  return zoneMappingsCache;
}

async function resolveRequestZone(req) {
  const emailZone = normalizeZoneFromEmail(req.user?.email || req.headers['x-user-email'] || '');
  if (emailZone) return emailZone;

  const authHeader = String(req.headers?.authorization || '');
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  let tokenPayload = null;
  if (bearerToken) {
    try {
      tokenPayload = jwt.decode(bearerToken) || null;
    } catch (_) {
      tokenPayload = null;
    }
  }

  const mobileRaw = req.query.phoneNumber
    || req.query.phone
    || req.query.mobile
    || req.headers['x-user-phone']
    || req.headers['x-phone-number']
    || (tokenPayload ? (tokenPayload.phone_number || tokenPayload.mob_num || tokenPayload.phoneNumber) : '')
    || '';

  let tokenUser = null;
  const normalizedMobile = String(mobileRaw || '').replace(/\D/g, '');
  if (normalizedMobile) {
    try {
      tokenUser = await User.findByMobile(normalizedMobile);
    } catch (_) {
      tokenUser = null;
    }
  }

  const userIdRaw = req.query.userId
    || req.query.user_id
    || req.headers['x-user-id']
    || req.headers['user-id']
    || req.user?.id
    || req.user?.user_id
    || req.user?.customer_id
    || (tokenPayload ? (tokenPayload.id || tokenPayload.user_id || tokenPayload.customer_id) : '')
    || tokenUser?.id
    || '';
  const userId = typeof userIdRaw === 'string' && !isNaN(userIdRaw) ? parseInt(userIdRaw, 10) : userIdRaw;
  if (!userId) return '';

  try {
    const addresses = await Address.findByCustomerId(userId);
    const latest = Array.isArray(addresses) && addresses.length > 0 ? addresses[0] : null;
    const zone = normalizeZoneCode(Address.normalizeZone(latest?.zone || ''));
    if (zone) return zone;
  } catch (_) {}

  try {
    const shops = await Shop.findAllByUserId(userId);
    const shop = Array.isArray(shops) && shops.length > 0 ? shops[0] : null;
    if (!shop) return '';
    const explicitZone = normalizeZoneCode(Address.normalizeZone(shop.zone || ''));
    if (explicitZone) return explicitZone;
    const pincode = String(shop.pincode || extractPincode(shop.address || '')).trim();
    const prefix = getPrefix3(pincode);
    if (!prefix) return '';
    const mappings = await loadZonePrefixMappings();
    const candidates = mappings.prefixToZones.get(prefix);
    if (!candidates || candidates.size === 0) return '';
    return [...candidates].sort()[0];
  } catch (_) {
    return '';
  }
}

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
 * Get subscription packages for a specific user type (B2B, B2C, or Marketplace)
 * GET /api/v2/subscription-packages?userType=b2b|b2c|marketplace&language=en|hi|ta|te|...
 */
exports.getSubscriptionPackages = async (req, res) => {
  try {
    const { userType, language = 'en' } = req.query;
    const normalizedUserType = String(userType || '').trim().toLowerCase();
    const resolvedUserType =
      normalizedUserType === 'm' ? 'marketplace' : normalizedUserType;
    
    if (!resolvedUserType || !['b2b', 'b2c', 'marketplace'].includes(resolvedUserType)) {
      return res.status(400).json({
        status: 'error',
        message: 'userType query parameter is required and must be one of: "b2b", "b2c", "marketplace"',
      });
    }

    const requestZone = await resolveRequestZone(req);

    // Normalize language code (e.g., 'en-US' -> 'en')
    const langCode = language.split('-')[0].toLowerCase();
    
    const cacheKey = RedisCache.listKey(`subscription_packages_${resolvedUserType}_${langCode}`, { zone: requestZone || 'all' });
    
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
        const pkgUserType = String(pkg.userType).trim().toLowerCase();
        if (resolvedUserType === 'marketplace') {
          return pkgUserType === 'm' || pkgUserType === 'marketplace';
        }
        return pkgUserType === resolvedUserType;
      }
      
      // Legacy support: filter by package ID pattern
      // B2B packages: 'b2b-*'
      // B2C packages: 'b2c-*' or packages without 'b2b' in ID
      if (resolvedUserType === 'b2b') {
        return pkg.id.includes('b2b');
      } else if (resolvedUserType === 'b2c') {
        return pkg.id.includes('b2c') || (!pkg.id.includes('b2b') && (pkg.id === 'monthly' || pkg.id === 'yearly'));
      } else if (resolvedUserType === 'marketplace') {
        const normalizedId = String(pkg.id || '').toLowerCase();
        return normalizedId.includes('marketplace') || normalizedId.includes('market_place');
      }
      return false;
    });
    
    // Helper function to get translated field
    const getTranslatedField = (pkg, fieldName, defaultLang = 'en') => {
      // Check for language-specific field (e.g., name_en, name_hi, description_en, etc.)
      const langField = `${fieldName}_${langCode}`;
      const defaultLangField = `${fieldName}_${defaultLang}`;
      
      // Try language-specific field first
      if (pkg[langField] !== undefined && pkg[langField] !== null) {
        return pkg[langField];
      }
      
      // Try default language field
      if (pkg[defaultLangField] !== undefined && pkg[defaultLangField] !== null) {
        return pkg[defaultLangField];
      }
      
      // Fallback to base field (for backward compatibility)
      if (pkg[fieldName] !== undefined && pkg[fieldName] !== null) {
        return pkg[fieldName];
      }
      
      return null;
    };
    
    // For B2B per-order subscriptions, change from fixed 999 to 0.5% of order value
    const processedPackages = filteredPackages.map(pkg => {
      // Get translated fields
      const translatedName = getTranslatedField(pkg, 'name') || pkg.name;
      const translatedDescription = getTranslatedField(pkg, 'description') || pkg.description || '';
      
      // Handle features translation (can be array or object with language keys)
      let translatedFeatures = pkg.features || [];
      if (Array.isArray(translatedFeatures)) {
        // If features is an array, check if there's a language-specific version
        const langFeatures = pkg[`features_${langCode}`];
        if (langFeatures && Array.isArray(langFeatures)) {
          translatedFeatures = langFeatures;
        }
      } else if (typeof translatedFeatures === 'object') {
        // If features is an object with language keys
        translatedFeatures = translatedFeatures[langCode] || translatedFeatures['en'] || [];
      }
      
      // Build translated package
      const translatedPkg = {
        ...pkg,
        name: translatedName,
        description: translatedDescription,
        features: translatedFeatures,
      };

      if (requestZone && pkg.zonePrices && pkg.zonePrices[requestZone] && pkg.zonePrices[requestZone].price !== undefined) {
        const zonePrice = Number(pkg.zonePrices[requestZone].price);
        if (!Number.isNaN(zonePrice)) {
          translatedPkg.price = zonePrice;
        }
      }
      
      // If it's a B2B per-order subscription, modify the price to indicate percentage-based pricing
      if (resolvedUserType === 'b2b' && pkg.duration === 'order') {
        // Use stored percentage if available, otherwise default to 0.5%
        const pricePercentage = pkg.pricePercentage !== undefined && pkg.pricePercentage !== null 
          ? pkg.pricePercentage 
          : 0.5; // Default to 0.5% if not set
        
        return {
          ...translatedPkg,
          price: 0, // Set price to 0 for percentage-based plans (will be calculated per order)
          pricePercentage: pricePercentage, // Percentage of order value (0.5 = 0.5%)
          originalPrice: pkg.price, // Keep original price for reference
          isPercentageBased: pkg.isPercentageBased !== undefined ? pkg.isPercentageBased : true
        };
      }
      return translatedPkg;
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

    const packageUserType = String(packageData.userType || '').trim().toLowerCase();
    const normalizedPackageId = String(package_id || '').trim().toLowerCase();
    const isMarketplacePackage =
      packageUserType === 'm' ||
      packageUserType === 'marketplace' ||
      normalizedPackageId.includes('marketplace') ||
      normalizedPackageId.includes('market_place');

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

    // Fetch shop info to include shopname in invoice
    const Shop = require('../models/Shop');
    let shopname = null;
    try {
      const allShops = await Shop.findAllByUserId(user_id);
      const shop = allShops.find(s => s.shop_type === 3 || s.shop_type === 1); // B2C or B2B
      if (shop) {
        shopname = shop.shopname || null;
      }
    } catch (shopErr) {
      console.warn(`⚠️  Could not fetch shop for user ${user_id}:`, shopErr.message);
    }

    // Marketplace subscriptions are auto-approved instantly.
    // B2B/B2C keep admin review flow (pending).
    const approvalStatus = isMarketplacePackage ? 'approved' : 'pending';
    const approvedAt = isMarketplacePackage ? new Date().toISOString() : null;

    // Create invoice with payment details and approval status
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
      approval_status: approvalStatus,
      approval_notes: null,
      approved_at: approvedAt,
      shopname: shopname // Store shopname for display in admin panel
    });

    console.log(`📝 Subscription invoice created for user ${user_id}`, {
      invoice_id: newInvoice.id,
      payment_moj_id: payment_moj_id,
      package_id: package_id,
      approval_status: approvalStatus,
    });

    // Invalidate paid subscriptions cache so admin panel shows new payment immediately
    try {
      await RedisCache.delete(RedisCache.listKey('paid_subscriptions'));
      console.log('🗑️  Invalidated paid subscriptions cache after new payment');
    } catch (cacheErr) {
      console.error('Cache invalidation error:', cacheErr);
    }

    // Activate marketplace subscription instantly (no admin review)
    if (isMarketplacePackage) {
      try {
        await User.updateProfile(user_id, {
          isMarketPlaceSubscribed: true,
          is_marketplace_subscribed: true,
          marketplace_subscription_ends_at: subscriptionEndsAt,
          marketplace_subscribed_duration: packageData.duration,
        });
        console.log(`✅ Marketplace subscription auto-approved for user ${user_id}`);
      } catch (marketplaceErr) {
        console.error('❌ Failed to auto-activate marketplace subscription:', marketplaceErr);
      }
    } else {
      // Don't update B2B/B2C subscription yet - wait for admin approval
      // Shop subscription will be activated when admin approves the subscription
    }

    // Forward transaction to PHP admin panel (fire and forget)
    // This is done server-side to avoid mobile device connectivity issues
    // Use production admin panel URL by default, fallback to localhost for development
    try {
      const adminPanelUrl = process.env.ADMIN_PANEL_URL || 
        (process.env.NODE_ENV === 'production' 
          ? 'https://mono.scrapmate.co.in/paidSubscriptions'
          : 'http://127.0.0.1:8000/paidSubscriptions');
      
      // Forward if admin panel URL is configured
      if (!isMarketplacePackage && adminPanelUrl && adminPanelUrl.trim() !== '') {
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

    // Invalidate user profile caches so app immediately sees invoices/subscription flags.
    try {
      await RedisCache.delete(RedisCache.userKey(String(user_id), 'profile'));
      await RedisCache.delete(RedisCache.userKey(String(user_id)));
      console.log(`🗑️  Invalidated profile cache for user ${user_id} after subscription save`);
    } catch (profileCacheErr) {
      console.error('Profile cache invalidation error:', profileCacheErr);
    }

    res.json({
  status: 'success',
  msg: isMarketplacePackage
    ? 'Marketplace subscription activated successfully'
    : 'Subscription saved successfully',
  data: {
    package_id: package_id,
    from_date: fromDate,
    to_date: toDateStr,
    subscription_ends_at: subscriptionEndsAt,
    approval_status: approvalStatus,
    auto_approved: isMarketplacePackage
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
